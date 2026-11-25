// The details of a day and the notes above the grid (DESIGN section 18, "Day details"). The details
// only mount in the browser, once a day is opened: the grid hands them to its client wrapper as a
// prop, so they are rendered here from that prop.
import { isValidElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MonthGrid, type MonthGridProps } from "../../../src/app/calendar/month-grid";
import type { CalendarDay, CalendarEntry, CalendarMonth } from "../../../src/ledger/calendar";

const SURPLUS_DATE = "2026-11-12";
const NO_BALANCE_DATE = "2026-11-15";

const surplusEntry: CalendarEntry = {
  id: "p1:2026-11-12",
  date: SURPLUS_DATE,
  kind: "planned",
  label: "SALARY",
  accountId: 1,
  destinationAccountId: null,
  currency: "EUR",
  amount: 250_000,
  status: "planned",
  categoryId: null,
  categoryName: null,
  settlesOccurrence: false,
  plannedItemId: 1,
  nominalDate: null,
  unplacedSurplus: { amount: 10_000, accountId: 2 },
  routingInvalid: false,
  override: null,
  isEditable: false,
  plannedKind: null,
  canSettle: false,
};

function monthWith(unconvertedCurrencies: string[]): CalendarMonth {
  const days = Array.from({ length: 30 }, (_, index): CalendarDay => {
    const date = `2026-11-${String(index + 1).padStart(2, "0")}`;
    return {
      date,
      entries: date === SURPLUS_DATE ? [surplusEntry] : [],
      balance: date === NO_BALANCE_DATE ? null : 100_000,
      isBelowZero: false,
    };
  });
  return { month: "2026-11", currency: "EUR", days, firstDayBelowZero: null, unconvertedCurrencies };
}

function propsOf(month: CalendarMonth): MonthGridProps {
  return {
    month,
    locale: "en",
    today: "2026-11-21",
    linesHref: (date) => `/calendar/lines?month=2026-11#${date}`,
    text: {
      label: "November 2026",
      today: "Today",
      belowZero: "Below zero",
      unplacedSurplus: "Unplaced surplus",
      real: (count) => `${count} real`,
      planned: (count) => `${count} planned`,
      name: { today: "today", balance: "balance", noEntries: "no entries", belowZero: "below zero", unplacedSurplus: "unplaced surplus" },
      legend: "Dot: real, ring: planned",
    },
    details: {
      accounts: [
        { id: 1, name: "Current" },
        { id: 2, name: "Savings" },
      ],
      text: { balance: "End-of-day balance", noEntries: "No entries on this day." },
      lines: {
        columns: { date: "Date", description: "Description", account: "Account", kind: "Kind", status: "Status", amount: "Amount", balance: "Balance" },
        kinds: { real: "Real", planned: "Planned" },
        statuses: { planned: "Planned", partial: "Partial", confirmed: "Confirmed", overdue: "Overdue", cancelled: "Cancelled" },
        belowZero: "Below zero",
        belowZeroFrom: (date) => `Below zero from ${date}`,
        unplacedSurplus: (amount, account) => `Unplaced surplus: ${amount} stays in ${account}.`,
        routingInvalid: "Invalid chain",
        transferTo: (from, to) => `${from} to ${to}`,
        empty: "Nothing",
        unconverted: (currencies) => `No exchange rate for ${currencies}`,
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
      },
    },
  };
}

function gridElementOf(month: CalendarMonth) {
  const grid = MonthGrid(propsOf(month));
  if (!isValidElement<{ details: Record<string, ReactNode> }>(grid)) throw new Error("the grid is not an element");
  return grid;
}

const gridMarkup = (month: CalendarMonth) => renderToString(gridElementOf(month));
const detailsMarkup = (month: CalendarMonth, date: string) =>
  renderToString(gridElementOf(month).props.details[date]);

describe("day details unplaced surplus", () => {
  it("states the unplaced surplus with its amount and its account in the balance block", () => {
    const html = detailsMarkup(monthWith([]), SURPLUS_DATE);
    // The entries table also says it: the balance block is what comes before it.
    const balanceBlock = html.slice(0, html.indexOf("<table") === -1 ? html.length : html.indexOf("<table"));

    expect(balanceBlock).toMatch(/Unplaced surplus: [^<]*100[^<]* stays in Savings\./);
  });
});

describe("day details without a balance", () => {
  it("omits the end-of-day balance label when no account could be converted", () => {
    const html = detailsMarkup(monthWith(["USD"]), NO_BALANCE_DATE);

    expect(html).not.toContain("End-of-day balance");
  });

  it("keeps the end-of-day balance label on a day that has one", () => {
    expect(detailsMarkup(monthWith([]), "2026-11-16")).toContain("End-of-day balance");
  });
});

describe("month grid unconverted currencies", () => {
  it("shows the note once above the grid when a currency has no rate", () => {
    const html = gridMarkup(monthWith(["USD", "GBP"]));

    expect(html.match(/No exchange rate for USD, GBP/g)).toHaveLength(1);
    expect(html.indexOf("No exchange rate")).toBeLessThan(html.indexOf('role="grid"'));
  });

  it("shows no note when every currency has a rate", () => {
    expect(gridMarkup(monthWith([]))).not.toContain("No exchange rate");
  });

  it("does not repeat the note in the details of a day", () => {
    expect(detailsMarkup(monthWith(["USD"]), SURPLUS_DATE)).not.toContain("No exchange rate");
  });
});
