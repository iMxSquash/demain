import { describe, expect, it } from "vitest";

import {
  checkSavingsAccount,
  defaultSavingsAccountId,
  firstMovementDate,
  isSelectableSavingsAccount,
  lastMovementDate,
  orderFilesByDate,
  planFilesInDateOrder,
  planSavingsTransfers,
  type SavingsAccountChoice,
  type SavingsAccountCandidate,
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
        stoppedAt: B_ID,
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
        stoppedAt: B_ID,
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
        stoppedAt: B_ID,
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
        stoppedAt: B_ID,
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
        stoppedAt: A_ID,
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

  it("leaves a single file where it is", () => {
    expect(orderFilesByDate([february])).toEqual([february]);
    expect(planFilesInDateOrder([february], chain()).map(({ file }) => file.name)).toEqual([
      "february.csv",
    ]);
  });

  it("plans a file with no movement without touching the balances", () => {
    const empty = { name: "empty.csv", firstDate: null, movements: [] };

    const planned = planFilesInDateOrder([empty, january], chain());

    expect(planned.map(({ file }) => file.name)).toEqual(["january.csv", "empty.csv"]);
    expect(planned[1]?.plan.accounts).toEqual(planned[0]?.plan.accounts);
  });

  it("gives the ceiling to the file that is first in time, whatever the order chosen", () => {
    const earlier = { name: "earlier.csv", firstDate: "2026-03-02", movements: [movement({ date: "2026-03-02", amount: -10_000 })] };
    const later = { name: "later.csv", firstDate: "2026-03-10", movements: [movement({ date: "2026-03-10", amount: -10_000 })] };

    const [first, second] = planFilesInDateOrder([later, earlier], chain());

    expect(first?.file.name).toBe("earlier.csv");
    expect(first?.plan.transfers[0]).toMatchObject({ placements: [{ accountId: A_ID, amount: 10_000 }] });
    expect(second?.plan.transfers[0]).toMatchObject({ placements: [{ accountId: B_ID, amount: 10_000 }] });
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
          stoppedAt: B_ID,
        },
      ],
      [
        {
          kind: "deposit",
          index: 0,
          date: "2026-02-01",
          placements: [{ accountId: B_ID, amount: 10_000 }],
          unplaced: 0,
          stoppedAt: B_ID,
        },
      ],
    ]);
  });
});

describe("checkSavingsAccount", () => {
  const RECEIVING_ID = 1;

  function candidate(
    overrides: Partial<SavingsAccountCandidate> = {},
  ): SavingsAccountCandidate {
    return { id: A_ID, kind: "savings", archived: false, currency: "EUR", ...overrides };
  }

  it("accepts an active savings account other than the one that receives the file", () => {
    expect(checkSavingsAccount(RECEIVING_ID, candidate())).toBeNull();
  });

  it("refuses an account that does not exist", () => {
    expect(checkSavingsAccount(RECEIVING_ID, undefined)).toEqual({
      key: "importSavingsAccountUnknown",
    });
  });

  it("refuses an archived account", () => {
    expect(checkSavingsAccount(RECEIVING_ID, candidate({ archived: true }))).toEqual({
      key: "importSavingsAccountArchived",
    });
  });

  it.each(["checking", "other"] as const)("refuses an account of kind %s", (kind) => {
    expect(checkSavingsAccount(RECEIVING_ID, candidate({ kind }))).toEqual({
      key: "importSavingsAccountNotSavings",
    });
  });

  it("refuses the account that receives the file", () => {
    expect(checkSavingsAccount(A_ID, candidate())).toEqual({
      key: "importSavingsAccountSameAsAccount",
    });
  });
});

describe("savings account choices", () => {
  const RECEIVING = { id: 1, currency: "EUR" };
  const C_ID = 4;

  function choice(
    overrides: Partial<SavingsAccountChoice> & { id: number },
  ): SavingsAccountChoice {
    return {
      kind: "savings",
      archived: false,
      currency: "EUR",
      overflowAccountId: null,
      ...overrides,
    };
  }

  // Checking 1, then A (head) overflowing to B.
  function sheetAccounts(): SavingsAccountChoice[] {
    return [
      choice({ id: RECEIVING.id, kind: "checking" }),
      choice({ id: A_ID, overflowAccountId: B_ID }),
      choice({ id: B_ID }),
    ];
  }

  describe("isSelectableSavingsAccount", () => {
    it("accepts an active savings account of the same currency", () => {
      expect(isSelectableSavingsAccount(RECEIVING, choice({ id: A_ID }))).toBe(true);
    });

    it.each([
      ["another currency", { currency: "USD" }],
      ["an archived account", { archived: true }],
      ["a checking account", { kind: "checking" as const }],
      ["the account of the file", { id: RECEIVING.id }],
    ])("refuses %s", (_name, overrides) => {
      expect(
        isSelectableSavingsAccount(RECEIVING, choice({ id: A_ID, ...overrides })),
      ).toBe(false);
    });
  });

  describe("defaultSavingsAccountId", () => {
    it("is the savings account that no active account overflows to", () => {
      expect(defaultSavingsAccountId(sheetAccounts(), RECEIVING)).toBe(A_ID);
    });

    it("is the only savings account when it overflows nowhere", () => {
      const accounts = [choice({ id: RECEIVING.id, kind: "checking" }), choice({ id: A_ID })];

      expect(defaultSavingsAccountId(accounts, RECEIVING)).toBe(A_ID);
    });

    it("is none when several savings accounts head a chain", () => {
      const accounts = [...sheetAccounts(), choice({ id: C_ID })];

      expect(defaultSavingsAccountId(accounts, RECEIVING)).toBeNull();
    });

    it("is none without a savings account", () => {
      const accounts = [choice({ id: RECEIVING.id, kind: "checking" })];

      expect(defaultSavingsAccountId(accounts, RECEIVING)).toBeNull();
    });

    it("leaves out the accounts of another currency", () => {
      const accounts = [
        ...sheetAccounts(),
        choice({ id: C_ID, currency: "USD" }),
      ];

      expect(defaultSavingsAccountId(accounts, RECEIVING)).toBe(A_ID);
    });

    it("is none when the head of the chain is the account that receives the file", () => {
      expect(defaultSavingsAccountId(sheetAccounts(), { id: A_ID, currency: "EUR" })).toBeNull();
    });

    it("ignores an archived account that still points to a savings account", () => {
      const accounts = [
        choice({ id: RECEIVING.id, kind: "checking" }),
        choice({ id: A_ID }),
        choice({ id: C_ID, archived: true, overflowAccountId: A_ID }),
      ];

      expect(defaultSavingsAccountId(accounts, RECEIVING)).toBe(A_ID);
    });

    it("counts any active account that overflows to a savings account, not only savings ones", () => {
      const accounts = [
        choice({ id: RECEIVING.id, kind: "checking", overflowAccountId: A_ID }),
        choice({ id: A_ID }),
        choice({ id: B_ID }),
      ];

      expect(defaultSavingsAccountId(accounts, RECEIVING)).toBe(B_ID);
    });
  });
});

describe("firstMovementDate", () => {
  it("is the earliest valid date, whatever the order of the rows", () => {
    expect(firstMovementDate(["2026-03-10", "2026-02-27", "2026-03-01"])).toBe("2026-02-27");
  });

  it("skips a date that is empty or not a calendar date", () => {
    expect(firstMovementDate(["", "2026-02-30", "2026-03-01"])).toBe("2026-03-01");
  });

  it("is null when no date is valid", () => {
    expect(firstMovementDate([])).toBeNull();
    expect(firstMovementDate([""])).toBeNull();
  });
});

describe("lastMovementDate", () => {
  it("is the latest calendar date", () => {
    expect(lastMovementDate(["2026-03-10", "2026-03-27", "2026-03-01"])).toBe("2026-03-27");
  });

  it("skips what is not a calendar date, and is null when none is left", () => {
    expect(lastMovementDate(["", "2026-02-30", "2026-03-01"])).toBe("2026-03-01");
    expect(lastMovementDate([""])).toBeNull();
    expect(lastMovementDate([])).toBeNull();
  });
});
