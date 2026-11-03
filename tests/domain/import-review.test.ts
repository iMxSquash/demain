import { describe, expect, it } from "vitest";

import type { RowDetails } from "../../src/domain/import-draft";
import type { TypeGuess } from "../../src/domain/import-guess";
import {
  confirmReasons,
  nextFileToSettle,
  planReview,
  reviewRowProblem,
  splitSegments,
  type FilePhase,
  type ReviewedFile,
  type ReviewedRow,
} from "../../src/domain/import-review";
import type { SavingsTransfer } from "../../src/domain/import-savings";
import type { OverflowAccount } from "../../src/domain/overflow";

function guess(overrides: Partial<TypeGuess>): TypeGuess {
  return {
    type: "expense",
    confidence: "low",
    evidence: { kind: "none" },
    conflict: null,
    ignoredTypeCell: null,
    ...overrides,
  };
}

describe("confirmReasons", () => {
  it("asks for no confirmation of a row whose type could not be guessed", () => {
    expect(confirmReasons(null)).toEqual([]);
  });

  it.each(["high", "medium"] as const)(
    "asks for no confirmation of a %s confidence guess",
    (confidence) => {
      expect(
        confirmReasons(
          guess({ confidence, evidence: { kind: "sign", direction: "out" } }),
        ),
      ).toEqual([]);
    },
  );

  it("names the category that gave the type", () => {
    expect(
      confirmReasons(
        guess({
          type: "income",
          evidence: {
            kind: "categoryWord",
            category: "Salaire",
            word: "salaire",
            type: "income",
          },
        }),
      ),
    ).toEqual([{ kind: "categoryWord", category: "Salaire" }]);
  });

  it("says that the sign won over a category that disagreed", () => {
    expect(
      confirmReasons(
        guess({
          evidence: { kind: "sign", direction: "out" },
          conflict: {
            kind: "categoryWord",
            category: "Salaire",
            word: "salaire",
            type: "income",
          },
        }),
      ),
    ).toEqual([{ kind: "categoryOverruled", category: "Salaire" }]);
  });

  it("says that the sign won over the history of the label", () => {
    expect(
      confirmReasons(
        guess({
          evidence: { kind: "debitCredit", direction: "in" },
          conflict: { kind: "history", type: "savings" },
        }),
      ),
    ).toEqual([{ kind: "historyOverruled", type: "savings" }]);
  });

  it("names the type of an earlier import of the same label", () => {
    expect(
      confirmReasons(
        guess({ type: "savings", evidence: { kind: "history", type: "savings" } }),
      ),
    ).toEqual([{ kind: "history", type: "savings" }]);
  });

  it("says that a type cell contradicts the sign of the amount", () => {
    expect(
      confirmReasons(
        guess({
          type: "income",
          evidence: { kind: "typeCell", value: "Revenu" },
          conflict: { kind: "sign", direction: "out" },
        }),
      ),
    ).toEqual([{ kind: "typeCellConflict", value: "Revenu", against: "sign" }]);
  });

  it("names the debit and credit columns when they are what the type cell contradicts", () => {
    expect(
      confirmReasons(
        guess({
          type: "income",
          evidence: { kind: "typeCell", value: "Revenu" },
          conflict: { kind: "debitCredit", direction: "out" },
        }),
      ),
    ).toEqual([{ kind: "typeCellConflict", value: "Revenu", against: "debitCredit" }]);
  });

  it("says that nothing in the file gave the type", () => {
    expect(confirmReasons(guess({ evidence: { kind: "none" } }))).toEqual([
      { kind: "nothing" },
    ]);
  });

  it("adds the type cell that was ignored to what gave the type", () => {
    expect(
      confirmReasons(
        guess({
          type: "income",
          evidence: { kind: "sign", direction: "in" },
          ignoredTypeCell: "misc",
        }),
      ),
    ).toEqual([
      { kind: "sign", type: "income" },
      { kind: "typeCellUnknown", value: "misc" },
    ]);
  });

  it("names the debit and credit columns when they gave the type", () => {
    expect(
      confirmReasons(
        guess({ evidence: { kind: "debitCredit", direction: "out" } }),
      ),
    ).toEqual([{ kind: "debitCredit", type: "expense" }]);
  });
});

describe("splitSegments", () => {
  it("lists the part of a deposit that each account of the chain receives", () => {
    const transfer: SavingsTransfer = {
      kind: "deposit",
      index: 0,
      date: "2026-03-10",
      placements: [
        { accountId: 2, amount: 10_000 },
        { accountId: 3, amount: 20_000 },
      ],
      unplaced: 0,
    };

    expect(splitSegments(transfer)).toEqual([
      { direction: "to", accountId: 2, amount: 10_000 },
      { direction: "to", accountId: 3, amount: 20_000 },
    ]);
  });

  it("lists the part of a deposit that fits nowhere after the others", () => {
    const transfer: SavingsTransfer = {
      kind: "deposit",
      index: 0,
      date: "2026-03-10",
      placements: [{ accountId: 2, amount: 10_000 }],
      unplaced: 3_000,
    };

    expect(splitSegments(transfer)).toEqual([
      { direction: "to", accountId: 2, amount: 10_000 },
      { direction: "unplaced", accountId: null, amount: 3_000 },
    ]);
  });

  it("lists a withdrawal as one amount coming from the savings account", () => {
    const transfer: SavingsTransfer = {
      kind: "withdrawal",
      index: 1,
      date: "2026-03-11",
      accountId: 2,
      amount: 5_000,
    };

    expect(splitSegments(transfer)).toEqual([
      { direction: "from", accountId: 2, amount: 5_000 },
    ]);
  });
});

describe("nextFileToSettle", () => {
  const phases = (...list: FilePhase[]) => list;

  it("lets the first file be imported at once", () => {
    expect(nextFileToSettle(phases("reviewing", "reviewing"), 0)).toBeNull();
  });

  it("points at the first earlier file that is still to be imported or cancelled", () => {
    expect(
      nextFileToSettle(phases("done", "reviewing", "reviewing"), 2),
    ).toBe(1);
  });

  it("waits for a file that is being imported", () => {
    expect(nextFileToSettle(phases("importing", "reviewing"), 1)).toBe(0);
  });

  it.each(["done", "cancelled", "failed"] as const)(
    "does not wait for a file that is %s",
    (phase) => {
      expect(nextFileToSettle(phases(phase, "reviewing"), 1)).toBeNull();
    },
  );

  it("does not wait for the files after it", () => {
    expect(nextFileToSettle(phases("done", "reviewing", "reviewing"), 1)).toBeNull();
  });
});

const EXPENSE: RowDetails = {
  type: "expense",
  categoryId: null,
  paymentMode: null,
  description: null,
  savingsAccountId: null,
};

const SAVINGS: RowDetails = { ...EXPENSE, type: "savings" };

function reviewedRow(overrides: Partial<ReviewedRow> = {}): ReviewedRow {
  return {
    draft: { date: "2026-03-10", label: "VIR LIVRET", amount: "-300,00", externalId: null },
    details: SAVINGS,
    isDuplicate: false,
    ...overrides,
  };
}

describe("reviewRowProblem", () => {
  const problem = (row: ReviewedRow, defaultSavingsAccountId: number | null = null) =>
    reviewRowProblem(row.draft, row.details, "EUR", defaultSavingsAccountId);

  it("reports the text that cannot be read before looking at the details", () => {
    expect(
      problem(reviewedRow({ draft: { date: "", label: "X", amount: "-1", externalId: null } })),
    ).toBe("dateInvalid");
  });

  it("reports an expense whose amount is positive", () => {
    expect(
      problem(reviewedRow({ details: EXPENSE, draft: { date: "2026-03-10", label: "X", amount: "12,00", externalId: null } })),
    ).toBe("typeSignMismatch");
  });

  it("accepts an expense whose amount is negative", () => {
    expect(problem(reviewedRow({ details: EXPENSE }))).toBeNull();
  });

  it("asks for a savings account when neither the row nor the file names one", () => {
    expect(problem(reviewedRow())).toBe("savingsAccountRequired");
  });

  it("takes the savings account of the file for a row that names none", () => {
    expect(problem(reviewedRow(), 2)).toBeNull();
  });

  it("accepts a savings row that names its own account", () => {
    expect(problem(reviewedRow({ details: { ...SAVINGS, savingsAccountId: 3 } }))).toBeNull();
  });
});

describe("planReview", () => {
  const A_ID = 2;
  const B_ID = 3;
  const account = (overrides: Partial<OverflowAccount> & { id: number }): OverflowAccount => ({
    currency: "EUR",
    archived: false,
    balance: 0,
    ceiling: null,
    overflowAccountId: null,
    ...overrides,
  });
  // A has room for 100,00 and overflows to B, which has no ceiling.
  const accounts = [
    account({ id: A_ID, balance: 90_000, ceiling: 100_000, overflowAccountId: B_ID }),
    account({ id: B_ID }),
  ];
  const context = { currency: "EUR", defaultSavingsAccountId: A_ID, accounts };
  const deposit = (amount: string, date = "2026-03-10"): ReviewedRow =>
    reviewedRow({ draft: { date, label: "VIR", amount, externalId: null } });
  const file = (rows: ReviewedRow[], overrides: Partial<ReviewedFile> = {}): ReviewedFile => ({
    firstDate: "2026-03-01",
    phase: "reviewing",
    rows,
    ...overrides,
  });

  it("splits a deposit along the chain, by row", () => {
    const [plan] = planReview([file([deposit("-150,00")])], context);

    expect(plan?.splits.get(0)).toEqual([
      { direction: "to", accountId: A_ID, amount: 10_000 },
      { direction: "to", accountId: B_ID, amount: 5_000 },
    ]);
  });

  it("plans a file from the balances the previous file leaves, whatever the order given", () => {
    const first = file([deposit("-80,00")], { firstDate: "2026-03-01" });
    const second = file([deposit("-50,00")], { firstDate: "2026-04-01" });

    const [secondPlan, firstPlan] = planReview([second, first], context);

    expect(firstPlan?.splits.get(0)).toEqual([{ direction: "to", accountId: A_ID, amount: 8_000 }]);
    expect(secondPlan?.splits.get(0)).toEqual([
      { direction: "to", accountId: A_ID, amount: 2_000 },
      { direction: "to", accountId: B_ID, amount: 3_000 },
    ]);
  });

  it.each(["cancelled", "failed"] as const)(
    "plans from the balances as they are when the previous file is %s",
    (phase) => {
      const first = file([deposit("-80,00")], { phase });
      const second = file([deposit("-50,00")], { firstDate: "2026-04-01" });

      const [firstPlan, secondPlan] = planReview([first, second], context);

      expect(firstPlan?.splits.size).toBe(0);
      expect(secondPlan?.splits.get(0)).toEqual([{ direction: "to", accountId: A_ID, amount: 5_000 }]);
    },
  );

  it("counts a file already imported: the balances of the page were read before it", () => {
    const first = file([deposit("-80,00")], { phase: "done" });
    const second = file([deposit("-50,00")], { firstDate: "2026-04-01" });

    const [, secondPlan] = planReview([first, second], context);

    expect(secondPlan?.splits.get(0)).toEqual([
      { direction: "to", accountId: A_ID, amount: 2_000 },
      { direction: "to", accountId: B_ID, amount: 3_000 },
    ]);
  });

  it("leaves out the rows the account already holds, the other types and the unreadable rows", () => {
    const [plan] = planReview(
      [
        file([
          deposit("-10,00"),
          reviewedRow({ isDuplicate: true }),
          reviewedRow({ details: EXPENSE }),
          reviewedRow({ draft: { date: "", label: "X", amount: "-5,00", externalId: null } }),
        ]),
      ],
      context,
    );

    expect([...(plan?.splits.keys() ?? [])]).toEqual([0]);
  });

  it("uses the savings account of the row before the one of the file", () => {
    const [plan] = planReview(
      [file([reviewedRow({ details: { ...SAVINGS, savingsAccountId: B_ID } })])],
      context,
    );

    expect(plan?.splits.get(0)).toEqual([{ direction: "to", accountId: B_ID, amount: 30_000 }]);
  });

  it("leaves out a savings row with no account, and one the page does not know", () => {
    const [plan] = planReview(
      [file([deposit("-10,00"), reviewedRow({ details: { ...SAVINGS, savingsAccountId: 99 } })])],
      { ...context, defaultSavingsAccountId: null },
    );

    expect(plan?.splits.size).toBe(0);
  });

  it("shows a withdrawal as an amount coming from the savings account", () => {
    const [plan] = planReview([file([deposit("50,00")])], context);

    expect(plan?.splits.get(0)).toEqual([{ direction: "from", accountId: A_ID, amount: 5_000 }]);
  });

  it("shows the part of a deposit that fits nowhere", () => {
    const [plan] = planReview([file([deposit("-150,00")])], {
      ...context,
      accounts: [account({ id: A_ID, balance: 90_000, ceiling: 100_000 }), account({ id: B_ID })],
    });

    expect(plan?.splits.get(0)).toEqual([
      { direction: "to", accountId: A_ID, amount: 10_000 },
      { direction: "unplaced", accountId: null, amount: 5_000 },
    ]);
  });

  it("reports a loop in the chain and splits nothing", () => {
    const [plan] = planReview([file([deposit("-10,00")])], {
      ...context,
      accounts: [
        account({ id: A_ID, overflowAccountId: B_ID }),
        account({ id: B_ID, overflowAccountId: A_ID }),
      ],
    });

    expect(plan?.isChainLooping).toBe(true);
    expect(plan?.splits.size).toBe(0);
  });
});
