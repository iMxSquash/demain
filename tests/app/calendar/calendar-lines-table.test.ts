import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CalendarLinesTable,
  type CalendarLinesTableProps,
  type CalendarLinesTableText,
} from "../../../src/app/calendar/lines/calendar-lines-table";
import { formatAmount } from "../../../src/domain/money";
import type { CalendarDay, CalendarEntry, CalendarMonth } from "../../../src/ledger/calendar";

const LOCALE = "en";
const CHECKING_ID = 1;
const SAVINGS_ID = 2;

const TEXT: CalendarLinesTableText = {
  caption: "Lines of November 2026",
  columns: {
    date: "Date",
    description: "Description",
    account: "Account",
    kind: "Kind",
    status: "Status",
    amount: "Amount",
    balance: "Balance at end of day",
  },
  kinds: { real: "Real", planned: "Planned, dated" },
  statuses: {
    planned: "To come",
    partial: "Partly settled",
    confirmed: "Settled",
    overdue: "Late",
    cancelled: "Dropped",
  },
  belowZero: "Below zero",
  belowZeroFrom: (date) => `First day under zero: ${date}`,
  unplacedSurplus: (amount, account) => `Unplaced surplus: ${amount} stays in ${account}`,
  routingInvalid: "The overflow chain is invalid",
  transferTo: (from, to) => `${from} to ${to}`,
  empty: "Nothing this month",
  unconverted: (currencies) => `Left out, no rate: ${currencies}`,
};

const ACCOUNTS = [
  { id: CHECKING_ID, name: "Checking" },
  { id: SAVINGS_ID, name: "Savings" },
];

function entry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: "t1",
    date: "2026-11-03",
    kind: "real",
    label: "GROCERIES",
    accountId: CHECKING_ID,
    destinationAccountId: null,
    currency: "EUR",
    amount: -4_000,
    status: null,
    categoryId: null,
    categoryName: null,
    settlesOccurrence: false,
    plannedItemId: null,
    nominalDate: null,
    unplacedSurplus: null,
    routingInvalid: false,
    ...overrides,
  };
}

interface DayContent {
  entries?: CalendarEntry[];
  balance?: number | null;
}

// Every day of November 2026, with the content of a few of them.
function monthOf(contents: Record<number, DayContent> = {}, overrides: Partial<CalendarMonth> = {}): CalendarMonth {
  const days: CalendarDay[] = Array.from({ length: 30 }, (_, index) => {
    const { entries = [], balance = 100_000 } = contents[index + 1] ?? {};
    return {
      date: `2026-11-${String(index + 1).padStart(2, "0")}`,
      entries,
      balance,
      isBelowZero: balance !== null && balance < 0,
    };
  });
  return { month: "2026-11", currency: "EUR", days, firstDayBelowZero: null, unconvertedCurrencies: [], ...overrides };
}

function render(month: CalendarMonth): string {
  const props: CalendarLinesTableProps = { month, accounts: ACCOUNTS, locale: LOCALE, text: TEXT };
  return renderToString(createElement(CalendarLinesTable, props));
}

// The wide layout is a table and the narrow one a list: both are in the page, a container query
// shows one of them.
const tableOf = (html: string) => /<table[\s\S]*?<\/table>/.exec(html)?.[0] ?? "";
const listOf = (html: string) => /<ul[\s\S]*?<\/ul>/.exec(html)?.[0] ?? "";
const countOf = (html: string, text: string) => html.split(text).length - 1;
const money = (minor: number) => formatAmount(minor, "EUR", LOCALE);

describe("monthly line table", () => {
  it("has a visible caption on the table and a heading on the list", () => {
    const html = render(monthOf({ 3: { entries: [entry()] } }));

    expect(tableOf(html)).toMatch(/<caption[^>]*>Lines of November 2026<\/caption>/);
    expect(listOf(html)).toBeTruthy();
    expect(html).toMatch(/<h2[^>]*>Lines of November 2026/);
  });

  it("renders a table for wide containers and a list for narrow ones, with one row per entry", () => {
    const entries = [entry({ id: "t1" }), entry({ id: "t2", label: "COFFEE" })];
    const html = render(monthOf({ 3: { entries } }));

    expect(tableOf(html).match(/<tbody[\s\S]*<\/tbody>/)?.[0].match(/<tr[\s>]/g)).toHaveLength(2);
    expect(listOf(html).match(/<li[\s>]/g)).toHaveLength(2);
    expect(tableOf(html)).toContain("COFFEE");
    expect(listOf(html)).toContain("COFFEE");
  });

  it("writes each status in words", () => {
    const statuses = ["planned", "partial", "confirmed", "overdue", "cancelled"] as const;
    const entries = statuses.map((status, index) =>
      entry({ id: `p${index}`, kind: "planned", status, label: `Item ${index}`, plannedItemId: index }),
    );
    const html = render(monthOf({ 12: { entries } }));

    for (const status of statuses) {
      expect(tableOf(html)).toContain(TEXT.statuses[status]);
      expect(listOf(html)).toContain(TEXT.statuses[status]);
    }
  });

  it("tells real and planned apart by a word", () => {
    const html = render(
      monthOf({
        3: { entries: [entry()] },
        15: { entries: [entry({ id: "p1:2026-11-15", kind: "planned", status: "planned", label: "Rent" })] },
      }),
    );

    expect(tableOf(html)).toContain(">Real<");
    expect(tableOf(html)).toContain(">Planned, dated<");
    expect(listOf(html)).toContain("Real");
    expect(listOf(html)).toContain("Planned, dated");
  });

  it("names the account, and both accounts of a transfer", () => {
    const html = render(
      monthOf({
        20: {
          entries: [
            entry({
              id: "p2:2026-11-20",
              kind: "planned",
              status: "planned",
              label: "Monthly saving",
              destinationAccountId: SAVINGS_ID,
              amount: -30_000,
            }),
          ],
        },
      }),
    );

    expect(tableOf(html)).toContain("Checking to Savings");
    expect(listOf(html)).toContain("Checking to Savings");
  });

  it("shows the amount of a move between accounts without a sign", () => {
    const html = render(
      monthOf({
        20: {
          entries: [
            entry({
              id: "p2:2026-11-20",
              kind: "planned",
              status: "planned",
              label: "Monthly saving",
              destinationAccountId: SAVINGS_ID,
              amount: -30_000,
            }),
          ],
        },
      }),
    );

    expect(tableOf(html)).toContain(formatAmount(30_000, "EUR", "en"));
    expect(tableOf(html)).not.toContain(formatAmount(-30_000, "EUR", "en"));
  });

  describe("balance at the end of the day", () => {
    it("appears on the last row of each day only", () => {
      const html = render(
        monthOf({
          5: {
            balance: 123_456,
            entries: [
              entry({ id: "t1", date: "2026-11-05", label: "FIRST" }),
              entry({ id: "t2", date: "2026-11-05", label: "SECOND" }),
            ],
          },
          9: { balance: 98_765, entries: [entry({ id: "t3", date: "2026-11-09", label: "THIRD" })] },
        }),
      );

      const rows = tableOf(html).match(/<tr[\s\S]*?<\/tr>/g) ?? [];
      const rowOf = (label: string) => rows.find((row) => row.includes(label)) ?? "";

      expect(rowOf("FIRST")).not.toContain(money(123_456));
      expect(rowOf("SECOND")).toContain(money(123_456));
      expect(rowOf("THIRD")).toContain(money(98_765));
      expect(countOf(tableOf(html), money(123_456))).toBe(1);
      expect(countOf(listOf(html), money(123_456))).toBe(1);
    });
  });

  describe("a day below zero", () => {
    const below = monthOf(
      {
        20: {
          balance: -26_544,
          entries: [entry({ id: "p3:2026-11-20", kind: "planned", status: "planned", label: "Insurance", amount: -150_000 })],
        },
      },
      { firstDayBelowZero: "2026-11-20" },
    );

    it("says Below zero in words on the last row of that day", () => {
      const html = render(below);

      expect(countOf(tableOf(html), "Below zero")).toBe(1);
      expect(countOf(listOf(html), "Below zero")).toBe(1);
      expect(tableOf(html)).toContain(money(-26_544));
    });

    it("says the first day below zero above the table", () => {
      const html = render(below);

      expect(html).toMatch(/First day under zero: [^<]*\bNov\b/);
    });

    it("says nothing about zero in a month that stays positive", () => {
      const html = render(monthOf({ 3: { entries: [entry()] } }));

      expect(html).not.toContain("Below zero");
      expect(html).not.toContain("First day under zero");
    });
  });

  it("says the amount and the account of an unplaced surplus", () => {
    const html = render(
      monthOf({
        20: {
          entries: [
            entry({
              id: "p2:2026-11-20",
              kind: "planned",
              status: "planned",
              label: "Monthly saving",
              destinationAccountId: SAVINGS_ID,
              amount: -30_000,
              unplacedSurplus: { amount: 20_000, accountId: CHECKING_ID },
            }),
          ],
        },
      }),
    );
    const sentence = `Unplaced surplus: ${money(20_000)} stays in Checking`;

    expect(tableOf(html)).toContain(sentence);
    expect(listOf(html)).toContain(sentence);
  });

  it("says when the overflow chain of a transfer is invalid", () => {
    const html = render(
      monthOf({
        20: {
          entries: [
            entry({
              id: "p2:2026-11-20",
              kind: "planned",
              status: "planned",
              destinationAccountId: SAVINGS_ID,
              routingInvalid: true,
            }),
          ],
        },
      }),
    );

    expect(tableOf(html)).toContain("The overflow chain is invalid");
  });

  it("names the currencies left out of the balance", () => {
    const html = render(monthOf({ 3: { entries: [entry()] } }, { unconvertedCurrencies: ["GBP", "USD"] }));

    expect(html).toContain("Left out, no rate: GBP, USD");
  });

  it("says that the month is empty, with no row and no entry", () => {
    const html = render(monthOf());

    expect(html).toContain("Nothing this month");
    expect(html).not.toContain("<td");
    expect(html).not.toContain("<li");
  });
});
