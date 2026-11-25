import { NextIntlClientProvider } from "next-intl";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { addTransactionDefaults } from "../../src/app/transactions/add-transaction-defaults";
import { AddTransactionForm } from "../../src/app/transactions/add-transaction-form";
import messages from "../../messages/en.json";

const TODAY = "2026-03-15";
const YESTERDAY = "2026-03-14";
const ACCOUNTS = [
  { id: 1, name: "Checking", currency: "EUR", kind: "checking" },
  { id: 2, name: "Savings", currency: "EUR", kind: "savings" },
];
const CATEGORIES = [
  { id: 10, name: "Groceries", icon: "basket" },
  { id: 11, name: "Transport", icon: "bus" },
];

function render(kind?: string): string {
  const initialValues = {
    ...addTransactionDefaults({
      today: TODAY,
      accountIds: [1, 2],
      lastAccountId: null,
      defaultPaymentMode: "card",
    }),
    ...(kind === undefined ? {} : { kind }),
  };
  const form = createElement(AddTransactionForm, {
    action: async () => null,
    transferAction: async () => null,
    categoryAction: async () => null,
    initialValues,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    labelSuggestions: [{ label: "Market", categoryByAccount: { 1: 10 } }],
    today: TODAY,
    yesterday: YESTERDAY,
  } as ComponentProps<typeof AddTransactionForm>);

  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages } as ComponentProps<typeof NextIntlClientProvider>,
      form,
    ),
  );
}

/** The `name` of each form control, in document order, one entry per control name. */
function controlNames(markup: string): string[] {
  const names = [...markup.matchAll(/<(?:input|button)\b[^>]*>/g)].map(
    (match) => match[0].match(/ name="([^"]*)"/)?.[1] ?? (match[0].includes('type="submit"') ? "submit" : ""),
  );
  return names.filter((name, index) => name !== "" && names.indexOf(name) === index);
}

describe("AddTransactionForm focus order", () => {
  it("follows the tab order amount, label, category, date, account, then the save button", () => {
    const markup = render();

    const names = controlNames(markup);

    expect(names).toEqual([
      "kind",
      "amount",
      "label",
      "categoryId",
      "date",
      "accountId",
      "description",
      "paymentMode",
      "submit",
    ]);
  });

  it("swaps the category and the details for From and To when the type is a transfer", () => {
    const markup = render("transfer");

    const names = controlNames(markup);

    expect(names).toEqual([
      "kind",
      "amount",
      "label",
      "date",
      "sourceId",
      "destinationId",
      "submit",
    ]);
  });
});
