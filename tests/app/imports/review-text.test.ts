import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import {
  describeConfirmReasons,
  describeSplit,
  type StagedT,
} from "../../../src/app/imports/review-text";
import type { ConfirmReason, SplitSegment } from "../../../src/domain/import-review";
import type { AccountRef } from "../../../src/domain/overflow";

/** A translator in the given language that fails on a missing key or a badly formed value. */
function stagedIn(locale: "en" | "fr"): StagedT {
  const t = createTranslator({
    locale,
    messages: locale === "en" ? en : fr,
    namespace: "imports.staged",
    onError: (error) => {
      throw error;
    },
  });
  return (key, values) => t(key, values);
}

const REASONS: ConfirmReason[] = [
  { kind: "typeCellConflict", value: "Revenu", against: "sign" },
  { kind: "typeCellConflict", value: "Revenu", against: "debitCredit" },
  { kind: "typeCellUnknown", value: "misc" },
  { kind: "categoryWord", category: "Salaire", origin: "fixed" },
  { kind: "categoryWord", category: "Salaire", origin: "history" },
  { kind: "categoryWord", category: "Salaire", origin: "user" },
  { kind: "categoryOverruled", category: "Salaire", origin: "fixed" },
  { kind: "categoryOverruled", category: "Salaire", origin: "history" },
  { kind: "categoryOverruled", category: "Salaire", origin: "user" },
  { kind: "history", type: "savings" },
  { kind: "historyOverruled", type: "income" },
  { kind: "sign", type: "expense" },
  { kind: "debitCredit", type: "income" },
  { kind: "nothing" },
  { kind: "typeAgainstSign", type: "expense" },
  { kind: "typeAgainstSign", type: "income" },
];

describe.each(["en", "fr"] as const)("describing the rows to confirm in %s", (locale) => {
  it("writes a sentence for every kind of reason", () => {
    const t = stagedIn(locale);

    for (const reason of REASONS) {
      expect(describeConfirmReasons([reason], t), reason.kind).not.toBe("");
    }
  });
});

describe("describeConfirmReasons", () => {
  it("names the category that gave the type and where its word comes from", () => {
    const say = (origin: "fixed" | "history" | "user") =>
      describeConfirmReasons([{ kind: "categoryWord", category: "salaire", origin }], stagedIn("fr"));

    expect(say("fixed")).toBe("deviné : la catégorie est salaire (mot du vocabulaire fixe)");
    expect(say("history")).toBe("deviné : la catégorie est salaire (mot appris de l'historique)");
    expect(say("user")).toBe("deviné : la catégorie est salaire (mot de votre vocabulaire)");
  });

  it("names the columns a type cell contradicts", () => {
    const sign = describeConfirmReasons(
      [{ kind: "typeCellConflict", value: "Revenu", against: "sign" }],
      stagedIn("en"),
    );
    const columns = describeConfirmReasons(
      [{ kind: "typeCellConflict", value: "Revenu", against: "debitCredit" }],
      stagedIn("en"),
    );

    expect(sign).toContain("sign of the amount");
    expect(columns).toContain("debit and credit columns");
  });

  it("puts the reasons one after the other", () => {
    expect(
      describeConfirmReasons(
        [
          { kind: "sign", type: "income" },
          { kind: "typeCellUnknown", value: "misc" },
        ],
        stagedIn("en"),
      ),
    ).toBe(
      "guessed from the sign of the amount: an income; the type column says \"misc\", which is not a known type",
    );
  });
});

describe("describeSplit", () => {
  const names = new Map([
    [2, "Account A"],
    [3, "Account B"],
  ]);
  const say = (locale: "en" | "fr") => ({
    t: stagedIn(locale),
    currency: "EUR",
    locale,
    nameOf: (ref: AccountRef) => (typeof ref === "string" ? ref : (names.get(ref) ?? "?")),
  });

  it("writes each part of a deposit with the account that receives it", () => {
    const segments: SplitSegment[] = [
      { direction: "to", accountId: 2, amount: 10_000 },
      { direction: "to", accountId: 3, amount: 20_000 },
    ];

    expect(describeSplit(segments, say("en"))).toBe(
      "€100.00 to Account A, €200.00 to Account B",
    );
  });

  it("names an account to create by the name the user gave it", () => {
    const segments: SplitSegment[] = [
      { direction: "to", accountId: 2, amount: 10_000 },
      { direction: "to", accountId: "Spare", amount: 5_000 },
    ];

    expect(describeSplit(segments, say("en"))).toBe("€100.00 to Account A, €50.00 to Spare");
  });

  it("writes a withdrawal in French with the account it comes from", () => {
    const text = describeSplit(
      [{ direction: "from", accountId: 2, amount: 5_000 }],
      say("fr"),
    );

    expect(text).toContain("50,00");
    expect(text).toContain("depuis le compte Account A");
  });

  it("writes the part that fits nowhere without an account", () => {
    expect(
      describeSplit([{ direction: "unplaced", accountId: null, amount: 3_000 }], say("en")),
    ).toBe("€30.00 fits nowhere");
  });
});
