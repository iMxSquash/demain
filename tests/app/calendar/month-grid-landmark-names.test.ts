// Regression: with the details of a day open, no two landmarks of the grid markup share an accessible
// name (axe `landmark-unique`). The details region and the region of the entries table used to both
// carry the date.
import { isValidElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MonthGrid, type MonthGridProps } from "../../../src/app/calendar/month-grid";
import type { CalendarDay, CalendarEntry, CalendarMonth } from "../../../src/ledger/calendar";

const entry: CalendarEntry = {
  id: "t1",
  date: "2026-11-28",
  kind: "real",
  label: "GROCERIES",
  accountId: 1,
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
};

const month: CalendarMonth = {
  month: "2026-11",
  currency: "EUR",
  days: Array.from({ length: 30 }, (_, index): CalendarDay => {
    const day = index + 1;
    return {
      date: `2026-11-${String(day).padStart(2, "0")}`,
      entries: day === 28 ? [entry] : [],
      balance: 100_000,
      isBelowZero: false,
    };
  }),
  firstDayBelowZero: null,
  unconvertedCurrencies: [],
};

const props: MonthGridProps = {
  month,
  locale: "fr",
  today: "2026-11-21",
  linesHref: (date) => `/calendar/lines?month=2026-11#${date}`,
  text: {
    label: "novembre 2026",
    today: "Aujourd'hui",
    belowZero: "Sous zéro",
    unplacedSurplus: "Excédent non placé",
    real: (count) => `${count} réelle`,
    planned: (count) => `${count} prévue`,
    name: { today: "aujourd'hui", balance: "solde", noEntries: "aucune écriture", belowZero: "sous zéro", unplacedSurplus: "excédent" },
    legend: "Point : réelle, anneau : prévue",
  },
  details: {
    accounts: [{ id: 1, name: "Courant" }],
    text: { balance: "Solde de fin de journée", noEntries: "Aucune écriture ce jour." },
    lines: {
      columns: { date: "Date", description: "Libellé", account: "Compte", kind: "Type", status: "Statut", amount: "Montant", balance: "Solde" },
      kinds: { real: "Réelle", planned: "Prévue" },
      statuses: { planned: "À venir", partial: "Partielle", confirmed: "Confirmée", overdue: "En retard", cancelled: "Annulée" },
      belowZero: "Sous zéro",
      belowZeroFrom: (date) => `Sous zéro dès ${date}`,
      unplacedSurplus: (amount, account) => `${amount} reste sur ${account}`,
      routingInvalid: "Chaîne invalide",
      transferTo: (from, to) => `${from} vers ${to}`,
      empty: "Rien",
      unconverted: (currencies) => `Exclu : ${currencies}`,
      change: "Modifier",
      changeTitle: (name, date) => `Modifier ${name}, ${date}`,
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

const attributeOf = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

// Walks the characters instead of a tag-stripping regex, which CodeQL flags as incomplete sanitization.
function textOfMarkup(markup: string): string {
  let text = "";
  let isInTag = false;
  for (const character of markup) {
    if (character === "<") isInTag = true;
    else if (character === ">") isInTag = false;
    else if (!isInTag) text += character;
  }
  return text;
}

const textOfId = (html: string, id: string) => {
  const heading = new RegExp(`id="${id}"[^>]*>(.*?)</h\\d>`, "s").exec(html)?.[1];
  return heading === undefined ? undefined : textOfMarkup(heading).trim();
};

// Landmarks here: a `<section>` or an element with `role="region"`, named by `aria-label` or `aria-labelledby`.
function landmarkNamesOf(html: string): string[] {
  return [...html.matchAll(/<(?:section|[a-z0-9]+)\s[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => tag.startsWith("<section") || attributeOf(tag, "role") === "region")
    .map((tag) => {
      const labelledBy = attributeOf(tag, "aria-labelledby");
      return labelledBy === undefined ? attributeOf(tag, "aria-label") : textOfId(html, labelledBy);
    })
    .filter((name): name is string => name !== undefined && name !== "");
}

// The details of a day only mount in the browser, once a day is opened: the grid hands them to its client
// wrapper as a prop, so the markup of an open day is the grid plus that prop.
function markupWithOpenDay(date: string): string {
  const grid = MonthGrid(props);
  if (!isValidElement<{ details: Record<string, ReactNode> }>(grid)) throw new Error("the grid is not an element");
  return renderToString(grid) + renderToString(grid.props.details[date]);
}

describe("month grid landmark names", () => {
  it("gives every region of the open day details a distinct accessible name", () => {
    const html = markupWithOpenDay("2026-11-28");
    const names = landmarkNamesOf(html);

    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(new Set(names).size).toBe(names.length);
  });
});
