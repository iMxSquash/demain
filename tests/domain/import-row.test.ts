import { describe, expect, it } from "vitest";

import { fingerprintRows, type ImportedRow } from "../../src/domain/import-row";

function row(overrides: Partial<ImportedRow> = {}): ImportedRow {
  return {
    date: "2026-02-01",
    amount: -1_250,
    label: "CARD SHOP",
    externalId: null,
    ...overrides,
  };
}

describe("fingerprintRows", () => {
  it("uses the bank identifier when there is one", () => {
    const [fingerprinted] = fingerprintRows([row({ externalId: "FIT-1" })]);

    expect(fingerprinted?.fingerprint).toBe("id:FIT-1");
  });

  it("derives the fingerprint from date, amount and label otherwise", () => {
    const [a] = fingerprintRows([row()]);
    const [b] = fingerprintRows([row()]);

    expect(a?.fingerprint).toBe(b?.fingerprint);
  });

  it("ignores case and spacing of the label", () => {
    const [a] = fingerprintRows([row({ label: "Card  Shop" })]);
    const [b] = fingerprintRows([row({ label: " CARD SHOP " })]);

    expect(a?.fingerprint).toBe(b?.fingerprint);
  });

  it("tells apart rows that differ by date, amount or label", () => {
    const fingerprints = fingerprintRows([
      row(),
      row({ date: "2026-02-02" }),
      row({ amount: -1_251 }),
      row({ label: "OTHER" }),
    ]).map((entry) => entry.fingerprint);

    expect(new Set(fingerprints).size).toBe(4);
  });

  it("numbers identical rows of one file so that each keeps its own fingerprint", () => {
    const fingerprints = fingerprintRows([row(), row(), row()]).map(
      (entry) => entry.fingerprint,
    );

    expect(new Set(fingerprints).size).toBe(3);
  });

  it("gives the same fingerprints when the same file is read again", () => {
    const first = fingerprintRows([row(), row()]).map((entry) => entry.fingerprint);
    const second = fingerprintRows([row(), row()]).map((entry) => entry.fingerprint);

    expect(second).toEqual(first);
  });

  it("gives a row with a bank identifier the same content key as the same row without one", () => {
    const [withId] = fingerprintRows([row({ externalId: "FIT-1" })]);
    const [withoutId] = fingerprintRows([row()]);

    expect(withId?.contentKey).toBe(withoutId?.contentKey);
    expect(withoutId?.fingerprint).toBe(withoutId?.contentKey);
  });

  it("does not confuse a bank identifier with a derived fingerprint", () => {
    const [byId] = fingerprintRows([row({ externalId: "2026-02-01|-1250|card shop|0" })]);
    const [derived] = fingerprintRows([row()]);

    expect(byId?.fingerprint).not.toBe(derived?.fingerprint);
  });
});
