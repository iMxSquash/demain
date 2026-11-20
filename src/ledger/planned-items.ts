import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";

import type { PlannedSchedule } from "../domain/occurrences";
import {
  fromRepetition,
  isPlannedItemOver,
  toRepetition,
  validatePlannedItemDetails,
  validatePlannedItemEndDate,
  validatePlannedItemInput,
  validatePlannedItemVersion,
  type PlannedItemDetails,
  type PlannedItemInput,
  type PlannedItemVersionInput,
} from "../domain/planned-item";
import type { AppDatabase } from "../storage/database";
import {
  accounts,
  categories,
  occurrenceOverrides,
  plannedItems,
  plannedItemVersions,
  transactions,
} from "../storage/schema";

export type PlannedItem = typeof plannedItems.$inferSelect;
export type PlannedItemVersion = typeof plannedItemVersions.$inferSelect;
export type StoredOccurrenceOverride = typeof occurrenceOverrides.$inferSelect;

/** An item with its versions sorted by effective date and its overrides. */
export type PlannedItemWithDetails = PlannedItem & {
  versions: PlannedItemVersion[];
  overrides: StoredOccurrenceOverride[];
};

type Reader = Pick<AppDatabase, "select">;

export class PlannedItemNotFoundError extends Error {
  constructor(id: number) {
    super(`Planned item ${id} does not exist`);
    this.name = "PlannedItemNotFoundError";
  }
}

function attachDetails(db: Reader, items: PlannedItem[]): PlannedItemWithDetails[] {
  if (items.length === 0) return [];
  const ids = items.map((item) => item.id);
  const versions = Map.groupBy(
    db
      .select()
      .from(plannedItemVersions)
      .where(inArray(plannedItemVersions.plannedItemId, ids))
      .orderBy(asc(plannedItemVersions.effectiveFrom))
      .all(),
    (version) => version.plannedItemId,
  );
  const overrides = Map.groupBy(
    db
      .select()
      .from(occurrenceOverrides)
      .where(inArray(occurrenceOverrides.plannedItemId, ids))
      .orderBy(asc(occurrenceOverrides.nominalDate))
      .all(),
    (override) => override.plannedItemId,
  );
  return items.map((item) => ({
    ...item,
    versions: versions.get(item.id) ?? [],
    overrides: overrides.get(item.id) ?? [],
  }));
}

export function getPlannedItem(db: Reader, id: number): PlannedItemWithDetails {
  const item = db.select().from(plannedItems).where(eq(plannedItems.id, id)).get();
  if (item === undefined) throw new PlannedItemNotFoundError(id);
  return attachDetails(db, [item])[0]!;
}

export function listPlannedItems(
  db: Reader,
  { includeCancelled, accountIds }: { includeCancelled: boolean; accountIds?: readonly number[] },
): PlannedItemWithDetails[] {
  const rows = db
    .select()
    .from(plannedItems)
    .where(
      and(
        includeCancelled ? undefined : eq(plannedItems.cancelled, false),
        accountIds === undefined ? undefined : inArray(plannedItems.accountId, [...accountIds]),
      ),
    )
    .orderBy(asc(plannedItems.id))
    .all();
  return attachDetails(db, rows);
}

/**
 * Validates an item, then writes it and its first version, effective from its start date, in one
 * transaction: both are recorded or neither is.
 */
export function createPlannedItem(db: AppDatabase, input: PlannedItemInput): PlannedItemWithDetails {
  return db.transaction((tx) => {
    const valid = validatePlannedItemInput(input, {
      accounts: tx.select().from(accounts).all(),
      categories: tx.select().from(categories).all(),
    });
    const { kind: repetitionKind, value: repetitionValue } = fromRepetition(valid.repetition);
    const item = tx
      .insert(plannedItems)
      .values({
        name: valid.name,
        kind: valid.kind,
        accountId: valid.accountId,
        destinationAccountId: valid.destinationAccountId,
        categoryId: valid.categoryId,
        startDate: valid.startDate,
        endDate: valid.endDate,
        acceptsMultipleTransactions: valid.acceptsMultipleTransactions,
        provisionLabelFilter: valid.provisionLabelFilter,
        matchWindowDays: valid.matchWindowDays,
        matchAmountToleranceBp: valid.matchAmountToleranceBp,
      })
      .returning({ id: plannedItems.id })
      .get();
    tx.insert(plannedItemVersions)
      .values({
        plannedItemId: item.id,
        effectiveFrom: valid.startDate,
        repetitionKind,
        repetitionValue,
        businessDayRule: valid.businessDayRule,
        amount: valid.amount,
        amountMode: valid.amountMode,
        averageWindow: valid.averageWindow,
      })
      .run();
    return getPlannedItem(tx, item.id);
  });
}

/**
 * Changes the name, category, matching window, tolerance and label filter of an item. Amounts and
 * schedules change through versions.
 */
export function updatePlannedItemDetails(
  db: AppDatabase,
  id: number,
  details: PlannedItemDetails,
): PlannedItemWithDetails {
  return db.transaction((tx) => {
    const item = getPlannedItem(tx, id);
    const valid = validatePlannedItemDetails(details, item, tx.select().from(categories).all());
    tx.update(plannedItems).set(valid).where(eq(plannedItems.id, id)).run();
    return getPlannedItem(tx, id);
  });
}

/** Maps a stored item to the schedule the occurrence generator reads. */
export function toPlannedSchedule(item: PlannedItemWithDetails): PlannedSchedule {
  return {
    startDate: item.startDate,
    endDate: item.endDate,
    cancelled: item.cancelled,
    versions: item.versions.map((version) => ({
      effectiveFrom: version.effectiveFrom,
      repetition: toRepetition(version.repetitionKind, version.repetitionValue),
      businessDayRule: version.businessDayRule,
      amount: version.amount,
      amountMode: version.amountMode,
      averageWindow: version.averageWindow,
    })),
  };
}

/**
 * The names of the planned items that keep an account in use: it is their account or their
 * destination and they are not over at `today` (DOMAIN, archiving an account).
 */
export function listItemsBlockingArchive(
  db: AppDatabase,
  accountId: number,
  today: string,
): string[] {
  const targeting = db
    .select()
    .from(plannedItems)
    .where(
      or(eq(plannedItems.accountId, accountId), eq(plannedItems.destinationAccountId, accountId)),
    )
    .orderBy(asc(plannedItems.id))
    .all();
  return attachDetails(db, targeting)
    .filter((item) => !isPlannedItemOver(toPlannedSchedule(item), item.overrides, today))
    .map((item) => item.name);
}

/**
 * Adds a version effective from a date, or replaces the one that already has this date. Refused
 * when it would rewrite an occurrence that is settled or overridden.
 */
export function addPlannedItemVersion(
  db: AppDatabase,
  itemId: number,
  input: PlannedItemVersionInput,
): { item: PlannedItemWithDetails; replaced: boolean } {
  return db.transaction((tx) => {
    const current = getPlannedItem(tx, itemId);
    // Read in the same transaction as the write: a match recorded in between cannot slip through.
    const settledNominalDates = tx
      .select({ occurrenceDate: transactions.occurrenceDate })
      .from(transactions)
      .where(and(eq(transactions.plannedItemId, itemId), isNotNull(transactions.occurrenceDate)))
      .all()
      .flatMap(({ occurrenceDate }) => (occurrenceDate === null ? [] : [occurrenceDate]));
    const account = tx
      .select({ archived: accounts.archived })
      .from(accounts)
      .where(eq(accounts.id, current.accountId))
      .get();
    const valid = validatePlannedItemVersion(input, {
      item: { ...toPlannedSchedule(current), kind: current.kind },
      accountArchived: account?.archived ?? false,
      settledNominalDates,
      overrides: current.overrides,
    });
    const { kind: repetitionKind, value: repetitionValue } = fromRepetition(valid.repetition);
    const stored = {
      repetitionKind,
      repetitionValue,
      businessDayRule: valid.businessDayRule,
      amount: valid.amount,
      amountMode: valid.amountMode,
      averageWindow: valid.averageWindow,
    };
    tx.insert(plannedItemVersions)
      .values({ plannedItemId: itemId, effectiveFrom: valid.effectiveFrom, ...stored })
      .onConflictDoUpdate({
        target: [plannedItemVersions.plannedItemId, plannedItemVersions.effectiveFrom],
        set: stored,
      })
      .run();
    return { item: getPlannedItem(tx, itemId), replaced: valid.replaces };
  });
}

export function setPlannedItemEnd(
  db: AppDatabase,
  itemId: number,
  endDate: string | null,
): PlannedItemWithDetails {
  return db.transaction((tx) => {
    const item = getPlannedItem(tx, itemId);
    const valid = validatePlannedItemEndDate(endDate, toPlannedSchedule(item));
    tx.update(plannedItems).set({ endDate: valid }).where(eq(plannedItems.id, itemId)).run();
    return getPlannedItem(tx, itemId);
  });
}

export function cancelPlannedItem(db: AppDatabase, itemId: number): PlannedItemWithDetails {
  return db.transaction((tx) => {
    const { changes } = tx
      .update(plannedItems)
      .set({ cancelled: true })
      .where(eq(plannedItems.id, itemId))
      .run();
    if (changes === 0) throw new PlannedItemNotFoundError(itemId);
    return getPlannedItem(tx, itemId);
  });
}
