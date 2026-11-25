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
  change: "Change",
  changeTitle: (name, date) => `Change ${name}, ${date}`,
  actions: {
    expense: "Mark as paid",
    income: "Mark as received",
    transfer: "Mark as transferred",
    expensePending: "Marking as paid…",
    incomePending: "Marking as received…",
    transferPending: "Marking as transferred…",
    link: "Link a transaction",
  },
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
    override: null,
    isEditable: false,
    plannedKind: null,
    canSettle: false,
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
  const props: CalendarLinesTableProps = { month, accounts: ACCOUNTS, locale: LOCALE, text: TEXT, backView: "lines" };
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

  it("offers to change a planned occurrence, named by its item and its nominal date", () => {
    const rent = entry({
      id: "p4:2026-11-15",
      date: "2026-11-18",
      kind: "planned",
      status: "planned",
      label: "Rent",
      plannedItemId: 4,
      nominalDate: "2026-11-15",
      isEditable: true,
    });
    const html = render(monthOf({ 18: { entries: [rent] } }));

    for (const layout of [tableOf(html), listOf(html)]) {
      expect(layout).toMatch(/<button[^>]*>Change<span class="sr-only"> Rent, Nov 15, 2026<\/span><\/button>/);
    }
  });

  it("offers to restore a skipped occurrence, but no change of one that is not editable or of a real transaction", () => {
    const planned = { kind: "planned" as const, plannedItemId: 4, nominalDate: "2026-11-15", isEditable: true };
    const html = render(
      monthOf({
        3: { entries: [entry()] },
        15: {
          entries: [
            entry({
              ...planned,
              id: "p4:2026-11-15",
              status: "cancelled",
              label: "Rent",
              override: { nominalDate: "2026-11-15", status: "cancelled", overrideDate: null, overrideAmount: null },
            }),
            entry({ ...planned, id: "p5:2026-11-15", status: "partial", label: "Groceries", plannedItemId: 5, isEditable: false }),
            entry({ ...planned, id: "p6:2026-11-15", status: "overdue", label: "Subscription", plannedItemId: 6, isEditable: false }),
          ],
        },
      }),
    );

    expect(countOf(html, "> Rent, Nov 15, 2026<")).toBe(2);
    expect(html).not.toContain("> Groceries,");
    expect(html).not.toContain("> Subscription,");
    expect(countOf(html, ">Change<")).toBe(2);
  });

  describe("settling an occurrence", () => {
    const open = {
      kind: "planned" as const,
      status: "planned" as const,
      plannedItemId: 4,
      nominalDate: "2026-11-15",
      date: "2026-11-15",
      label: "Rent",
      amount: -65_000,
      plannedKind: "expense" as const,
      canSettle: true,
    };

    it("offers the button of its type and Link a transaction, named by the occurrence, in both layouts", () => {
      const html = render(monthOf({ 15: { entries: [entry({ ...open, id: "p4:2026-11-15" })] } }));

      for (const layout of [tableOf(html), listOf(html)]) {
        expect(layout).toMatch(/<button[^>]*aria-label="Mark as paid, Rent, Nov 15, 2026"[^>]*>Mark as paid<\/button>/);
        expect(layout).toMatch(
          /<a[^>]*href="\/planned\/link\?item=4&amp;date=2026-11-15&amp;back=lines"[^>]*aria-label="Link a transaction, Rent, Nov 15, 2026"[^>]*>Link a transaction<\/a>|<a[^>]*aria-label="Link a transaction, Rent, Nov 15, 2026"[^>]*href="\/planned\/link\?item=4&amp;date=2026-11-15&amp;back=lines"[^>]*>Link a transaction<\/a>/,
        );
      }
    });

    it("records the planned date and the unsigned amount, with no form to fill", () => {
      const html = render(monthOf({ 15: { entries: [entry({ ...open, id: "p4:2026-11-15", date: "2026-11-16" })] } }));

      expect(tableOf(html)).toContain('<input type="hidden" name="date" value="2026-11-16"/>');
      expect(tableOf(html)).toContain('<input type="hidden" name="amount" value="650.00"/>');
    });

    it("puts the actions of a table row in a row of their own, under it, across the seven columns", () => {
      const html = render(monthOf({ 15: { entries: [entry({ ...open, id: "p4:2026-11-15" })] } }));

      const rows = tableOf(html).match(/<tbody[\s\S]*<\/tbody>/)?.[0].split("<tr").slice(1) ?? [];
      expect(rows).toHaveLength(2);
      expect(rows[0]).not.toContain("<button");
      expect(rows[1]).toMatch(/<td colSpan="7"/);
      expect(tableOf(html).match(/<th scope="col"/g)).toHaveLength(7);
    });

    it("names the button of an income and of a transfer by their type, and a transfer has no Link", () => {
      const html = render(
        monthOf({
          15: {
            entries: [
              entry({ ...open, id: "p4:2026-11-15", label: "Salary", amount: 245_000, plannedKind: "income" }),
              entry({
                ...open,
                id: "p5:2026-11-15",
                plannedItemId: 5,
                label: "Savings transfer",
                plannedKind: "transfer",
                destinationAccountId: SAVINGS_ID,
              }),
            ],
          },
        }),
      );

      expect(countOf(tableOf(html), ">Mark as received<")).toBe(1);
      expect(countOf(tableOf(html), ">Mark as transferred<")).toBe(1);
      expect(countOf(tableOf(html), ">Link a transaction<")).toBe(1);
    });

    it("offers nothing to settle on a real transaction, a cancelled occurrence or one that cannot be settled", () => {
      const html = render(
        monthOf({
          15: {
            entries: [
              entry(),
              entry({ ...open, id: "p4:2026-11-15", status: "cancelled", canSettle: false }),
              entry({ ...open, id: "p6:2026-11-15", plannedItemId: 6, status: "overdue", canSettle: false }),
            ],
          },
        }),
      );

      expect(html).not.toContain("Mark as");
      expect(html).not.toContain("Link a transaction");
    });
  });

  it("says that the month is empty, with no row and no entry", () => {
    const html = render(monthOf());

    expect(html).toContain("Nothing this month");
    expect(html).not.toContain("<td");
    expect(html).not.toContain("<li");
  });
});
