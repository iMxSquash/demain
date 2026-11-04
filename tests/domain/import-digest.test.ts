import { describe, expect, it } from "vitest";

import {
  digestBatchTransactions,
  type DigestRow,
} from "../../src/domain/import-digest";

const FIRST: DigestRow = {
  id: 1,
  accountId: 1,
  date: "2026-03-10",
  amount: -1_250,
  kind: "expense",
  label: "CARD SHOP",
  description: null,
  paymentMode: null,
  categoryId: null,
  transferCounterpartId: null,
};

const SECOND: DigestRow = {
  ...FIRST,
  id: 2,
  date: "2026-03-11",
  amount: 4_000,
  kind: "income",
  label: "SALARY",
};

const FIELD_CHANGES: [string, Partial<DigestRow>][] = [
  ["id", { id: 9 }],
  ["accountId", { accountId: 2 }],
  ["date", { date: "2026-03-12" }],
  ["amount", { amount: -1_251 }],
  ["kind", { kind: "interest" }],
  ["label", { label: "CARD SHOP 2" }],
  ["description", { description: "note" }],
  ["paymentMode", { paymentMode: "card" }],
  ["categoryId", { categoryId: 3 }],
  ["transferCounterpartId", { transferCounterpartId: 2 }],
];

describe("digestBatchTransactions", () => {
  it("returns a SHA-256 hexadecimal string", () => {
    expect(digestBatchTransactions([FIRST])).toMatch(/^[0-9a-f]{64}$/);
  });

  // Stored batches are checked against digests taken in this format: changing
  // it would make every recorded file refuse its undo.
  it("keeps the digest format of the batches already recorded", () => {
    const full: DigestRow = {
      id: 2,
      accountId: 1,
      date: "2026-03-11",
      amount: 4_000,
      kind: "transfer",
      label: 'Quote " \u00e9',
      description: "note",
      paymentMode: "card",
      categoryId: 3,
      transferCounterpartId: 1,
    };

    expect(digestBatchTransactions([FIRST, full])).toBe(
      "0e0dc7a14b66eb1df13061b05219dcb846ee9715478ef574f8582b254a3734a9",
    );
  });

  it("gives the same digest to the same content", () => {
    expect(digestBatchTransactions([FIRST, SECOND])).toBe(
      digestBatchTransactions([{ ...FIRST }, { ...SECOND }]),
    );
  });

  it("does not depend on the order of the rows", () => {
    expect(digestBatchTransactions([SECOND, FIRST])).toBe(
      digestBatchTransactions([FIRST, SECOND]),
    );
  });

  it.each(FIELD_CHANGES)("changes when the %s of a row changes", (_field, change) => {
    expect(digestBatchTransactions([{ ...FIRST, ...change }, SECOND])).not.toBe(
      digestBatchTransactions([FIRST, SECOND]),
    );
  });

  it("changes when a row is missing", () => {
    expect(digestBatchTransactions([FIRST])).not.toBe(
      digestBatchTransactions([FIRST, SECOND]),
    );
  });

  it("tells null from undefined", () => {
    expect(digestBatchTransactions([{ ...FIRST, description: undefined }])).not.toBe(
      digestBatchTransactions([{ ...FIRST, description: null }]),
    );
  });

  it("tells a null description from the text null", () => {
    expect(digestBatchTransactions([{ ...FIRST, description: "null" }])).not.toBe(
      digestBatchTransactions([{ ...FIRST, description: null }]),
    );
  });

  it("does not let a text move into the next field", () => {
    expect(
      digestBatchTransactions([{ ...FIRST, label: "A", description: "B" }]),
    ).not.toBe(digestBatchTransactions([{ ...FIRST, label: "A\",\"B", description: null }]));
  });
});
