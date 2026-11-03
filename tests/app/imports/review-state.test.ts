import { describe, expect, it } from "vitest";

import type {
  StagedFile,
  StagedRowView,
} from "../../../src/app/imports/import-form-data";
import {
  countRowsToConfirm,
  initReview,
  reviewReducer,
  visibleRowIndexes,
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
    columns: null,
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

  it("marks a type that contradicts the sign as to confirm, in text, without a problem", () => {
    const next = reviewReducer(start(), {
      type: "setDetails",
      file: 0,
      row: 0,
      details: { type: "income" },
    });

    const row = next.files[0]?.rows[0];
    expect(row?.problem).toBeNull();
    expect(row?.needsConfirmation).toBe(true);
    expect(row?.confirmReasons).toEqual([{ kind: "typeAgainstSign", type: "income" }]);
    expect(row?.draft.amount).toBe("12.50");
  });

  it("shows the amount that will be recorded for a staged expense on an incoming amount", () => {
    const state = start([
      stagedFile("march.csv", [
        stagedRow({ draft: { ...stagedRow().draft, amount: "+50,00" } }),
      ]),
    ]);

    const row = state.files[0]?.rows[0];
    expect(row?.draft.amount).toBe("-50.00");
    expect(row?.needsConfirmation).toBe(true);
    expect(row?.confirmReasons).toEqual([{ kind: "typeAgainstSign", type: "expense" }]);
  });

  it("gives back the amount of the file when the type is changed back", () => {
    const state = start([
      stagedFile("march.csv", [
        stagedRow({ draft: { ...stagedRow().draft, amount: "+50,00" } }),
      ]),
    ]);
    const toIncome = reviewReducer(state, {
      type: "setDetails",
      file: 0,
      row: 0,
      details: { type: "income" },
    });

    const row = toIncome.files[0]?.rows[0];
    expect(row?.draft.amount).toBe("+50,00");
    expect(row?.needsConfirmation).toBe(false);
  });

  it("signs a typed amount once the cell is left, and keeps the row to confirm", () => {
    const typed = reviewReducer(start(), {
      type: "edit",
      file: 0,
      row: 0,
      field: "amount",
      value: "+30,00",
    });
    expect(typed.files[0]?.rows[0]?.draft.amount).toBe("+30,00");

    const settled = reviewReducer(typed, { type: "settleAmount", file: 0, row: 0 });

    const row = settled.files[0]?.rows[0];
    expect(row?.draft.amount).toBe("-30.00");
    expect(row?.needsConfirmation).toBe(true);
  });

  it("stops marking the row once the amount agrees with the chosen type", () => {
    const contradicting = reviewReducer(start(), {
      type: "setDetails",
      file: 0,
      row: 0,
      details: { type: "income" },
    });

    const next = reviewReducer(contradicting, {
      type: "edit",
      file: 0,
      row: 0,
      field: "amount",
      value: "12,50",
    });

    expect(next.files[0]?.rows[0]?.needsConfirmation).toBe(false);
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

const LOW_GUESS = {
  type: "expense",
  confidence: "low",
  evidence: { kind: "none" },
  conflict: null,
  ignoredTypeCell: null,
} as const;

describe("reviewReducer on several rows", () => {
  const INCOME_ROW = stagedRow({
    line: 4,
    draft: { date: "2026-03-06", label: "SALARY", amount: "1500,00", externalId: null },
    details: { ...EXPENSE, type: "income", categoryId: null },
  });
  const UNREADABLE_ROW = stagedRow({
    line: 5,
    draft: { date: "2026-03-07", label: "BROKEN", amount: "abc", externalId: null },
  });

  function startMany(): ReviewState {
    return start([stagedFile("march.csv", [stagedRow(), SAVINGS_ROW, INCOME_ROW, UNREADABLE_ROW])]);
  }

  it("changes the category of the selected rows only", () => {
    const state = startMany();

    const next = reviewReducer(state, {
      type: "setDetailsMany",
      file: 0,
      rows: [0, 2],
      details: { categoryId: 9 },
    });

    expect(next.files[0]?.rows.map((row) => row.details.categoryId)).toEqual([9, null, 9, 4]);
    expect(next.files[0]?.rows[1]).toBe(state.files[0]?.rows[1]);
  });

  it("gives a savings row no category even when it is selected", () => {
    const next = reviewReducer(startMany(), {
      type: "setDetailsMany",
      file: 0,
      rows: [0, 1],
      details: { categoryId: 9 },
    });

    expect(next.files[0]?.rows[1]?.details.categoryId).toBeNull();
  });

  it("applies the rules of a single row when the type of several rows changes", () => {
    const next = reviewReducer(startMany(), {
      type: "setDetailsMany",
      file: 0,
      rows: [0, 2],
      details: { type: "income" },
    });

    const [expenseNowIncome, , incomeStaysIncome] = [0, 1, 2].map((i) => next.files[0]?.rows[i]);
    expect(expenseNowIncome?.draft.amount).toBe("12.50");
    expect(expenseNowIncome?.confirmReasons).toEqual([{ kind: "typeAgainstSign", type: "income" }]);
    expect(incomeStaysIncome?.needsConfirmation).toBe(false);
  });

  it("clears the category of the rows that become savings and asks for the account", () => {
    const next = reviewReducer(startMany(), {
      type: "setDetailsMany",
      file: 0,
      rows: [0],
      details: { type: "savings" },
    });

    expect(next.files[0]?.rows[0]?.details.categoryId).toBeNull();
    expect(next.files[0]?.rows[0]?.problem).toBe("savingsAccountRequired");
  });

  it("gives the same savings account to the selected savings rows and clears it elsewhere", () => {
    const next = reviewReducer(startMany(), {
      type: "setDetailsMany",
      file: 0,
      rows: [0, 1],
      details: { savingsAccountId: 7 },
    });

    expect(next.files[0]?.rows.map((row) => row.details.savingsAccountId)).toEqual([
      null,
      7,
      null,
      null,
    ]);
    expect(next.files[0]?.rows[1]?.problem).toBeNull();
  });

  it("keeps the problem of a row that cannot be read when its type changes", () => {
    const next = reviewReducer(startMany(), {
      type: "setDetailsMany",
      file: 0,
      rows: [3],
      details: { type: "income" },
    });

    expect(next.files[0]?.rows[3]?.problem).toBe("amountInvalid");
    expect(next.files[0]?.rows[3]?.needsConfirmation).toBe(false);
  });

  it("stops asking to confirm every selected row whose type is chosen", () => {
    const state = start([
      stagedFile("march.csv", [
        stagedRow({ guess: LOW_GUESS }),
        stagedRow({ line: 3, guess: LOW_GUESS }),
        stagedRow({ line: 4, guess: LOW_GUESS }),
      ]),
    ]);

    const next = reviewReducer(state, {
      type: "setDetailsMany",
      file: 0,
      rows: [0, 1],
      details: { type: "expense" },
    });

    expect(next.files[0]?.rows.map((row) => row.needsConfirmation)).toEqual([false, false, true]);
  });

  it("changes nothing for an empty selection", () => {
    const state = startMany();

    expect(
      reviewReducer(state, { type: "setDetailsMany", file: 0, rows: [], details: { categoryId: 9 } }),
    ).toBe(state);
  });

  it("ignores a row that does not exist and a file that is no longer reviewed", () => {
    const state = startMany();
    const out = reviewReducer(state, {
      type: "setDetailsMany",
      file: 0,
      rows: [99],
      details: { categoryId: 9 },
    });
    const cancelled = reviewReducer(state, { type: "setPhase", file: 0, phase: "cancelled" });

    expect(out.files[0]?.rows).toEqual(state.files[0]?.rows);
    expect(
      reviewReducer(cancelled, {
        type: "setDetailsMany",
        file: 0,
        rows: [0],
        details: { categoryId: 9 },
      }),
    ).toBe(cancelled);
  });
});

describe("reviewReducer when a file is read again", () => {
  it("replaces the rows of the file with the new reading and drops the edits and the outcome", () => {
    const edited = reviewReducer(
      start([stagedFile("march.csv", [stagedRow()]), stagedFile("april.csv", [stagedRow()], { firstDate: "2026-04-01" })]),
      { type: "edit", file: 0, row: 0, field: "label", value: "edited" },
    );

    const next = reviewReducer(edited, {
      type: "replaceFile",
      file: 0,
      staged: stagedFile("march.csv", [stagedRow({ line: 8 })]),
    });

    expect(next.files[0]?.rows.map((row) => [row.line, row.draft.label])).toEqual([
      [8, "CARD SHOP"],
    ]);
    expect(next.files[0]?.phase).toBe("reviewing");
    expect(next.files[1]).toBe(edited.files[1]);
  });

  it("reads the new rows against the savings account of the review", () => {
    const state = start([stagedFile("march.csv", [stagedRow()])], 7);

    const next = reviewReducer(state, {
      type: "replaceFile",
      file: 0,
      staged: stagedFile("march.csv", [SAVINGS_ROW]),
    });

    expect(next.files[0]?.rows[0]?.problem).toBeNull();
  });

  it("keeps the place of the file among the files as chosen", () => {
    const state = start([
      stagedFile("april.csv", [stagedRow()], { firstDate: "2026-04-01" }),
      stagedFile("march.csv", [stagedRow()], { firstDate: "2026-03-01" }),
    ]);

    expect(state.files.map((file) => [file.fileName, file.sourceIndex])).toEqual([
      ["march.csv", 1],
      ["april.csv", 0],
    ]);
    const next = reviewReducer(state, {
      type: "replaceFile",
      file: 0,
      staged: stagedFile("march.csv", [stagedRow()], { firstDate: "2026-03-01" }),
    });
    expect(next.files[0]?.sourceIndex).toBe(1);
  });

  it("does nothing for a file that does not exist or is already imported", () => {
    const state = start();
    const done = reviewReducer(state, { type: "setPhase", file: 0, phase: "done" });

    expect(
      reviewReducer(state, { type: "replaceFile", file: 5, staged: stagedFile("x.csv", []) }),
    ).toBe(state);
    expect(
      reviewReducer(done, { type: "replaceFile", file: 0, staged: stagedFile("x.csv", []) }),
    ).toBe(done);
  });
});

describe("rows to confirm", () => {
  function reviewed() {
    return start([
      stagedFile("march.csv", [
        stagedRow({ guess: LOW_GUESS }),
        stagedRow({ line: 3 }),
        stagedRow({
          line: 4,
          draft: { date: "2026-03-06", label: "REFUND", amount: "+20,00", externalId: null },
        }),
      ]),
    ]).files[0]!;
  }

  it("shows every row when the filter is off", () => {
    expect(visibleRowIndexes(reviewed().rows, false)).toEqual([0, 1, 2]);
  });

  it("shows only the rows marked to confirm, whatever the reason", () => {
    expect(visibleRowIndexes(reviewed().rows, true)).toEqual([0, 2]);
  });

  it("counts the rows the filter shows", () => {
    const { rows } = reviewed();

    expect(countRowsToConfirm(rows)).toBe(visibleRowIndexes(rows, true).length);
  });

  it("shows nothing when no row is to confirm", () => {
    const { rows } = start().files[0]!;

    expect(visibleRowIndexes(rows, true)).toEqual([]);
    expect(countRowsToConfirm(rows)).toBe(0);
  });

  it("follows the edits: a row leaves the filter once its type is chosen", () => {
    const next = reviewReducer(start([stagedFile("m.csv", [stagedRow({ guess: LOW_GUESS })])]), {
      type: "setDetailsMany",
      file: 0,
      rows: [0],
      details: { type: "expense" },
    });

    expect(visibleRowIndexes(next.files[0]!.rows, true)).toEqual([]);
  });
});
