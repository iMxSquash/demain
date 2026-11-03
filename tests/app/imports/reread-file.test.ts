import { describe, expect, it } from "vitest";

import type { StagedColumns, StagedFile } from "../../../src/app/imports/import-form-data";
import { columnChoicesOf, rereadFile } from "../../../src/app/imports/reread-file";
import {
  canImportFile,
  initReview,
  reviewReducer,
  type ReviewAction,
  type ReviewState,
} from "../../../src/app/imports/review-state";

const COLUMNS: StagedColumns = {
  roles: { typeColumn: 3, paymentModeColumn: null, categoryColumn: 4, descriptionColumn: null },
  available: [
    { column: 3, header: "Type" },
    { column: 4, header: "Category" },
  ],
};

function stagedFile(status: "ready" | "failed", message = ""): StagedFile {
  return {
    fileName: "march.csv",
    status,
    message,
    format: "csv",
    mapping: null,
    currency: "EUR",
    firstDate: "2026-03-02",
    needsMapping: false,
    columns: COLUMNS,
    rows: [
      {
        line: 2,
        rawDate: null,
        draft: { date: "2026-03-02", label: "SHOP", amount: "-12,50", externalId: null },
        details: {
          type: "expense",
          categoryId: 4,
          paymentMode: "card",
          description: null,
          savingsAccountId: null,
        },
        guess: null,
        isDuplicate: false,
      },
    ],
  };
}

function run(initial: ReviewState, readings: StagedFile[]) {
  let state = initial;
  const dispatch = (action: ReviewAction) => {
    state = reviewReducer(state, action);
  };
  const results: boolean[] = [];
  return {
    get state() {
      return state;
    },
    async read() {
      const next = readings.shift();
      if (next === undefined) throw new Error("no reading left");
      results.push(await rereadFile(0, async () => next, dispatch));
      return results;
    },
  };
}

describe("columnChoicesOf", () => {
  it("gives the assignment shown, so that a file can be read again without choosing another value", () => {
    expect(columnChoicesOf(COLUMNS)).toEqual({
      typeColumn: "3",
      paymentModeColumn: "none",
      categoryColumn: "4",
      descriptionColumn: "none",
    });
  });
});

describe("rereadFile", () => {
  const start = () => initReview([stagedFile("ready")], null);

  it("clears the error of an earlier failure when the new reading succeeds", async () => {
    const review = run(start(), [stagedFile("failed", "boom"), stagedFile("ready")]);

    expect(await review.read()).toEqual([false]);
    expect(review.state.files[0]?.rereadError).toBe("boom");

    expect(await review.read()).toEqual([false, true]);
    expect(review.state.files[0]?.rereadError).toBeNull();
  });

  it("keeps the error and the block when the reading fails again", async () => {
    const review = run(start(), [stagedFile("failed", "first"), stagedFile("failed", "second")]);

    await review.read();
    await review.read();

    const file = review.state.files[0];
    expect(file?.rereadError).toBe("second");
    expect(file && canImportFile(file, { isReading: false, waitFor: null })).toBe(false);
  });

  it("lets the file be imported once a reading succeeds", async () => {
    const review = run(start(), [stagedFile("failed", "boom"), stagedFile("ready")]);

    await review.read();
    await review.read();

    const file = review.state.files[0];
    expect(file && canImportFile(file, { isReading: false, waitFor: null })).toBe(true);
  });
});
