import { describe, expect, it } from "vitest";

import type {
  StagedFile,
  StagedRowView,
} from "../../../src/app/imports/import-form-data";
import {
  initReview,
  reviewReducer,
  type ReviewState,
} from "../../../src/app/imports/review-state";
import type { RowDetails } from "../../../src/domain/import-draft";

const EXPENSE: RowDetails = {
  type: "expense",
  categoryId: 4,
  paymentMode: "card",
  description: null,
  savingsAccountId: null,
};

function stagedRow(overrides: Partial<StagedRowView> = {}): StagedRowView {
  return {
    line: 2,
    rawDate: null,
    draft: { date: "2026-03-02", label: "CARD SHOP", amount: "-12,50", externalId: null },
    details: EXPENSE,
    guess: null,
    isDuplicate: false,
    ...overrides,
  };
}

function stagedFile(
  fileName: string,
  rows: StagedRowView[],
  overrides: Partial<StagedFile> = {},
): StagedFile {
  return {
    fileName,
    status: "ready",
    message: "",
    format: "csv",
    mapping: null,
    currency: "EUR",
    firstDate: "2026-03-02",
    needsMapping: false,
    rows,
    ...overrides,
  };
}

const SAVINGS_ROW = stagedRow({
  line: 3,
  draft: { date: "2026-03-05", label: "VIR LIVRET", amount: "-100,00", externalId: null },
  details: { ...EXPENSE, type: "savings", categoryId: null, savingsAccountId: null },
});

function start(
  files: StagedFile[] = [stagedFile("march.csv", [stagedRow(), SAVINGS_ROW])],
  defaultSavingsAccountId: number | null = null,
): ReviewState {
  return initReview(files, defaultSavingsAccountId);
}

describe("initReview", () => {
  it("orders the files by their first date, a file with no date last", () => {
    const state = start([
      stagedFile("none.csv", [], { firstDate: null }),
      stagedFile("april.csv", [stagedRow()], { firstDate: "2026-04-01" }),
      stagedFile("march.csv", [stagedRow()], { firstDate: "2026-03-01" }),
    ]);

    expect(state.files.map((file) => file.fileName)).toEqual([
      "march.csv",
      "april.csv",
      "none.csv",
    ]);
  });

  it("starts a file that could not be read as failed and the others as reviewing", () => {
    const state = start([
      stagedFile("ok.csv", [stagedRow()]),
      stagedFile("bad.csv", [], { status: "failed", firstDate: null }),
    ]);

    expect(state.files.map((file) => file.phase)).toEqual(["reviewing", "failed"]);
  });

  it("reads every row against the savings account of the file", () => {
    const withoutAccount = start();
    const withAccount = start(undefined, 7);

    expect(withoutAccount.files[0]?.rows.map((row) => row.problem)).toEqual([
      null,
      "savingsAccountRequired",
    ]);
    expect(withAccount.files[0]?.rows.map((row) => row.problem)).toEqual([null, null]);
  });

  it("marks a row whose type was guessed with little evidence as to confirm", () => {
    const state = start([
      stagedFile("march.csv", [
        stagedRow({
          guess: {
            type: "expense",
            confidence: "low",
            evidence: { kind: "none" },
            conflict: null,
            ignoredTypeCell: null,
          },
        }),
        stagedRow({ line: 3 }),
      ]),
    ]);

    expect(state.files[0]?.rows.map((row) => row.needsConfirmation)).toEqual([true, false]);
  });
});

describe("reviewReducer", () => {
  it("edits a text, reads the row again and leaves the other rows as they were", () => {
    const state = start(undefined, 7);

    const next = reviewReducer(state, {
      type: "edit",
      file: 0,
      row: 0,
      field: "amount",
      value: "abc",
    });

    expect(next.files[0]?.rows[0]?.draft.amount).toBe("abc");
    expect(next.files[0]?.rows[0]?.problem).toBe("amountInvalid");
    expect(next.files[0]?.rows[1]).toBe(state.files[0]?.rows[1]);
  });

  it("ignores an edit once the file is no longer being reviewed", () => {
    const state = reviewReducer(start(), { type: "setPhase", file: 0, phase: "cancelled" });

    const next = reviewReducer(state, {
      type: "edit",
      file: 0,
      row: 0,
      field: "label",
      value: "changed",
    });

    expect(next).toBe(state);
  });

  it("clears the savings account of a row that becomes an income", () => {
    const state = start([
      stagedFile("march.csv", [
        stagedRow({
          details: { ...EXPENSE, type: "savings", categoryId: null, savingsAccountId: 7 },
        }),
      ]),
    ]);

    const next = reviewReducer(state, {
      type: "setDetails",
      file: 0,
      row: 0,
      details: { type: "income", categoryId: 4 },
    });

    expect(next.files[0]?.rows[0]?.details).toMatchObject({
      type: "income",
      categoryId: 4,
      savingsAccountId: null,
    });
  });

  it("clears the category of a row that becomes savings and asks for an account", () => {
    const next = reviewReducer(start(), {
      type: "setDetails",
      file: 0,
      row: 0,
      details: { type: "savings" },
    });

    expect(next.files[0]?.rows[0]?.details.categoryId).toBeNull();
    expect(next.files[0]?.rows[0]?.problem).toBe("savingsAccountRequired");
  });

  it("flags a type that contradicts the sign instead of turning the amount around", () => {
    const next = reviewReducer(start(), {
      type: "setDetails",
      file: 0,
      row: 0,
      details: { type: "income" },
    });

    expect(next.files[0]?.rows[0]?.problem).toBe("typeSignMismatch");
    expect(next.files[0]?.rows[0]?.draft.amount).toBe("-12,50");
  });

  it("stops asking to confirm a row once its type is chosen, not when its category is", () => {
    const state = start([
      stagedFile("march.csv", [
        stagedRow({
          guess: {
            type: "expense",
            confidence: "low",
            evidence: { kind: "none" },
            conflict: null,
            ignoredTypeCell: null,
          },
        }),
      ]),
    ]);

    const category = reviewReducer(state, {
      type: "setDetails",
      file: 0,
      row: 0,
      details: { categoryId: 5 },
    });
    const type = reviewReducer(state, {
      type: "setDetails",
      file: 0,
      row: 0,
      details: { type: "expense" },
    });

    expect(category.files[0]?.rows[0]?.needsConfirmation).toBe(true);
    expect(type.files[0]?.rows[0]?.needsConfirmation).toBe(false);
  });

  it("reads the savings rows again when the savings account of the file changes", () => {
    const state = start();

    const next = reviewReducer(state, { type: "setDefaultSavings", savingsAccountId: 7 });

    expect(next.defaultSavingsAccountId).toBe(7);
    expect(next.files[0]?.rows[1]?.problem).toBeNull();
    expect(next.files[0]?.rows[0]).toBe(state.files[0]?.rows[0]);
  });

  it("keeps the outcome of an import until the file is edited", () => {
    const outcome = { message: "Blocked", warnings: [], issues: [{ index: 1, message: "x" }] };
    const blocked = reviewReducer(start(), {
      type: "setPhase",
      file: 0,
      phase: "reviewing",
      outcome,
    });

    expect(blocked.files[0]?.outcome).toEqual(outcome);

    const edited = reviewReducer(blocked, {
      type: "edit",
      file: 0,
      row: 0,
      field: "label",
      value: "other",
    });

    expect(edited.files[0]?.outcome).toBeNull();
  });
});
