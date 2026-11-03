import { describe, expect, it } from "vitest";

import { buildPreviewState } from "../../../src/app/migration/build-preview-state";
import type { SheetRow } from "../../../src/domain/sheet-import";
import type { SheetTabReading } from "../../../src/domain/sheet-tab";
import type { SheetMigrationPreview } from "../../../src/ledger/sheet-migration";
import { sayIn } from "./say";

const row = (overrides: Partial<SheetRow> = {}): SheetRow => ({
  source: "january.csv",
  line: 2,
  date: "2026-01-13",
  label: "Carrefour",
  amount: 1_250,
  type: "expense",
  category: "Food",
  paymentMode: null,
  ...overrides,
});

const reading = (
  overrides: Partial<SheetTabReading> = {},
): SheetTabReading => ({
  source: "january.csv",
  rows: [row()],
  analysis: {
    delimiter: ";",
    mapping: null,
    typeColumn: null,
    paymentModeColumn: null,
    categoryColumn: null,
    descriptionColumn: null,
    roleColumns: [],
    headerIndex: 0,
    ignoredLines: [],
    yearApplied: null,
    issues: [],
  },
  issues: [],
  ...overrides,
});

const preview = (
  overrides: Partial<SheetMigrationPreview> = {},
): SheetMigrationPreview => ({
  splits: [],
  categoriesToCreate: [],
  assertionsToCreate: [],
  rulesToCreate: [],
  verification: { differences: [], issues: [], isMatching: true },
  issues: [],
  notices: [],
  ...overrides,
});

const build = (
  overrides: Partial<Parameters<typeof buildPreviewState>[0]> = {},
  locale: "en" | "fr" = "en",
) =>
  buildPreviewState(
    {
      tabs: [reading()],
      summary: null,
      ignoredSummaryMonths: [],
      rows: [row()],
      preview: preview(),
      ...overrides,
    },
    sayIn(locale),
  );

describe("buildPreviewState", () => {
  it("is ready to migrate when nothing is reported", () => {
    const state = build();

    expect(state).toMatchObject({
      status: "preview",
      message: "Ready to migrate. Check the points below, then confirm.",
      blocking: [],
      review: [],
      canCommit: true,
      needsConfirmation: false,
      isMatching: true,
    });
  });

  it("blocks on a problem of a tab, naming the file and the line", () => {
    const state = build({
      tabs: [reading({ issues: [{ kind: "typeMissing", line: 4 }] })],
    });

    expect(state.blocking).toEqual([
      "january.csv, line 4: Row skipped: its type is empty.",
    ]);
    expect(state.canCommit).toBe(false);
    expect(state.message).toMatch(/cannot start/);
  });

  it("blocks on every issue of the ledger", () => {
    const state = build({
      preview: preview({
        issues: [{ kind: "ledgerNotEmpty", accountId: 1 }],
      }),
    });

    expect(state.blocking).toEqual([
      "Account 1 already has transactions: this migration is one-time.",
    ]);
    expect(state.canCommit).toBe(false);
  });

  it("blocks when no row could be read, which would be a migration of nothing", () => {
    const state = build({ rows: [], tabs: [reading({ rows: [] })] });

    expect(state.blocking).toContain("No row could be read from the monthly tabs.");
    expect(state.canCommit).toBe(false);
  });

  it("asks to read the points to check without blocking on them", () => {
    const state = build({
      tabs: [reading({ issues: [{ kind: "dateYearAssumed", year: 2026 }] })],
      preview: preview({ notices: [{ kind: "summaryNotProvided" }] }),
    });

    expect(state.review).toHaveLength(2);
    expect(state.canCommit).toBe(true);
    expect(state.needsConfirmation).toBe(true);
  });

  it("lists the issues of the Summary file as points to check, under its name", () => {
    const state = build({
      summary: {
        source: "summary.csv",
        reading: {
          months: [],
          issues: [{ kind: "monthUnreadable", line: 9, text: "Total" }],
        },
      },
    });

    expect(state.review).toEqual([
      'summary.csv, line 9: Summary row skipped: "Total" is not a month.',
    ]);
  });

  it("names the Summary months left out of the comparison", () => {
    const state = build({ ignoredSummaryMonths: ["2026-11", "2026-12"] });

    expect(state.review).toEqual([
      "Summary months outside the imported period are ignored: November 2026, December 2026.",
    ]);
  });

  it("shows each difference with both values and their gap, and asks to confirm", () => {
    const state = build({
      preview: preview({
        verification: {
          differences: [
            { month: "2026-01", figure: "net", sheet: 148_700, demain: 148_750 },
          ],
          issues: [],
          isMatching: false,
        },
      }),
    });

    expect(state.differences).toEqual([
      {
        month: "January 2026",
        figure: "Final balance",
        sheet: "€1,487.00",
        demain: "€1,487.50",
        difference: "€0.50",
      },
    ]);
    expect(state.isMatching).toBe(false);
    expect(state.needsConfirmation).toBe(true);
    expect(state.canCommit).toBe(true);
  });

  it("describes what will be recorded", () => {
    const state = build({
      rows: [row(), row({ line: 3, type: "income" }), row({ line: 4, type: "savings" })],
      preview: preview({
        splits: [
          {
            row: row({ line: 4, type: "savings", amount: 57_316, date: "2026-01-31" }),
            placements: [
              { accountId: 2, amount: 12_316 },
              { accountId: 3, amount: 45_000 },
            ],
            unplaced: 0,
          },
        ],
        categoriesToCreate: ["Food", "Pay"],
        rulesToCreate: [{ value: "Carrefour", categoryName: "Food" }],
        assertionsToCreate: [
          { accountId: 1, date: "2026-01-31", amount: 7_500 },
        ],
      }),
    });

    expect(state.plan).toEqual([
      "Transactions: 2",
      "Savings transfers: 2",
      "Categories to create: 2",
      "Categorization rules to create: 1",
      "Balance assertions to create: 1",
    ]);
    expect(state.splits).toEqual([
      {
        location: "january.csv, line 4",
        date: "Jan 31, 2026",
        amount: "€573.16",
        parts: "Account 2: €123.16; Account 3: €450.00",
      },
    ]);
  });

  it("cuts a long list and says how many lines were left out", () => {
    const issues = Array.from({ length: 130 }, (_, index) => ({
      kind: "typeMissing" as const,
      line: index + 2,
    }));

    const state = build({ tabs: [reading({ issues })] });

    expect(state.blocking).toHaveLength(101);
    expect(state.blocking.at(-1)).toBe("And 30 more.");
    expect(state.canCommit).toBe(false);
  });

  it("speaks French when asked to", () => {
    const state = build({}, "fr");

    expect(state.message).toBe("Prêt à migrer. Vérifiez les points ci-dessous, puis confirmez.");
  });
});
