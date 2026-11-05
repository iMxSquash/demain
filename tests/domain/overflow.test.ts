import { describe, expect, it } from "vitest";

import {
  assertOverflowTargetAllowed,
  overflowTargetsOf,
  routeAlongOverflowChain,
  type OverflowAccount,
} from "../../src/domain/overflow";

const LIVRET_A_ID = 1;
const LIVRET_JEUNE_ID = 2;
const CHECKING_ID = 3;

function account(
  overrides: Partial<OverflowAccount> & { id: number; kind?: string },
): OverflowAccount & { kind: string } {
  return {
    currency: "EUR",
    balance: 0,
    ceiling: null,
    overflowAccountId: null,
    archived: false,
    kind: "savings",
    ...overrides,
  };
}

describe("routeAlongOverflowChain", () => {
  it("splits a transfer between a nearly full account and its overflow account", () => {
    const accounts = [
      account({
        id: LIVRET_JEUNE_ID,
        balance: 155_000,
        ceiling: 160_000,
        overflowAccountId: LIVRET_A_ID,
      }),
      account({ id: LIVRET_A_ID, balance: 1_000_000 }),
    ];

    const result = routeAlongOverflowChain(20_000, LIVRET_JEUNE_ID, accounts);

    expect(result).toEqual({
      status: "ok",
      placements: [
        { accountId: LIVRET_JEUNE_ID, amount: 5_000 },
        { accountId: LIVRET_A_ID, amount: 15_000 },
      ],
      unplaced: 0,
    });
  });

  it("leaves in the source account what fits nowhere along the chain", () => {
    const accounts = [
      account({
        id: LIVRET_JEUNE_ID,
        balance: 155_000,
        ceiling: 160_000,
        overflowAccountId: LIVRET_A_ID,
      }),
      account({ id: LIVRET_A_ID, balance: 2_290_000, ceiling: 2_295_000 }),
    ];

    const result = routeAlongOverflowChain(20_000, LIVRET_JEUNE_ID, accounts);

    expect(result).toEqual({
      status: "ok",
      placements: [
        { accountId: LIVRET_JEUNE_ID, amount: 5_000 },
        { accountId: LIVRET_A_ID, amount: 5_000 },
      ],
      unplaced: 10_000,
    });
  });

  it("reports a corrupted chain that loops and places nothing", () => {
    const accounts = [
      account({ id: LIVRET_A_ID, ceiling: 1_000, overflowAccountId: LIVRET_JEUNE_ID }),
      account({ id: LIVRET_JEUNE_ID, ceiling: 1_000, overflowAccountId: LIVRET_A_ID }),
    ];

    const result = routeAlongOverflowChain(5_000, LIVRET_A_ID, accounts);

    expect(result).toEqual({ status: "invalid", reason: "cycle" });
  });

  it("reports a loop even when the amount fits before it is reached", () => {
    const accounts = [
      account({ id: LIVRET_A_ID, overflowAccountId: LIVRET_JEUNE_ID }),
      account({ id: LIVRET_JEUNE_ID, overflowAccountId: LIVRET_A_ID }),
    ];

    const result = routeAlongOverflowChain(5_000, LIVRET_A_ID, accounts);

    expect(result).toEqual({ status: "invalid", reason: "cycle" });
  });
});

describe("routeAlongOverflowChain input", () => {
  const accounts = [account({ id: LIVRET_A_ID })];

  it("places nothing for a zero amount", () => {
    expect(routeAlongOverflowChain(0, LIVRET_A_ID, accounts)).toEqual({
      status: "ok",
      placements: [],
      unplaced: 0,
    });
  });

  it.each([-1, 12.5, Number.NaN])("rejects the amount %s", (amount) => {
    expect(() => routeAlongOverflowChain(amount, LIVRET_A_ID, accounts)).toThrow(
      RangeError,
    );
  });

  it("rejects an unknown destination instead of reporting everything unplaced", () => {
    expect(() => routeAlongOverflowChain(100, 99, accounts)).toThrow(
      /unknown account/i,
    );
  });
});

describe("assertOverflowTargetAllowed", () => {
  const candidate = (id: number | null, currency = "EUR") => ({ id, currency });
  const expectRefused = (fn: () => void) =>
    expect(fn).toThrow(
      expect.objectContaining({
        name: "AccountValidationError",
        field: "overflowAccountId",
      }),
    );

  it("accepts an active account of the same currency", () => {
    const accounts = [account({ id: LIVRET_JEUNE_ID }), account({ id: LIVRET_A_ID })];

    expect(() =>
      assertOverflowTargetAllowed(candidate(LIVRET_JEUNE_ID), LIVRET_A_ID, accounts),
    ).not.toThrow();
  });

  it("refuses an account that overflows to itself", () => {
    const accounts = [account({ id: LIVRET_A_ID })];

    expectRefused(() =>
      assertOverflowTargetAllowed(candidate(LIVRET_A_ID), LIVRET_A_ID, accounts),
    );
  });

  it("refuses a target that overflows back to the account", () => {
    const accounts = [
      account({ id: LIVRET_A_ID }),
      account({ id: LIVRET_JEUNE_ID, overflowAccountId: LIVRET_A_ID }),
    ];

    expectRefused(() =>
      assertOverflowTargetAllowed(candidate(LIVRET_A_ID), LIVRET_JEUNE_ID, accounts),
    );
  });

  it("refuses a longer loop through several accounts", () => {
    const accounts = [
      account({ id: LIVRET_A_ID }),
      account({ id: LIVRET_JEUNE_ID, overflowAccountId: CHECKING_ID }),
      account({ id: CHECKING_ID, overflowAccountId: LIVRET_A_ID }),
    ];

    expectRefused(() =>
      assertOverflowTargetAllowed(candidate(LIVRET_A_ID), LIVRET_JEUNE_ID, accounts),
    );
  });

  it("refuses a target in another currency", () => {
    const accounts = [
      account({ id: LIVRET_JEUNE_ID }),
      account({ id: LIVRET_A_ID, currency: "USD" }),
    ];

    expectRefused(() =>
      assertOverflowTargetAllowed(candidate(LIVRET_JEUNE_ID), LIVRET_A_ID, accounts),
    );
  });

  it("checks the currency typed for an account that does not exist yet", () => {
    const accounts = [account({ id: LIVRET_A_ID, currency: "EUR" })];

    expectRefused(() =>
      assertOverflowTargetAllowed(candidate(null, "USD"), LIVRET_A_ID, accounts),
    );
    expect(() =>
      assertOverflowTargetAllowed(candidate(null, "EUR"), LIVRET_A_ID, accounts),
    ).not.toThrow();
  });

  it("refuses an archived target", () => {
    const accounts = [
      account({ id: LIVRET_JEUNE_ID }),
      account({ id: LIVRET_A_ID, archived: true }),
    ];

    expectRefused(() =>
      assertOverflowTargetAllowed(candidate(LIVRET_JEUNE_ID), LIVRET_A_ID, accounts),
    );
  });

  it("refuses a checking account as target", () => {
    const accounts = [
      account({ id: LIVRET_JEUNE_ID }),
      account({ id: CHECKING_ID, kind: "checking" }),
    ];

    expectRefused(() =>
      assertOverflowTargetAllowed(candidate(LIVRET_JEUNE_ID), CHECKING_ID, accounts),
    );
  });

  it("refuses an archived savings account as target", () => {
    const accounts = [
      account({ id: LIVRET_JEUNE_ID }),
      account({ id: LIVRET_A_ID, kind: "savings", archived: true }),
    ];

    expectRefused(() =>
      assertOverflowTargetAllowed(candidate(LIVRET_JEUNE_ID), LIVRET_A_ID, accounts),
    );
  });

  it("refuses an unknown target", () => {
    const accounts = [account({ id: LIVRET_JEUNE_ID })];

    expectRefused(() =>
      assertOverflowTargetAllowed(candidate(LIVRET_JEUNE_ID), 99, accounts),
    );
  });

  it("terminates on stored data that already contains a loop elsewhere", () => {
    const accounts = [
      account({ id: LIVRET_JEUNE_ID }),
      account({ id: LIVRET_A_ID, overflowAccountId: CHECKING_ID }),
      account({ id: CHECKING_ID, overflowAccountId: LIVRET_A_ID }),
    ];

    expect(() =>
      assertOverflowTargetAllowed(candidate(LIVRET_JEUNE_ID), LIVRET_A_ID, accounts),
    ).not.toThrow();
  });
});

describe("overflowTargetsOf", () => {
  it("keeps only the active savings accounts", () => {
    const accounts = [
      account({ id: 1 }),
      account({ id: 2, kind: "checking" }),
      account({ id: 3, kind: "other" }),
      account({ id: 4, archived: true }),
    ];

    expect(overflowTargetsOf(accounts).map(({ id }) => id)).toEqual([1]);
  });
});
