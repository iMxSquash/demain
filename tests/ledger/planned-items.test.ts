import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateOccurrences } from "../../src/domain/occurrences";
import {
  PlannedItemValidationError,
  type PlannedItemInput,
  type PlannedItemVersionInput,
} from "../../src/domain/planned-item";
import { createAccount } from "../../src/ledger/accounts";
import type { PlannedItemWithDetails } from "../../src/ledger/planned-items";
import {
  addPlannedItemVersion,
  cancelPlannedItem,
  createPlannedItem,
  getPlannedItem,
  listPlannedItems,
  PlannedItemNotFoundError,
  setPlannedItemEnd,
  toPlannedSchedule,
  updatePlannedItemDetails,
} from "../../src/ledger/planned-items";
import { createTransaction } from "../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";
import {
  accounts,
  occurrenceOverrides,
  plannedItems,
  plannedItemVersions,
  transactions,
} from "../../src/storage/schema";

const CHECKING_INPUT = {
  name: "Checking",
  kind: "checking",
  currency: "EUR",
  openingDate: "2026-01-01",
  openingBalance: 100_000,
};

const LAST_MIGRATION_BEFORE_PLANNED_ITEMS = "0012_category_icon";

/** A database as the release before planned items left it: migrations up to the given tag. */
function migrateUpTo(db: AppDatabase, workDir: string, lastTag: string): void {
  const source = path.join(process.cwd(), "drizzle");
  const target = path.join(workDir, "older-migrations");
  mkdirSync(path.join(target, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(path.join(source, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.slice(
    0,
    journal.entries.findIndex(({ tag }) => tag === lastTag) + 1,
  );
  writeFileSync(path.join(target, "meta", "_journal.json"), JSON.stringify(journal));
  for (const { tag } of journal.entries) {
    cpSync(path.join(source, `${tag}.sql`), path.join(target, `${tag}.sql`));
  }
  migrate(drizzle(db.$client), { migrationsFolder: target });
}

describe("planned items", () => {
  let dataDir: string;
  let db: AppDatabase;
  let accountId: number;
  let rent: PlannedItemInput;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    accountId = createAccount(db, CHECKING_INPUT).id;
    rent = {
      name: "Rent",
      kind: "expense",
      accountId,
      startDate: "2026-01-05",
      repetition: { kind: "monthly_on_day", day: 5 },
      amount: -80_000,
    };
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("creates an item and its first version in one transaction", () => {
    const item = createPlannedItem(db, rent);

    expect(item).toMatchObject({
      name: "Rent",
      kind: "expense",
      accountId,
      cancelled: false,
      matchWindowDays: 5,
      matchAmountToleranceBp: 500,
      overrides: [],
    });
    expect(item.versions).toEqual([
      expect.objectContaining({
        plannedItemId: item.id,
        effectiveFrom: "2026-01-05",
        repetitionKind: "monthly_on_day",
        repetitionValue: 5,
        businessDayRule: "none",
        amount: -80_000,
        amountMode: "fixed",
        averageWindow: 3,
      }),
    ]);
    expect(getPlannedItem(db, item.id)).toEqual(item);
  });

  it("writes nothing when the input is refused", () => {
    expect(() => createPlannedItem(db, { ...rent, amount: 0 })).toThrow(
      PlannedItemValidationError,
    );

    expect(db.select().from(plannedItems).all()).toEqual([]);
    expect(db.select().from(plannedItemVersions).all()).toEqual([]);
  });

  it("writes neither the item nor a version when the version insert fails", () => {
    db.$client.exec("drop table planned_item_versions");

    expect(() => createPlannedItem(db, rent)).toThrow();

    expect(db.select().from(plannedItems).all()).toEqual([]);
  });

  it("refuses a second version on the same effective date", () => {
    const item = createPlannedItem(db, rent);

    expect(() =>
      db
        .insert(plannedItemVersions)
        .values({ plannedItemId: item.id, effectiveFrom: "2026-01-05", amount: -90_000 })
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it("refuses a second override on the same nominal date", () => {
    const item = createPlannedItem(db, rent);
    const override = { plannedItemId: item.id, nominalDate: "2026-02-05", status: "cancelled" } as const;
    db.insert(occurrenceOverrides).values(override).run();

    expect(() => db.insert(occurrenceOverrides).values(override).run()).toThrow(/UNIQUE/);
  });

  it("lists items without the cancelled ones unless asked", () => {
    const kept = createPlannedItem(db, rent);
    const cancelled = createPlannedItem(db, { ...rent, name: "Gym" });
    db.update(plannedItems).set({ cancelled: true }).where(eq(plannedItems.id, cancelled.id)).run();

    expect(listPlannedItems(db, { includeCancelled: false }).map((item) => item.id)).toEqual([
      kept.id,
    ]);
    expect(listPlannedItems(db, { includeCancelled: true }).map((item) => item.id)).toEqual([
      kept.id,
      cancelled.id,
    ]);
  });

  it("returns the versions sorted and the overrides of an item", () => {
    const item = createPlannedItem(db, rent);
    db.insert(plannedItemVersions)
      .values([
        { plannedItemId: item.id, effectiveFrom: "2026-06-05", amount: -90_000 },
        { plannedItemId: item.id, effectiveFrom: "2026-03-05", amount: -85_000 },
      ])
      .run();
    db.insert(occurrenceOverrides)
      .values({ plannedItemId: item.id, nominalDate: "2026-02-05", status: "cancelled" })
      .run();

    const stored = getPlannedItem(db, item.id);

    expect(stored.versions.map((version) => version.effectiveFrom)).toEqual([
      "2026-01-05",
      "2026-03-05",
      "2026-06-05",
    ]);
    expect(stored.overrides).toHaveLength(1);
  });

  it("throws for a missing item", () => {
    expect(() => getPlannedItem(db, 999)).toThrow(PlannedItemNotFoundError);
    expect(() => updatePlannedItemDetails(db, 999, details())).toThrow(PlannedItemNotFoundError);
  });

  it("maps a stored item to the schedule of the domain", () => {
    const item = createPlannedItem(db, rent);

    const occurrences = generateOccurrences(
      toPlannedSchedule(item),
      [],
      { from: "2026-01-01", to: "2026-03-31" },
      "2026-01-01",
    );

    expect(occurrences.map((occurrence) => [occurrence.date, occurrence.amount])).toEqual([
      ["2026-01-05", -80_000],
      ["2026-02-05", -80_000],
      ["2026-03-05", -80_000],
    ]);
  });

  it("updates the details of an item and nothing else", () => {
    const item = createPlannedItem(db, rent);

    const updated = updatePlannedItemDetails(db, item.id, {
      ...details(),
      name: "Flat rent",
      matchWindowDays: 7,
      matchAmountToleranceBp: 0,
    });

    expect(updated).toMatchObject({ name: "Flat rent", matchWindowDays: 7, matchAmountToleranceBp: 0 });
    expect(updated.versions).toEqual(item.versions);
    expect(updated.startDate).toBe(item.startDate);
  });

  it("refuses details that break the rules and keeps the item", () => {
    const item = createPlannedItem(db, rent);

    expect(() => updatePlannedItemDetails(db, item.id, { ...details(), name: " " })).toThrow(
      PlannedItemValidationError,
    );

    expect(getPlannedItem(db, item.id)).toEqual(item);
  });

  it("leaves existing transactions untouched", () => {
    const transaction = createTransaction(db, {
      accountId,
      date: "2026-01-10",
      amount: -1_000,
      kind: "expense",
      label: "Groceries",
    });

    const stored = db.select().from(transactions).where(eq(transactions.id, transaction.id)).get();

    expect(stored).toMatchObject({
      plannedItemId: null,
      occurrenceDate: null,
      categoryFromPlannedItem: false,
    });
  });

  it("applies on a database at 0012 and keeps its transactions unlinked", () => {
    const olderDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    try {
      const older = openDatabase(olderDir);
      migrateUpTo(older, olderDir, LAST_MIGRATION_BEFORE_PLANNED_ITEMS);
      older.$client.exec(
        `insert into accounts (name, kind, currency, opening_date, opening_balance) values ('Checking', 'checking', 'EUR', '2026-01-01', 0);
         insert into transactions (account_id, date, amount, kind, label) values (1, '2026-01-10', -1000, 'expense', 'Groceries');`,
      );

      migrateDatabase(older);

      expect(older.select().from(transactions).all()).toEqual([
        expect.objectContaining({
          label: "Groceries",
          plannedItemId: null,
          occurrenceDate: null,
          categoryFromPlannedItem: false,
        }),
      ]);
      older.$client.close();
    } finally {
      rmSync(olderDir, { recursive: true, force: true });
    }
  });

  describe("versions, end date and cancellation", () => {
    const TODAY = "2026-01-01";

    function occurrencesOf(item: PlannedItemWithDetails, to = "2026-08-31") {
      return generateOccurrences(
        toPlannedSchedule(item),
        item.overrides,
        { from: "2026-01-01", to },
        TODAY,
      ).map((occurrence) => [occurrence.date, occurrence.amount] as const);
    }

    function versionCount(): number {
      return db.select().from(plannedItemVersions).all().length;
    }

    function refusalOf(action: () => unknown): PlannedItemValidationError {
      try {
        action();
      } catch (error) {
        if (error instanceof PlannedItemValidationError) return error;
        throw error;
      }
      throw new Error("The action was accepted");
    }

    function expectRefused(
      itemId: number,
      input: PlannedItemVersionInput,
      field: string,
      key: string,
    ): PlannedItemValidationError {
      const before = versionCount();
      const error = refusalOf(() => addPlannedItemVersion(db, itemId, input));
      expect(error.field).toBe(field);
      expect(error.ref.key).toBe(key);
      expect(versionCount()).toBe(before);
      return error;
    }

    function settle(itemId: number, nominalDate: string): void {
      const transaction = createTransaction(db, {
        accountId,
        date: nominalDate,
        amount: -80_000,
        kind: "expense",
        label: "Rent",
      });
      db.update(transactions)
        .set({ plannedItemId: itemId, occurrenceDate: nominalDate })
        .where(eq(transactions.id, transaction.id))
        .run();
    }

    function override(itemId: number, nominalDate: string): void {
      db.insert(occurrenceOverrides)
        .values({ plannedItemId: itemId, nominalDate, status: "cancelled" })
        .run();
    }

    const rentFrom = (effectiveFrom: string, extra: Partial<PlannedItemVersionInput> = {}) => ({
      effectiveFrom,
      repetition: { kind: "monthly_on_day", day: 5 } as const,
      amount: -90_000,
      ...extra,
    });

    it("applies a salary raise from its month and leaves the months before untouched", () => {
      const salary = createPlannedItem(db, {
        ...rent,
        name: "Salary",
        kind: "income",
        startDate: "2026-01-25",
        repetition: { kind: "monthly_on_day", day: 25 },
        amount: 114_388,
      });

      const { item } = addPlannedItemVersion(db, salary.id, {
        effectiveFrom: "2026-06-25",
        repetition: { kind: "monthly_on_day", day: 25 },
        amount: 117_147,
      });

      expect(occurrencesOf(item)).toEqual([
        ["2026-01-25", 114_388],
        ["2026-02-25", 114_388],
        ["2026-03-25", 114_388],
        ["2026-04-25", 114_388],
        ["2026-05-25", 114_388],
        ["2026-06-25", 117_147],
        ["2026-07-25", 117_147],
        ["2026-08-25", 117_147],
      ]);
    });

    it("moves the rent from the 5th to the 1st from March", () => {
      const item = createPlannedItem(db, rent);

      const { item: moved } = addPlannedItemVersion(db, item.id, {
        effectiveFrom: "2026-03-01",
        repetition: { kind: "monthly_on_day", day: 1 },
        amount: -80_000,
      });

      expect(occurrencesOf(moved, "2026-04-30").map(([date]) => date)).toEqual([
        "2026-01-05",
        "2026-02-05",
        "2026-03-01",
        "2026-04-01",
      ]);
    });

    it("keeps the occurrences before the effective date identical", () => {
      const item = createPlannedItem(db, rent);
      const before = occurrencesOf(item).filter(([date]) => date < "2026-04-01");

      const { item: changed } = addPlannedItemVersion(db, item.id, rentFrom("2026-04-01"));

      expect(occurrencesOf(changed).filter(([date]) => date < "2026-04-01")).toEqual(before);
    });

    it("refuses an effective date before the start date", () => {
      const item = createPlannedItem(db, rent);

      const error = expectRefused(
        item.id,
        rentFrom("2025-12-31"),
        "effectiveFrom",
        "plannedItemVersionBeforeStart",
      );

      expect(error.ref.values).toEqual({ date: "2026-01-05" });
    });

    it("refuses an effective date after the end date", () => {
      const item = createPlannedItem(db, { ...rent, endDate: "2026-06-30" });

      const error = expectRefused(
        item.id,
        rentFrom("2026-07-01"),
        "effectiveFrom",
        "plannedItemVersionAfterEnd",
      );

      expect(error.ref.values).toEqual({ date: "2026-06-30" });
    });

    it("refuses a zero amount", () => {
      const item = createPlannedItem(db, rent);

      expectRefused(item.id, rentFrom("2026-04-01", { amount: 0 }), "amount", "transactionAmountNonZero");
    });

    it("refuses a version on a cancelled item", () => {
      const item = createPlannedItem(db, rent);
      db.update(plannedItems).set({ cancelled: true }).where(eq(plannedItems.id, item.id)).run();

      expectRefused(item.id, rentFrom("2026-04-01"), "effectiveFrom", "plannedItemVersionOnCancelled");
    });

    it("refuses a version on an item whose account is archived", () => {
      const item = createPlannedItem(db, rent);
      db.update(accounts).set({ archived: true }).where(eq(accounts.id, accountId)).run();

      expectRefused(item.id, rentFrom("2026-04-01"), "effectiveFrom", "plannedItemAccountArchived");
    });

    it("refuses a repetition on a one-off item", () => {
      const oneOff = createPlannedItem(db, { ...rent, startDate: "2026-03-10", repetition: null });

      expectRefused(
        oneOff.id,
        rentFrom("2026-04-01"),
        "repetition",
        "plannedItemVersionRepeatsOneOff",
      );
    });

    it("throws for a version on a missing item and writes nothing", () => {
      expect(() => addPlannedItemVersion(db, 999, rentFrom("2026-04-01"))).toThrow(
        PlannedItemNotFoundError,
      );
      expect(versionCount()).toBe(0);
    });

    it("refuses an end date before the start date", () => {
      const item = createPlannedItem(db, rent);

      const error = refusalOf(() => setPlannedItemEnd(db, item.id, "2026-01-04"));

      expect(error.field).toBe("endDate");
      expect(error.ref.key).toBe("plannedItemEndBeforeStart");
      expect(getPlannedItem(db, item.id).endDate).toBeNull();
    });

    it("stops the occurrences at the end date", () => {
      const item = createPlannedItem(db, rent);

      const bounded = setPlannedItemEnd(db, item.id, "2026-03-31");

      expect(bounded.endDate).toBe("2026-03-31");
      expect(occurrencesOf(bounded).map(([date]) => date)).toEqual([
        "2026-01-05",
        "2026-02-05",
        "2026-03-05",
      ]);
    });

    it("clears the end date with null", () => {
      const item = createPlannedItem(db, { ...rent, endDate: "2026-03-31" });

      const cleared = setPlannedItemEnd(db, item.id, null);

      expect(cleared.endDate).toBeNull();
      expect(occurrencesOf(cleared)).toHaveLength(8);
    });

    it("refuses an end date on a one-off item", () => {
      const oneOff = createPlannedItem(db, { ...rent, startDate: "2026-03-10", repetition: null });

      const error = refusalOf(() => setPlannedItemEnd(db, oneOff.id, "2026-12-31"));

      expect(error.field).toBe("endDate");
      expect(error.ref.key).toBe("plannedItemOneOffHasNoEndDate");
      expect(getPlannedItem(db, oneOff.id).endDate).toBeNull();
    });

    it("cancels an item so that nothing remains after today", () => {
      const item = createPlannedItem(db, rent);
      const today = "2026-03-10";

      const cancelled = cancelPlannedItem(db, item.id);

      expect(cancelled.cancelled).toBe(true);
      expect(getPlannedItem(db, item.id).cancelled).toBe(true);
      const upcoming = generateOccurrences(
        toPlannedSchedule(cancelled),
        cancelled.overrides,
        { from: today, to: "2026-12-31" },
        today,
      ).filter((occurrence) => !occurrence.isCancelled);
      expect(upcoming).toEqual([]);
    });

    it("cancels an item twice without error", () => {
      const item = createPlannedItem(db, rent);
      cancelPlannedItem(db, item.id);

      expect(cancelPlannedItem(db, item.id).cancelled).toBe(true);
    });

    it("throws for a missing item on the end date and the cancellation", () => {
      expect(() => setPlannedItemEnd(db, 999, null)).toThrow(PlannedItemNotFoundError);
      expect(() => cancelPlannedItem(db, 999)).toThrow(PlannedItemNotFoundError);
    });

    it("refuses an effective date on or before a settled occurrence and names the earliest date", () => {
      const item = createPlannedItem(db, rent);
      settle(item.id, "2026-03-05");

      const error = expectRefused(
        item.id,
        rentFrom("2026-03-01"),
        "effectiveFrom",
        "plannedItemVersionTooEarly",
      );

      expect(error.ref.values).toEqual({ date: "2026-03-06" });
    });

    it("refuses a version on the date of a settled occurrence", () => {
      const item = createPlannedItem(db, rent);
      settle(item.id, "2026-03-05");

      expectRefused(item.id, rentFrom("2026-03-05"), "effectiveFrom", "plannedItemVersionTooEarly");
    });

    it("refuses an effective date on or before an overridden occurrence", () => {
      const item = createPlannedItem(db, rent);
      override(item.id, "2026-03-05");

      const error = expectRefused(
        item.id,
        rentFrom("2026-02-20"),
        "effectiveFrom",
        "plannedItemVersionTooEarly",
      );

      expect(error.ref.values).toEqual({ date: "2026-03-06" });
    });

    it("names the day after the latest blocking date", () => {
      const item = createPlannedItem(db, rent);
      settle(item.id, "2026-03-05");
      override(item.id, "2026-05-05");

      const error = expectRefused(
        item.id,
        rentFrom("2026-02-01"),
        "effectiveFrom",
        "plannedItemVersionTooEarly",
      );

      expect(error.ref.values).toEqual({ date: "2026-05-06" });
    });

    it("accepts a past effective date when nothing is settled or overridden after it", () => {
      const item = createPlannedItem(db, rent);
      settle(item.id, "2026-01-05");

      const { item: changed, replaced } = addPlannedItemVersion(db, item.id, rentFrom("2026-02-01"));

      expect(replaced).toBe(false);
      expect(changed.versions.map((version) => version.effectiveFrom)).toEqual([
        "2026-01-05",
        "2026-02-01",
      ]);
    });

    it("replaces the first version when a version starts on the start date and nothing is settled", () => {
      const item = createPlannedItem(db, rent);

      const { item: changed, replaced } = addPlannedItemVersion(db, item.id, rentFrom("2026-01-05"));

      expect(replaced).toBe(true);
      expect(versionCount()).toBe(1);
      expect(changed.versions).toEqual([
        expect.objectContaining({ effectiveFrom: "2026-01-05", amount: -90_000 }),
      ]);
    });

    it("refuses to replace the first version when its occurrence is settled", () => {
      const item = createPlannedItem(db, rent);
      settle(item.id, "2026-01-05");

      expectRefused(item.id, rentFrom("2026-01-05"), "effectiveFrom", "plannedItemVersionTooEarly");
    });

    it("replaces a version that has the same effective date", () => {
      const item = createPlannedItem(db, rent);
      addPlannedItemVersion(db, item.id, rentFrom("2026-04-01", { amount: -85_000 }));

      const { item: changed, replaced } = addPlannedItemVersion(
        db,
        item.id,
        rentFrom("2026-04-01", { amount: -95_000 }),
      );

      expect(replaced).toBe(true);
      expect(versionCount()).toBe(2);
      expect(changed.versions.map((version) => version.amount)).toEqual([-80_000, -95_000]);
    });

    it("reports a new effective date as not replaced", () => {
      const item = createPlannedItem(db, rent);

      const { replaced } = addPlannedItemVersion(db, item.id, rentFrom("2026-04-01"));

      expect(replaced).toBe(false);
      expect(versionCount()).toBe(2);
    });

    it("persists the amount mode and the average window of a new version", () => {
      const item = createPlannedItem(db, rent);

      const { item: changed } = addPlannedItemVersion(
        db,
        item.id,
        rentFrom("2026-04-01", { amountMode: "rolling_average", averageWindow: 6 }),
      );

      expect(changed.versions[1]).toMatchObject({ amountMode: "rolling_average", averageWindow: 6 });
      expect(getPlannedItem(db, item.id)?.versions[1]).toMatchObject({
        amountMode: "rolling_average",
        averageWindow: 6,
      });
    });

    it("inherits the amount mode and the average window of the version in effect", () => {
      const item = createPlannedItem(db, rent);
      db.update(plannedItemVersions)
        .set({ amountMode: "rolling_average", averageWindow: 6 })
        .where(eq(plannedItemVersions.plannedItemId, item.id))
        .run();

      const { item: changed } = addPlannedItemVersion(db, item.id, rentFrom("2026-04-01"));

      expect(changed.versions[1]).toMatchObject({
        effectiveFrom: "2026-04-01",
        amountMode: "rolling_average",
        averageWindow: 6,
      });
    });
  });

  function details() {
    return {
      name: "Rent",
      categoryId: null,
      matchWindowDays: 5,
      matchAmountToleranceBp: 500,
      provisionLabelFilter: null,
    };
  }
});
