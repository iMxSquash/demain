import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MAX_LIFE_EVENT_CHILDREN } from "../../src/domain/modification-parameters";
import { createAccount } from "../../src/ledger/accounts";
import { createPlannedItem, getPlannedItem } from "../../src/ledger/planned-items";
import {
  addModification,
  createScenario,
  deleteModification,
  deleteScenario,
  duplicateScenario,
  getScenario,
  listScenarios,
  loadScenarioModifications,
  moveModification,
  renameScenario,
  ScenarioValidationError,
  type StoredModification,
  updateModification,
} from "../../src/ledger/scenarios";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";
import { modifications, plannedItems, scenarios } from "../../src/storage/schema";

const TODAY = "2026-11-27";

function purchase(label: string, amount = 50_000) {
  return {
    type: "one_off_purchase" as const,
    label,
    parameters: { accountId: 1, date: "2027-03-01", amount, categoryId: null },
  };
}

const LIFE_EVENT = { type: "life_event" as const, label: "Moving out", parameters: {} };

function errorKey(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof ScenarioValidationError) return error.messageRef.key;
    throw error;
  }
  throw new Error("Expected a ScenarioValidationError");
}

describe("scenarios", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function labels(scenarioId: number): string[] {
    return getScenario(db, scenarioId).modifications.map(({ label }) => label);
  }

  it("creates, lists and renames a draft scenario", () => {
    const created = createScenario(db, "  New car  ", TODAY);

    expect(created).toEqual({
      id: created.id,
      name: "New car",
      status: "draft",
      validatedAt: null,
      createdAt: TODAY,
      modificationCount: 0,
    });
    addModification(db, created.id, purchase("Car"));
    renameScenario(db, created.id, "Used car");

    expect(listScenarios(db)).toEqual([{ ...created, name: "Used car", modificationCount: 1 }]);
    expect(getScenario(db, created.id)).toMatchObject({ name: "Used car", plannedItemIds: [] });
  });

  it("refuses an empty or 81-character name", () => {
    const { id } = createScenario(db, "Plan", TODAY);

    expect(errorKey(() => createScenario(db, "   ", TODAY))).toBe("scenarioNameInvalid");
    expect(errorKey(() => createScenario(db, "a".repeat(81), TODAY))).toBe("scenarioNameInvalid");
    expect(errorKey(() => renameScenario(db, id, ""))).toBe("scenarioNameInvalid");
    expect(errorKey(() => duplicateScenario(db, id, "a".repeat(81), TODAY))).toBe(
      "scenarioNameInvalid",
    );
    expect(createScenario(db, "a".repeat(80), TODAY).name).toHaveLength(80);
    expect(listScenarios(db)).toHaveLength(2);
    expect(getScenario(db, id).name).toBe("Plan");
  });

  it("adds modifications at the end and moves them up and down", () => {
    const { id } = createScenario(db, "Plan", TODAY);
    const first = addModification(db, id, purchase("First"));
    const second = addModification(db, id, purchase("Second"));
    const third = addModification(db, id, purchase("Third"));

    expect([first.position, second.position, third.position]).toEqual([0, 1, 2]);
    expect(third).toMatchObject({ parentId: null, type: "one_off_purchase", valid: true });

    moveModification(db, third.id, "up");
    expect(labels(id)).toEqual(["First", "Third", "Second"]);
    moveModification(db, first.id, "down");
    expect(labels(id)).toEqual(["Third", "First", "Second"]);
    moveModification(db, third.id, "up");
    moveModification(db, second.id, "down");
    expect(labels(id)).toEqual(["Third", "First", "Second"]);
    expect(getScenario(db, id).modifications.map(({ position }) => position)).toEqual([0, 1, 2]);
  });

  it("deleting a modification closes the gap of positions", () => {
    const { id } = createScenario(db, "Plan", TODAY);
    addModification(db, id, purchase("First"));
    const second = addModification(db, id, purchase("Second"));
    addModification(db, id, purchase("Third"));

    deleteModification(db, second.id);

    expect(
      getScenario(db, id).modifications.map(({ label, position }) => [label, position]),
    ).toEqual([
      ["First", 0],
      ["Third", 1],
    ]);
    expect(addModification(db, id, purchase("Fourth")).position).toBe(2);
  });

  it("refuses parameters that fail the schema of their type", () => {
    const { id } = createScenario(db, "Plan", TODAY);

    expect(errorKey(() => addModification(db, id, purchase("Car", 0)))).toBe(
      "modificationParametersInvalid",
    );
    expect(errorKey(() => addModification(db, id, { ...purchase("Car"), label: " " }))).toBe(
      "modificationLabelInvalid",
    );
    const car = addModification(db, id, purchase("Car"));
    expect(
      errorKey(() => updateModification(db, car.id, { label: "Car", parameters: { amount: 1 } })),
    ).toBe("modificationParametersInvalid");

    updateModification(db, car.id, {
      label: " Bike ",
      parameters: purchase("", 30_000).parameters,
    });

    expect(getScenario(db, id).modifications).toEqual([
      { ...car, label: "Bike", parameters: purchase("", 30_000).parameters },
    ]);
  });

  it("a stored row whose parameters no longer pass is read as invalid, not thrown", () => {
    const { id } = createScenario(db, "Plan", TODAY);
    const car = addModification(db, id, purchase("Car"));
    const broken = addModification(db, id, purchase("Broken"));
    const event = addModification(db, id, LIFE_EVENT);
    const kept = addModification(db, id, { ...purchase("Deposit"), parentId: event.id });
    const stale = addModification(db, id, { ...purchase("Stale"), parentId: event.id });
    const orphan = addModification(db, id, { ...purchase("Orphan"), parentId: event.id });
    db.update(modifications)
      .set({ parentId: car.id, position: 0 })
      .where(eq(modifications.id, orphan.id))
      .run();
    db.update(modifications)
      .set({ parameters: JSON.stringify({ amount: -5 }) })
      .where(eq(modifications.id, broken.id))
      .run();
    db.update(modifications)
      .set({ parameters: "{not json" })
      .where(eq(modifications.id, stale.id))
      .run();

    const stored = getScenario(db, id).modifications;
    const loaded = loadScenarioModifications(db, id);

    expect(stored.map(({ label, valid }) => [label, valid])).toEqual([
      ["Car", true],
      ["Orphan", true],
      ["Broken", false],
      ["Moving out", true],
      ["Deposit", true],
      ["Stale", false],
    ]);
    expect(loaded.invalid).toEqual([
      { modificationId: orphan.id, reason: "parametersInvalid" },
      { modificationId: broken.id, reason: "parametersInvalid" },
      { modificationId: stale.id, reason: "parametersInvalid" },
    ]);
    expect(loaded.modifications).toEqual([
      {
        id: car.id,
        position: 0,
        type: "one_off_purchase",
        label: "Car",
        parameters: car.parameters,
      },
      {
        id: event.id,
        position: 2,
        type: "life_event",
        label: "Moving out",
        parameters: {},
        children: [
          {
            id: kept.id,
            position: 0,
            type: "one_off_purchase",
            label: "Deposit",
            parameters: kept.parameters,
          },
        ],
      },
    ]);
  });

  it("adds children to a life event only, never a life event, at most 20", () => {
    const { id } = createScenario(db, "Plan", TODAY);
    const car = addModification(db, id, purchase("Car"));
    const event = addModification(db, id, LIFE_EVENT);
    const other = createScenario(db, "Other", TODAY);

    expect(
      errorKey(() => addModification(db, id, { ...purchase("Tyres"), parentId: car.id })),
    ).toBe("modificationParentNotLifeEvent");
    expect(errorKey(() => addModification(db, id, { ...LIFE_EVENT, parentId: event.id }))).toBe(
      "lifeEventNested",
    );
    expect(
      errorKey(() => addModification(db, other.id, { ...purchase("Tyres"), parentId: event.id })),
    ).toBe("modificationMissing");
    for (let index = 0; index < MAX_LIFE_EVENT_CHILDREN; index += 1) {
      const child = addModification(db, id, { ...purchase(`Child ${index}`), parentId: event.id });
      expect(child).toMatchObject({ parentId: event.id, position: index });
    }
    expect(
      errorKey(() => addModification(db, id, { ...purchase("One more"), parentId: event.id })),
    ).toBe("lifeEventFull");
    expect(addModification(db, id, purchase("Top level")).position).toBe(2);
  });

  it("duplicates a scenario with its modifications and children into a new draft", () => {
    const source = createScenario(db, "Plan", "2026-10-01");
    addModification(db, source.id, purchase("Car"));
    const event = addModification(db, source.id, LIFE_EVENT);
    addModification(db, source.id, { ...purchase("Deposit"), parentId: event.id });
    addModification(db, source.id, { ...purchase("Furniture"), parentId: event.id });
    db.update(scenarios)
      .set({ status: "validated", validatedAt: "2026-11-01" })
      .where(eq(scenarios.id, source.id))
      .run();

    const copy = duplicateScenario(db, source.id, "Plan (copy)", TODAY);

    expect(copy).toEqual({
      id: copy.id,
      name: "Plan (copy)",
      status: "draft",
      validatedAt: null,
      createdAt: TODAY,
      modificationCount: 2,
    });
    const strip = ({ position, type, label, parameters, valid, parentId }: StoredModification) => ({
      position,
      type,
      label,
      parameters,
      valid,
      hasParent: parentId !== null,
    });
    const original = getScenario(db, source.id).modifications;
    const copied = getScenario(db, copy.id).modifications;
    expect(copied.map(strip)).toEqual(original.map(strip));
    const copiedEvent = copied.find(({ type }) => type === "life_event");
    expect(
      copied.filter(({ parentId }) => parentId !== null).map(({ parentId }) => parentId),
    ).toEqual([copiedEvent?.id, copiedEvent?.id]);
    expect(copied.map(({ id }) => id)).not.toContain(event.id);
  });

  it("refuses every edit of a validated scenario, but duplicates and deletes it", () => {
    const { id } = createScenario(db, "Plan", TODAY);
    const car = addModification(db, id, purchase("Car"));
    addModification(db, id, purchase("Bike"));
    db.update(scenarios)
      .set({ status: "validated", validatedAt: TODAY })
      .where(eq(scenarios.id, id))
      .run();

    const edits = [
      () => renameScenario(db, id, "Other"),
      () => addModification(db, id, purchase("Boat")),
      () => updateModification(db, car.id, { label: "Van", parameters: car.parameters }),
      () => moveModification(db, car.id, "down"),
      () => deleteModification(db, car.id),
    ];

    expect(edits.map(errorKey)).toEqual(Array(edits.length).fill("scenarioValidated"));
    expect(labels(id)).toEqual(["Car", "Bike"]);
    expect(getScenario(db, id).name).toBe("Plan");
    const copy = duplicateScenario(db, id, "Plan (copy)", TODAY);
    deleteScenario(db, id);
    expect(listScenarios(db).map(({ id: listed }) => listed)).toEqual([copy.id]);
  });

  it("deleting a scenario keeps its planned items and clears their source_scenario_id", () => {
    const accountId = createAccount(db, {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 0,
    }).id;
    const { id } = createScenario(db, "Plan", TODAY);
    const item = createPlannedItem(db, {
      name: "Car loan",
      kind: "expense",
      accountId,
      startDate: "2027-01-05",
      repetition: { kind: "monthly_on_day", day: 5 },
      amount: -30_000,
    });
    db.update(plannedItems).set({ sourceScenarioId: id }).where(eq(plannedItems.id, item.id)).run();
    expect(getScenario(db, id).plannedItemIds).toEqual([item.id]);

    deleteScenario(db, id);

    expect(getPlannedItem(db, item.id)).toEqual({ ...item, sourceScenarioId: null });
    expect(errorKey(() => getScenario(db, id))).toBe("scenarioMissing");
  });

  it("deleting a scenario deletes its modifications", () => {
    const { id } = createScenario(db, "Plan", TODAY);
    const kept = createScenario(db, "Kept", TODAY);
    const event = addModification(db, id, LIFE_EVENT);
    addModification(db, id, { ...purchase("Deposit"), parentId: event.id });
    addModification(db, kept.id, purchase("Car"));

    deleteScenario(db, id);

    expect(db.select({ label: modifications.label }).from(modifications).all()).toEqual([
      { label: "Car" },
    ]);
  });
});
