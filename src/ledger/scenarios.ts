import { and, asc, count, desc, eq, gt, isNull, lt, max, sql, type SQL } from "drizzle-orm";

import { messageRef, type FeedbackKey, type MessageRef } from "../domain/message";
import type { Modification, ModificationProblem, ModificationType } from "../domain/modification";
import {
  MAX_LIFE_EVENT_CHILDREN,
  modificationLabelSchema,
  parseModificationParameters,
} from "../domain/modification-parameters";
import type { AppDatabase } from "../storage/database";
import { modifications, plannedItems, scenarios } from "../storage/schema";

export interface ScenarioSummary {
  id: number;
  name: string;
  status: "draft" | "validated";
  validatedAt: string | null;
  createdAt: string;
  /** The modifications of the scenario's own list: the children of a life event are not counted. */
  modificationCount: number;
}

export interface StoredModification {
  id: number;
  parentId: number | null;
  position: number;
  type: ModificationType;
  label: string;
  /** As stored: checked against the schema of the type only to set `valid` (D6). */
  parameters: unknown;
  valid: boolean;
}

export interface ScenarioDetail extends ScenarioSummary {
  /** The scenario's list by position, each life event followed by its children by position. */
  modifications: StoredModification[];
  plannedItemIds: number[];
}

export interface ModificationInput {
  type: ModificationType;
  label: string;
  parameters: unknown;
  parentId?: number | null;
}

type Reader = Pick<AppDatabase, "select">;
type ScenarioRow = typeof scenarios.$inferSelect;
type ModificationRow = typeof modifications.$inferSelect;

export class ScenarioValidationError extends Error {
  constructor(
    /** English text for logs and tests: users read the translation of `messageRef`. */
    message: string,
    readonly messageRef: MessageRef,
  ) {
    super(message);
    this.name = "ScenarioValidationError";
  }
}

function refuse(message: string, key: FeedbackKey, values?: MessageRef["values"]): never {
  throw new ScenarioValidationError(message, messageRef(key, values));
}

function validName(raw: string, key: "scenarioNameInvalid" | "modificationLabelInvalid"): string {
  const parsed = modificationLabelSchema.safeParse(raw);
  if (!parsed.success) refuse("A name must have 1 to 80 characters once trimmed", key);
  return parsed.data;
}

/** The parameters as JSON text, after the schema of their type has accepted them. */
function validParameters(type: ModificationType, parameters: unknown): string {
  const parsed = parseModificationParameters(type, parameters);
  if (!parsed.ok)
    refuse(`The parameters do not pass the ${type} schema`, "modificationParametersInvalid");
  return JSON.stringify(parsed.parameters);
}

function findScenario(db: Reader, id: number): ScenarioRow {
  return (
    db.select().from(scenarios).where(eq(scenarios.id, id)).get() ??
    refuse(`Scenario ${id} does not exist`, "scenarioMissing")
  );
}

/** A validated scenario is read-only (D14): only duplicating and deleting it are allowed. */
function findDraftScenario(db: Reader, id: number): ScenarioRow {
  const scenario = findScenario(db, id);
  if (scenario.status === "validated")
    refuse(`Scenario ${id} is validated: it is read-only`, "scenarioValidated");
  return scenario;
}

function findModification(db: Reader, id: number): ModificationRow {
  return (
    db.select().from(modifications).where(eq(modifications.id, id)).get() ??
    refuse(`Modification ${id} does not exist`, "modificationMissing")
  );
}

function findEditableModification(db: Reader, id: number): ModificationRow {
  const modification = findModification(db, id);
  findDraftScenario(db, modification.scenarioId);
  return modification;
}

/** The list a modification belongs to: the scenario's own, or the children of one life event. */
function sameList(scenarioId: number, parentId: number | null): SQL | undefined {
  return and(
    eq(modifications.scenarioId, scenarioId),
    parentId === null ? isNull(modifications.parentId) : eq(modifications.parentId, parentId),
  );
}

function topLevelCounts(db: Reader): Map<number, number> {
  const rows = db
    .select({ scenarioId: modifications.scenarioId, value: count() })
    .from(modifications)
    .where(isNull(modifications.parentId))
    .groupBy(modifications.scenarioId)
    .all();
  return new Map(rows.map(({ scenarioId, value }) => [scenarioId, value]));
}

function toSummary(row: ScenarioRow, modificationCount: number): ScenarioSummary {
  const { id, name, status, validatedAt, createdAt } = row;
  return { id, name, status, validatedAt, createdAt, modificationCount };
}

/** The scenario's own list by position, and the children of each modification by position. */
function scenarioRows(db: Reader, scenarioId: number) {
  const rows = db
    .select()
    .from(modifications)
    .where(eq(modifications.scenarioId, scenarioId))
    .orderBy(asc(modifications.position), asc(modifications.id))
    .all();
  return {
    top: rows.filter(({ parentId }) => parentId === null),
    children: Map.groupBy(
      rows.filter(({ parentId }) => parentId !== null),
      ({ parentId }) => parentId,
    ),
  };
}

/** Rows in display order: the scenario's list, each life event followed by its children. */
function orderedRows(db: Reader, scenarioId: number): ModificationRow[] {
  const { top, children } = scenarioRows(db, scenarioId);
  return top.flatMap((row) => [row, ...(children.get(row.id) ?? [])]);
}

/** The stored parameters, and the parsed ones once the schema of the type accepts them (D6). */
function readParameters(row: ModificationRow): { raw: unknown; parsed: unknown } {
  let raw: unknown;
  try {
    raw = JSON.parse(row.parameters);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { raw: row.parameters, parsed: undefined };
  }
  const parsed = parseModificationParameters(row.type, raw);
  return { raw, parsed: parsed.ok ? parsed.parameters : undefined };
}

function toStored(row: ModificationRow): StoredModification {
  const { id, parentId, position, type, label } = row;
  const { raw, parsed } = readParameters(row);
  return { id, parentId, position, type, label, parameters: raw, valid: parsed !== undefined };
}

export function listScenarios(db: Reader): ScenarioSummary[] {
  const counts = topLevelCounts(db);
  return db
    .select()
    .from(scenarios)
    .orderBy(asc(scenarios.id))
    .all()
    .map((row) => toSummary(row, counts.get(row.id) ?? 0));
}

export function getScenario(db: Reader, id: number): ScenarioDetail {
  const scenario = findScenario(db, id);
  const stored = orderedRows(db, id).map(toStored);
  const plannedItemIds = db
    .select({ id: plannedItems.id })
    .from(plannedItems)
    .where(eq(plannedItems.sourceScenarioId, id))
    .orderBy(asc(plannedItems.id))
    .all()
    .map((item) => item.id);
  return {
    ...toSummary(scenario, stored.filter(({ parentId }) => parentId === null).length),
    modifications: stored,
    plannedItemIds,
  };
}

/**
 * Modifications as the domain needs them: valid ones parsed, life events with their valid
 * children; invalid ones are listed apart (D6). A life event left with no valid child is still
 * passed on: the domain reports it.
 */
export function loadScenarioModifications(
  db: Reader,
  id: number,
): { modifications: Modification[]; invalid: ModificationProblem[] } {
  findScenario(db, id);
  const { top, children } = scenarioRows(db, id);
  const invalid: ModificationProblem[] = [];
  const report = (row: ModificationRow) =>
    invalid.push({ modificationId: row.id, reason: "parametersInvalid" });
  const parse = (row: ModificationRow): Omit<StoredModification, "parentId" | "valid">[] => {
    const { parsed } = readParameters(row);
    if (parsed === undefined) {
      report(row);
      return [];
    }
    const { id: modificationId, position, type, label } = row;
    return [{ id: modificationId, position, type, label, parameters: parsed }];
  };
  // The casts hold: the schema of each type has accepted the parameters it keeps.
  const result = top.flatMap((row) =>
    parse(row).map((modification) => {
      const rows = children.get(row.id) ?? [];
      if (row.type === "life_event")
        return { ...modification, children: rows.flatMap(parse) } as Modification;
      // Only a life event has children: one found under anything else is reported, not applied.
      rows.forEach(report);
      return modification as Modification;
    }),
  );
  return { modifications: result, invalid };
}

export function createScenario(db: AppDatabase, name: string, today: string): ScenarioSummary {
  const row = db
    .insert(scenarios)
    .values({ name: validName(name, "scenarioNameInvalid"), createdAt: today })
    .returning()
    .get();
  return toSummary(row, 0);
}

export function renameScenario(db: AppDatabase, id: number, name: string): void {
  findDraftScenario(db, id);
  const valid = validName(name, "scenarioNameInvalid");
  db.update(scenarios).set({ name: valid }).where(eq(scenarios.id, id)).run();
}

/** A new draft with a copy of every modification, children included (D14). */
export function duplicateScenario(
  db: AppDatabase,
  id: number,
  copyName: string,
  today: string,
): ScenarioSummary {
  findScenario(db, id);
  const name = validName(copyName, "scenarioNameInvalid");
  return db.transaction((tx) => {
    const copy = tx.insert(scenarios).values({ name, createdAt: today }).returning().get();
    const copiedIds = new Map<number, number>();
    let topLevel = 0;
    // Parents come before their children in this order, so each parent id is already mapped.
    for (const row of orderedRows(tx, id)) {
      const { id: sourceId, parentId, position, type, label, parameters } = row;
      const inserted = tx
        .insert(modifications)
        .values({
          scenarioId: copy.id,
          parentId: parentId === null ? null : (copiedIds.get(parentId) ?? null),
          position,
          type,
          label,
          parameters,
        })
        .returning({ id: modifications.id })
        .get();
      copiedIds.set(sourceId, inserted.id);
      if (parentId === null) topLevel += 1;
    }
    return toSummary(copy, topLevel);
  });
}

/** Its modifications go with it; the planned items it created stay, without a source (D14). */
export function deleteScenario(db: AppDatabase, id: number): void {
  findScenario(db, id);
  db.delete(scenarios).where(eq(scenarios.id, id)).run();
}

function checkParent(db: Reader, scenarioId: number, type: ModificationType, parentId: number) {
  const parent = findModification(db, parentId);
  if (parent.scenarioId !== scenarioId)
    refuse(
      `Modification ${parentId} does not exist in scenario ${scenarioId}`,
      "modificationMissing",
    );
  if (parent.type !== "life_event")
    refuse(`Modification ${parentId} is not a life event`, "modificationParentNotLifeEvent");
  if (type === "life_event") refuse("A life event cannot contain another one", "lifeEventNested");
  const children = db
    .select({ value: count() })
    .from(modifications)
    .where(eq(modifications.parentId, parentId))
    .get();
  if ((children?.value ?? 0) >= MAX_LIFE_EVENT_CHILDREN)
    refuse(`Life event ${parentId} is full`, "lifeEventFull", { max: MAX_LIFE_EVENT_CHILDREN });
}

/** Adds a modification at the end of its list. */
export function addModification(
  db: AppDatabase,
  scenarioId: number,
  input: ModificationInput,
): StoredModification {
  findDraftScenario(db, scenarioId);
  const parentId = input.parentId ?? null;
  if (parentId !== null) checkParent(db, scenarioId, input.type, parentId);
  const label = validName(input.label, "modificationLabelInvalid");
  const parameters = validParameters(input.type, input.parameters);
  return db.transaction((tx) => {
    const last = tx
      .select({ value: max(modifications.position) })
      .from(modifications)
      .where(sameList(scenarioId, parentId))
      .get();
    const position = (last?.value ?? -1) + 1;
    const row = tx
      .insert(modifications)
      .values({ scenarioId, parentId, position, type: input.type, label, parameters })
      .returning()
      .get();
    return toStored(row);
  });
}

export function updateModification(
  db: AppDatabase,
  id: number,
  input: { label: string; parameters: unknown },
): void {
  const modification = findEditableModification(db, id);
  const label = validName(input.label, "modificationLabelInvalid");
  const parameters = validParameters(modification.type, input.parameters);
  db.update(modifications).set({ label, parameters }).where(eq(modifications.id, id)).run();
}

/** Swaps the modification with its neighbour in its list; nothing happens at either end. */
export function moveModification(db: AppDatabase, id: number, direction: "up" | "down"): void {
  const modification = findEditableModification(db, id);
  const { scenarioId, parentId, position } = modification;
  db.transaction((tx) => {
    const neighbour = tx
      .select({ id: modifications.id, position: modifications.position })
      .from(modifications)
      .where(
        and(
          sameList(scenarioId, parentId),
          direction === "up"
            ? lt(modifications.position, position)
            : gt(modifications.position, position),
        ),
      )
      .orderBy(direction === "up" ? desc(modifications.position) : asc(modifications.position))
      .limit(1)
      .get();
    if (neighbour === undefined) return;
    tx.update(modifications)
      .set({ position: neighbour.position })
      .where(eq(modifications.id, id))
      .run();
    tx.update(modifications).set({ position }).where(eq(modifications.id, neighbour.id)).run();
  });
}

/** Deletes the modification, its children with it, and closes the gap in its list. */
export function deleteModification(db: AppDatabase, id: number): void {
  const { scenarioId, parentId, position } = findEditableModification(db, id);
  db.transaction((tx) => {
    tx.delete(modifications).where(eq(modifications.id, id)).run();
    tx.update(modifications)
      .set({ position: sql`${modifications.position} - 1` })
      .where(and(sameList(scenarioId, parentId), gt(modifications.position, position)))
      .run();
  });
}
