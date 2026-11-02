import { describe, expect, it } from "vitest";

import { draftOfRow, readImportDraft } from "../../src/domain/import-draft";

describe("readImportDraft", () => {
  it("reads a typed row into a movement, amount without floating point", () => {
    const result = readImportDraft(
      {
        date: "2026-02-05",
        label: " SALARY ",
        amount: "1 143,88 €",
        externalId: null,
      },
      "EUR",
    );

    expect(result).toEqual({
      ok: true,
      row: {
        date: "2026-02-05",
        label: "SALARY",
        amount: 114_388,
        externalId: null,
      },
    });
  });

  it("keeps the bank identifier of the row it comes from", () => {
    const result = readImportDraft(
      {
        date: "2026-02-05",
        label: "SHOP",
        amount: "-12.50",
        externalId: "FIT-1",
      },
      "EUR",
    );

    expect(result).toMatchObject({
      ok: true,
      row: { amount: -1_250, externalId: "FIT-1" },
    });
  });

  it.each([
    ["an empty date", { date: "" }, "dateInvalid"],
    ["a date that does not exist", { date: "2026-02-30" }, "dateInvalid"],
    ["a date not written year first", { date: "05/02/2026" }, "dateInvalid"],
    ["a blank label", { label: "   " }, "labelRequired"],
    ["a text that is not an amount", { amount: "twelve" }, "amountInvalid"],
    ["an empty amount", { amount: "" }, "amountInvalid"],
    ["a zero amount", { amount: "0,00" }, "amountZero"],
  ])("refuses %s", (_name, override, problem) => {
    const draft = {
      date: "2026-02-05",
      label: "SHOP",
      amount: "-12,50",
      externalId: null,
    };

    expect(readImportDraft({ ...draft, ...override }, "EUR")).toEqual({
      ok: false,
      problem,
    });
  });
});

describe("draftOfRow", () => {
  it("writes an amount that reads back unchanged", () => {
    const draft = draftOfRow(
      {
        date: "2026-02-05",
        label: "SHOP",
        amount: -1_250,
        externalId: "FIT-1",
      },
      "EUR",
    );

    expect(draft).toEqual({
      date: "2026-02-05",
      label: "SHOP",
      amount: "-12.50",
      externalId: "FIT-1",
    });
    expect(readImportDraft(draft, "EUR")).toMatchObject({
      ok: true,
      row: { amount: -1_250 },
    });
  });
});
