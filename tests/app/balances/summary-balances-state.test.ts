import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import {
  buildSummaryBalancesState,
  type SummaryBalancesContext,
  type SummaryBalancesReading,
} from "../../../src/app/balances/summary/summary-balances-state";
import { sayIn } from "../migration/say";

function contextIn(
  locale: "en" | "fr",
  phase: SummaryBalancesContext["phase"] = "preview",
): SummaryBalancesContext {
  const t = createTranslator({
    locale,
    messages: locale === "en" ? en : fr,
    namespace: "summaryBalances",
    onError: (error) => {
      throw error;
    },
  });
  return { t: (key, values) => t(key, values), say: sayIn(locale), phase };
}

const NO_COMPARISON = {
  differences: [],
  issues: [],
  isMatching: false,
  futureMonths: [],
};

function reading(overrides: Partial<SummaryBalancesReading> = {}): SummaryBalancesReading {
  return {
    source: "summary.csv",
    issues: [],
    balances: [
      { month: "2026-02", amount: 100_000 },
      { month: "2026-01", amount: 90_000 },
      { month: "2026-03", amount: null },
      { month: "2025-12", amount: 5_000 },
      { month: "2026-12", amount: 1_000 },
    ],
    preview: {
      assertions: [
        { accountId: 1, date: "2026-01-31", amount: 90_000, replacedAmount: null },
        { accountId: 1, date: "2026-02-28", amount: 100_000, replacedAmount: 99_000 },
      ],
      withoutBalance: ["2026-03"],
      refused: [
        { month: "2025-12", reason: "beforeOpening" },
        { month: "2026-12", reason: "afterToday" },
      ],
    },
    comparison: NO_COMPARISON,
    ...overrides,
  };
}

describe("buildSummaryBalancesState", () => {
  it("tells in text what each month becomes, in month order", () => {
    const state = buildSummaryBalancesState(reading(), contextIn("en"));

    expect(state.rows.map((row) => [row.month, row.status])).toEqual([
      ["December 2025", "Refused: the month ended before the account opened"],
      ["January 2026", "Will be created"],
      ["February 2026", "Will replace the balance €990.00"],
      ["March 2026", "Nothing to record: the Summary has no balance for this month"],
      ["December 2026", "Refused: the month is not over yet"],
    ]);
    expect(state.rows[1]).toMatchObject({ date: "Jan 31, 2026", balance: "€900.00" });
    expect(state.rows[3]?.balance).toBe("None");
  });

  it("counts what is created, replaced and refused in the headline", () => {
    const state = buildSummaryBalancesState(reading(), contextIn("en"));

    expect(state.status).toBe("preview");
    expect(state.canCommit).toBe(true);
    expect(state.message).toBe("Ready to record: 1 to create, 1 to replace, 2 refused.");
  });

  it("speaks in the past tense once the balances are recorded", () => {
    const state = buildSummaryBalancesState(reading(), contextIn("en", "done"));

    expect(state.status).toBe("done");
    expect(state.canCommit).toBe(false);
    expect(state.message).toBe("Balances recorded: 2.");
    expect(state.rows[1]?.status).toBe("Created");
    expect(state.rows[2]?.status).toBe("Replaced the balance €990.00");
  });

  it("cannot be recorded when nothing is accepted", () => {
    const state = buildSummaryBalancesState(
      reading({
        preview: { assertions: [], withoutBalance: [], refused: [] },
        balances: [],
      }),
      contextIn("en"),
    );

    expect(state.canCommit).toBe(false);
    expect(state.message).toBe("Nothing can be recorded from this file.");
  });

  it("shows each difference with the signed gap, Demain minus the Summary", () => {
    const state = buildSummaryBalancesState(
      reading({
        comparison: {
          ...NO_COMPARISON,
          differences: [
            { month: "2026-01", figure: "net", sheet: 10_000, demain: 9_900 },
            { month: "2026-02", figure: "savings", sheet: 4_000, demain: 5_000 },
          ],
        },
      }),
      contextIn("en"),
    );

    expect(state.hasComparison).toBe(true);
    expect(state.isMatching).toBe(false);
    expect(state.differences).toEqual([
      {
        month: "January 2026",
        figure: "Final balance",
        sheet: "€100.00",
        demain: "€99.00",
        difference: "-€1.00",
      },
      {
        month: "February 2026",
        figure: "Savings",
        sheet: "€40.00",
        demain: "€50.00",
        difference: "+€10.00",
      },
    ]);
  });

  it("has nothing to compare when no month could be compared", () => {
    const state = buildSummaryBalancesState(reading(), contextIn("en"));

    expect(state.hasComparison).toBe(false);
  });

  it("lists the file issues, the months left out and the comparison issues as notes", () => {
    const state = buildSummaryBalancesState(
      reading({
        issues: [
          { kind: "monthUnreadable", line: 9, text: "Total" },
          { kind: "monthDuplicated", month: "2026-01" },
        ],
        comparison: {
          ...NO_COMPARISON,
          issues: [{ kind: "monthMissingInDemain", month: "2026-04" }],
          futureMonths: ["2026-11", "2026-12"],
        },
      }),
      contextIn("en"),
    );

    expect(state.hasComparison).toBe(true);
    expect(state.notes).toEqual([
      'summary.csv, line 9: Summary row skipped: "Total" is not a month.',
      "January 2026 appears several times in the Summary: the first row is used.",
      "April 2026 is in the Summary but has no row in the monthly tabs.",
      "Summary months that are not over are not compared: November 2026, December 2026.",
    ]);
  });

  it("writes the same screen in French", () => {
    const state = buildSummaryBalancesState(reading(), contextIn("fr"));

    expect(state.rows[1]?.status).toBe("Sera créé");
    expect(state.message).toBe("Prêt à enregistrer : 1 à créer, 1 à remplacer, 2 refusés.");
  });
});
