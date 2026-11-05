import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import {
  describeAssertionLinks,
  type AssertionLinkSay,
  type AssertionLinkT,
} from "../../../src/app/imports/assertion-link-text";
import type { AssertionLinks } from "../../../src/domain/import-assertions";

function sayIn(locale: "en" | "fr"): AssertionLinkSay {
  const t = createTranslator({
    locale,
    messages: locale === "en" ? en : fr,
    namespace: "imports.staged.assertionLinks",
    onError: (error) => {
      throw error;
    },
  });
  const translate: AssertionLinkT = (key, values) => t(key, values);
  return {
    t: translate,
    currency: "EUR",
    locale,
    nameOf: (id) => (id === 1 ? "Checking" : "Savings"),
  };
}

const NO_LINKS: AssertionLinks = { accounts: [], checked: 0, matching: 0 };

const LINKS: AssertionLinks = {
  accounts: [
    {
      accountId: 1,
      links: [
        { assertionId: 1, date: "2026-03-15", realBalance: 100_000, computedBalance: 100_000, gap: 0, direction: "equal" },
        { assertionId: 2, date: "2026-03-31", realBalance: 95_000, computedBalance: 95_150, gap: 150, direction: "realBelow" },
      ],
    },
    {
      accountId: 2,
      links: [
        { assertionId: 3, date: "2026-03-31", realBalance: 20_001, computedBalance: 20_000, gap: -1, direction: "realAbove" },
      ],
    },
  ],
  checked: 3,
  matching: 1,
};

describe("describeAssertionLinks", () => {
  it("has no summary and no row when no assertion falls in the period", () => {
    expect(describeAssertionLinks(NO_LINKS, sayIn("en"))).toEqual({
      summary: null,
      rows: [],
    });
  });

  it("counts the matching assertions out of the checked ones", () => {
    expect(describeAssertionLinks(LINKS, sayIn("en")).summary).toBe("1 of 3 assertions match");
  });

  it.each([
    [2, 3, "2 of 3 assertions match"],
    [1, 1, "1 of 1 assertion matches"],
    [0, 2, "0 of 2 assertions match"],
  ])("writes %i of %i in the singular or the plural", (matching, checked, expected) => {
    expect(describeAssertionLinks({ ...LINKS, matching, checked }, sayIn("en")).summary).toBe(
      expected,
    );
  });

  it.each([
    [0, 1, "0 sur 1 solde constaté concorde"],
    [1, 1, "1 sur 1 solde constaté concorde"],
    [2, 3, "2 sur 3 soldes constatés concordent"],
  ])("writes %i of %i in French", (matching, checked, expected) => {
    expect(describeAssertionLinks({ ...LINKS, matching, checked }, sayIn("fr")).summary).toBe(
      expected,
    );
  });

  it("gives one row per assertion, by account then by date", () => {
    const { rows } = describeAssertionLinks(LINKS, sayIn("en"));

    expect(rows.map(({ key, accountName }) => [key, accountName])).toEqual([
      [1, "Checking"],
      [2, "Checking"],
      [3, "Savings"],
    ]);
  });

  it("writes the amounts and the date in the language", () => {
    const [, row] = describeAssertionLinks(LINKS, sayIn("en")).rows;

    expect(row).toMatchObject({
      date: "Mar 31, 2026",
      realBalance: "€950.00",
      computedBalance: "€951.50",
    });
  });

  it("writes no gap in words when the balances match", () => {
    const [row] = describeAssertionLinks(LINKS, sayIn("en")).rows;

    expect(row?.gap).toBe("No gap");
  });

  it("writes the signed gap and who holds more, never by sign alone", () => {
    const rows = describeAssertionLinks(LINKS, sayIn("en")).rows;

    expect(rows[1]?.gap).toBe("+€1.50: Demain holds more than the bank");
    expect(rows[2]?.gap).toBe("-€0.01: the bank shows more than Demain");
  });

  it("writes the gap in French", () => {
    const rows = describeAssertionLinks(LINKS, sayIn("fr")).rows;

    expect(rows[0]?.gap).toBe("Aucun écart");
    expect(rows[1]?.gap).toMatch(/^\+1,50.€ : Demain compte plus que la banque$/);
  });
});
