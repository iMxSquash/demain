import { describe, expect, it } from "vitest";

import {
  orderFilesByDate,
  planFilesInDateOrder,
  planSavingsTransfers,
  type SavingsMovement,
} from "../../src/domain/import-savings";
import type { OverflowAccount } from "../../src/domain/overflow";

const A_ID = 2;
const B_ID = 3;

function account(
  overrides: Partial<OverflowAccount> & { id: number },
): OverflowAccount {
  return {
    currency: "EUR",
    archived: false,
    balance: 0,
    ceiling: null,
    overflowAccountId: null,
    ...overrides,
  };
}

// A is nearly full and overflows to B, which has no ceiling.
function chain(): OverflowAccount[] {
  return [
    account({ id: A_ID, balance: 90_000, ceiling: 100_000, overflowAccountId: B_ID }),
    account({ id: B_ID }),
  ];
}

function movement(overrides: Partial<SavingsMovement> = {}): SavingsMovement {
  return {
    index: 0,
    date: "2026-03-10",
    amount: -30_000,
    savingsAccountId: A_ID,
    ...overrides,
  };
}

const balancesOf = (accounts: readonly OverflowAccount[]) =>
  Object.fromEntries(accounts.map((a) => [a.id, a.balance]));

describe("planSavingsTransfers", () => {
  it("splits a deposit along the overflow chain, from the balances it is given", () => {
    const plan = planSavingsTransfers([movement()], chain());

    expect(plan.transfers).toEqual([
      {
        kind: "deposit",
        index: 0,
        date: "2026-03-10",
        placements: [
          { accountId: A_ID, amount: 10_000 },
          { accountId: B_ID, amount: 20_000 },
        ],
        unplaced: 0,
      },
    ]);
    expect(plan.issues).toEqual([]);
    expect(balancesOf(plan.accounts)).toEqual({ [A_ID]: 100_000, [B_ID]: 20_000 });
  });

  it("takes a positive amount as a withdrawal from the savings account, in date order", () => {
    const plan = planSavingsTransfers(
      [
        movement({ index: 1, date: "2026-03-20", amount: -15_000 }),
        movement({ index: 0, date: "2026-03-05", amount: 5_000 }),
      ],
      chain(),
    );

    expect(plan.transfers).toEqual([
      { kind: "withdrawal", index: 0, date: "2026-03-05", accountId: A_ID, amount: 5_000 },
      {
        kind: "deposit",
        index: 1,
        date: "2026-03-20",
        placements: [{ accountId: A_ID, amount: 15_000 }],
        unplaced: 0,
      },
    ]);
    expect(balancesOf(plan.accounts)[A_ID]).toBe(100_000);
  });

  it("keeps the order of the file for the movements of one day", () => {
    const plan = planSavingsTransfers(
      [
        movement({ index: 0, amount: -2_000 }),
        movement({ index: 1, amount: -1_000 }),
      ],
      chain(),
    );

    expect(plan.transfers.map((transfer) => transfer.index)).toEqual([0, 1]);
  });

  it("does not check the balance of the savings account on a withdrawal", () => {
    const plan = planSavingsTransfers([movement({ amount: 500_000 })], chain());

    expect(plan.issues).toEqual([]);
    expect(balancesOf(plan.accounts)[A_ID]).toBe(-410_000);
  });

  it("refuses a zero amount and still places the other movements", () => {
    const plan = planSavingsTransfers(
      [movement({ index: 0, amount: 0 }), movement({ index: 1, amount: -1_000 })],
      chain(),
    );

    expect(plan.issues).toEqual([{ kind: "savingsAmountInvalid", index: 0 }]);
    expect(plan.transfers).toEqual([
      {
        kind: "deposit",
        index: 1,
        date: "2026-03-10",
        placements: [{ accountId: A_ID, amount: 1_000 }],
        unplaced: 0,
      },
    ]);
  });

  it("refuses an amount that is not a safe integer", () => {
    const plan = planSavingsTransfers([movement({ amount: -1.5 })], chain());

    expect(plan.issues).toEqual([{ kind: "savingsAmountInvalid", index: 0 }]);
    expect(plan.transfers).toEqual([]);
  });

  it("places everything on an account that has no ceiling", () => {
    const plan = planSavingsTransfers(
      [movement({ amount: -500_000, savingsAccountId: B_ID })],
      chain(),
    );

    expect(plan.transfers).toEqual([
      {
        kind: "deposit",
        index: 0,
        date: "2026-03-10",
        placements: [{ accountId: B_ID, amount: 500_000 }],
        unplaced: 0,
      },
    ]);
  });

  it("reports the part that fits nowhere and keeps the part that fits", () => {
    const accounts = [
      account({ id: A_ID, balance: 90_000, ceiling: 100_000 }),
      account({ id: B_ID }),
    ];

    const plan = planSavingsTransfers([movement()], accounts);

    expect(plan.transfers).toEqual([
      {
        kind: "deposit",
        index: 0,
        date: "2026-03-10",
        placements: [{ accountId: A_ID, amount: 10_000 }],
        unplaced: 20_000,
      },
    ]);
    expect(plan.issues).toEqual([{ kind: "savingsUnplaced", index: 0, amount: 20_000 }]);
  });

  it("plans nothing when the chain loops, and leaves the balances as they were", () => {
    const accounts = [
      account({ id: A_ID, balance: 90_000, ceiling: 100_000, overflowAccountId: B_ID }),
      account({ id: B_ID, balance: 100_000, ceiling: 100_000, overflowAccountId: A_ID }),
    ];

    const plan = planSavingsTransfers([movement()], accounts);

    expect(plan.transfers).toEqual([]);
    expect(plan.issues).toEqual([{ kind: "overflowChainCycle" }]);
    expect(balancesOf(plan.accounts)).toEqual({ [A_ID]: 90_000, [B_ID]: 100_000 });
  });

  it("keeps the invalid amounts reported when a loop stops the placement", () => {
    const accounts = [
      account({ id: A_ID, ceiling: 100_000, overflowAccountId: B_ID }),
      account({ id: B_ID, overflowAccountId: A_ID }),
    ];

    const plan = planSavingsTransfers(
      [movement({ index: 0, amount: 0 }), movement({ index: 1 })],
      accounts,
    );

    expect(plan.issues).toEqual([
      { kind: "savingsAmountInvalid", index: 0 },
      { kind: "overflowChainCycle" },
    ]);
  });

  it("leaves the accounts it receives untouched", () => {
    const accounts = chain();
    const before = structuredClone(accounts);

    planSavingsTransfers([movement()], accounts);

    expect(accounts).toEqual(before);
  });
});

describe("files in date order", () => {
  const january = {
    name: "january.csv",
    firstDate: "2026-01-02" as string | null,
    movements: [movement({ date: "2026-01-02", amount: -10_000 })],
  };
  const february = {
    name: "february.csv",
    firstDate: "2026-02-01" as string | null,
    movements: [movement({ date: "2026-02-01", amount: -10_000 })],
  };

  it("sorts by first date, keeps the original order on a tie and puts a file with no date last", () => {
    const undated = { name: "undated.csv", firstDate: null, movements: [] };
    const sameDay = { ...february, name: "other.csv" };

    const ordered = orderFilesByDate([undated, february, sameDay, january]);

    expect(ordered.map((file) => file.name)).toEqual([
      "january.csv",
      "february.csv",
      "other.csv",
      "undated.csv",
    ]);
  });

  it("plans each file on the balances left by the previous one", () => {
    const planned = planFilesInDateOrder([february, january], chain());

    expect(planned.map(({ file }) => file.name)).toEqual(["january.csv", "february.csv"]);
    expect(planned.map(({ plan }) => plan.transfers)).toEqual([
      [
        {
          kind: "deposit",
          index: 0,
          date: "2026-01-02",
          placements: [{ accountId: A_ID, amount: 10_000 }],
          unplaced: 0,
        },
      ],
      [
        {
          kind: "deposit",
          index: 0,
          date: "2026-02-01",
          placements: [{ accountId: B_ID, amount: 10_000 }],
          unplaced: 0,
        },
      ],
    ]);
  });
});
