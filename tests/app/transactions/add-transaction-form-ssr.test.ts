import { NextIntlClientProvider } from "next-intl";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { addTransactionDefaults } from "../../../src/app/transactions/add-transaction-defaults";
import { AddTransactionForm } from "../../../src/app/transactions/add-transaction-form";
import messages from "../../../messages/en.json";

function render(element: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages } as ComponentProps<typeof NextIntlClientProvider>,
      element,
    ),
  );
}

describe("AddTransactionForm before hydration", () => {
  const initialValues = addTransactionDefaults({
    today: "2026-03-15",
    accountIds: [1, 2],
    lastAccountId: null,
    defaultPaymentMode: "direct_debit",
  });
  const markup = render(
    createElement(AddTransactionForm, {
      action: async () => null,
      transferAction: async () => null,
      categoryAction: async () => null,
      initialValues,
      accounts: [
        { id: 1, name: "Checking", currency: "EUR", kind: "checking" },
        { id: 2, name: "Savings", currency: "EUR", kind: "savings" },
      ],
      categories: [{ id: 10, name: "Groceries", icon: "basket" }],
      labelSuggestions: [],
      today: "2026-03-15",
      yesterday: "2026-03-14",
    } as ComponentProps<typeof AddTransactionForm>),
  );

  it("has no step chrome that needs a script", () => {
    expect(markup).not.toContain("Amount keypad");
    expect(markup).not.toContain("Step 1 of 3");
    expect(markup).not.toContain(">Next<");
    expect(markup).not.toContain(">Back<");
  });

  it("shows every panel: none is hidden", () => {
    // The `hidden` utility itself, not a variant such as `[&::-webkit-details-marker]:hidden`.
    expect(markup).not.toMatch(/class="(?:[^"]* )?hidden(?: [^"]*)?"/);
    expect(markup).toContain("How much?");
    expect(markup).toContain("What for?");
    expect(markup).toContain("Date and account");
    expect(markup).not.toContain("Check and save");
  });

  it("preselects the payment mode of the setting", () => {
    const checkedModes = [...markup.matchAll(/<input[^>]*name="paymentMode"[^>]*>/g)]
      .filter(([input]) => input.includes('checked=""'))
      .map(([input]) => /value="([^"]*)"/.exec(input)?.[1]);

    expect(checkedModes).toEqual(["direct_debit"]);
  });

  it("writes no style attribute, which the CSP refuses", () => {
    expect(markup).not.toContain(" style=");
  });
});
