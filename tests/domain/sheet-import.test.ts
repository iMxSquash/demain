import { describe, expect, it } from "vitest";

import type { OverflowAccount } from "../../src/domain/overflow";
import {
  splitSavingsRows,
  type SavingsRow,
} from "../../src/domain/sheet-import";

const LIVRET_JEUNE = 2;
const LIVRET_A = 3;

// Opening balances and ceilings of the migration, in minor units.
const accounts = (): OverflowAccount[] => [
  {
    id: LIVRET_JEUNE,
    currency: "EUR",
    archived: false,
    balance: 147_684,
    ceiling: 160_000,
    overflowAccountId: LIVRET_A,
  },
  {
    id: LIVRET_A,
    currency: "EUR",
    archived: false,
    balance: 0,
    ceiling: null,
    overflowAccountId: null,
  },
];

const SOURCE = "january.csv";

const row = (line: number, date: string, amount: number): SavingsRow => ({
  source: SOURCE,
  line,
  date,
  label: "Savings",
  amount,
});

describe("splitSavingsRows", () => {
  it("splits the first row at the ceiling of the Livret Jeune", () => {
    const result = splitSavingsRows(
      [row(2, "2026-01-31", 57_316)],
      LIVRET_JEUNE,
      accounts(),
    );

    expect(result.splits[0]?.placements).toEqual([
      { accountId: LIVRET_JEUNE, amount: 12_316 },
      { accountId: LIVRET_A, amount: 45_000 },
    ]);
  });

  it("sends the following rows to the next account once the ceiling is reached", () => {
    const result = splitSavingsRows(
      [row(2, "2026-01-31", 57_316), row(3, "2026-02-28", 40_000)],
      LIVRET_JEUNE,
      accounts(),
    );

    expect(result.splits[1]?.placements).toEqual([
      { accountId: LIVRET_A, amount: 40_000 },
    ]);
  });

  it("places the rows in date order, whatever the order of the input", () => {
    const result = splitSavingsRows(
      [row(3, "2026-02-28", 40_000), row(2, "2026-01-31", 57_316)],
      LIVRET_JEUNE,
      accounts(),
    );

    expect(result.splits.map((split) => split.row.line)).toEqual([2, 3]);
    expect(result.splits[0]?.placements).toEqual([
      { accountId: LIVRET_JEUNE, amount: 12_316 },
      { accountId: LIVRET_A, amount: 45_000 },
    ]);
  });

  it("keeps the file order for rows of the same day", () => {
    const result = splitSavingsRows(
      [row(4, "2026-01-31", 1_000), row(2, "2026-01-31", 2_000)],
      LIVRET_JEUNE,
      accounts(),
    );

    expect(result.splits.map((split) => split.row.line)).toEqual([4, 2]);
  });

  it("does not change the accounts it is given", () => {
    const given = accounts();

    splitSavingsRows([row(2, "2026-01-31", 57_316)], LIVRET_JEUNE, given);

    expect(given).toEqual(accounts());
  });

  it("reports the part that fits nowhere along the chain", () => {
    const capped = accounts().map((account) =>
      account.id === LIVRET_A ? { ...account, ceiling: 10_000 } : account,
    );

    const result = splitSavingsRows(
      [row(2, "2026-01-31", 57_316)],
      LIVRET_JEUNE,
      capped,
    );

    expect(result.splits[0]?.placements).toEqual([
      { accountId: LIVRET_JEUNE, amount: 12_316 },
      { accountId: LIVRET_A, amount: 10_000 },
    ]);
    expect(result.splits[0]?.unplaced).toBe(35_000);
    expect(result.issues).toEqual([
      { kind: "savingsUnplaced", source: SOURCE, line: 2, amount: 35_000 },
    ]);
  });

  it("reports a row whose amount is not a positive integer and keeps the others", () => {
    const result = splitSavingsRows(
      [
        row(2, "2026-01-31", -500),
        row(3, "2026-01-31", 12.5),
        row(4, "2026-01-31", 1_000),
      ],
      LIVRET_JEUNE,
      accounts(),
    );

    expect(result.splits.map((split) => split.row.line)).toEqual([4]);
    expect(result.issues).toEqual([
      { kind: "savingsAmountInvalid", source: SOURCE, line: 2 },
      { kind: "savingsAmountInvalid", source: SOURCE, line: 3 },
    ]);
  });

  it("reports a chain that loops, once, instead of placing anything", () => {
    const looping = accounts().map((account) =>
      account.id === LIVRET_A
        ? { ...account, overflowAccountId: LIVRET_JEUNE }
        : account,
    );

    const result = splitSavingsRows(
      [row(2, "2026-01-31", 57_316), row(3, "2026-02-28", 1_000)],
      LIVRET_JEUNE,
      looping,
    );

    expect(result.splits).toEqual([]);
    expect(result.issues).toEqual([{ kind: "overflowChainCycle" }]);
  });

  it("reports nothing when every row is placed", () => {
    const result = splitSavingsRows(
      [row(2, "2026-01-31", 57_316)],
      LIVRET_JEUNE,
      accounts(),
    );

    expect(result.issues).toEqual([]);
    expect(result.splits[0]?.unplaced).toBe(0);
  });

  it("keeps reporting invalid rows when the chain also loops", () => {
    const looping = accounts().map((account) =>
      account.id === LIVRET_A
        ? { ...account, overflowAccountId: LIVRET_JEUNE }
        : account,
    );

    const result = splitSavingsRows(
      [row(2, "2026-01-31", 1_000), row(3, "2026-02-28", -500)],
      LIVRET_JEUNE,
      looping,
    );

    expect(result.issues).toEqual([
      { kind: "savingsAmountInvalid", source: SOURCE, line: 3 },
      { kind: "overflowChainCycle" },
    ]);
  });

  it("tells apart the rows of different files that share a line number", () => {
    const result = splitSavingsRows(
      [
        { ...row(2, "2026-01-31", -500), source: "january.csv" },
        { ...row(2, "2026-02-28", -500), source: "february.csv" },
      ],
      LIVRET_JEUNE,
      accounts(),
    );

    expect(result.issues).toEqual([
      { kind: "savingsAmountInvalid", source: "january.csv", line: 2 },
      { kind: "savingsAmountInvalid", source: "february.csv", line: 2 },
    ]);
  });
});
