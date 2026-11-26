import { NextIntlClientProvider } from "next-intl";
import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AddTransactionKeypad } from "../../../src/app/transactions/add-transaction-keypad";
import { StepProgress } from "../../../src/app/transactions/add-transaction-progress";
import { RecapRow } from "../../../src/app/transactions/add-transaction-recap-row";
import { AmountDisplayInput } from "../../../src/app/transactions/amount-display-input";
import { StepNav } from "../../../src/app/transactions/add-transaction-step-nav";
import messages from "../../../messages/en.json";

function render(element: ReactElement): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages } as ComponentProps<typeof NextIntlClientProvider>,
      element,
    ),
  );
}

const noop = () => {};

describe("AddTransactionKeypad", () => {
  const markup = render(
    createElement(AddTransactionKeypad, { onKey: noop, separator: ",", hasDecimals: true }),
  );

  it("has the ten digits, the separator and the backspace, in 3 columns", () => {
    const keys = [...markup.matchAll(/<button\b[^>]*>(.*?)<\/button>/g)];

    expect(keys).toHaveLength(12);
    for (const digit of "0123456789") expect(markup).toContain(`>${digit}</button>`);
    expect(markup).toContain("grid-cols-3");
  });

  it("names the keys that have no word", () => {
    expect(markup).toContain('aria-label="Backspace"');
    expect(markup).toContain('aria-label="Decimal separator"');
    expect(markup).toContain('role="group" aria-label="Amount keypad"');
  });

  it("draws the separator it is given", () => {
    expect(markup).toContain(">,</button>");
  });

  it("disables the separator for a currency without decimals", () => {
    const withoutDecimals = render(
      createElement(AddTransactionKeypad, { onKey: noop, separator: ".", hasDecimals: false }),
    );

    expect(withoutDecimals).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Decimal separator"|<button[^>]*aria-label="Decimal separator"[^>]*disabled=""/,
    );
  });

  it("keeps every key a 44 px target at least", () => {
    expect(markup.match(/min-h-13/g)).toHaveLength(12);
  });
});

describe("StepProgress", () => {
  it("hides the three segments from assistive technology", () => {
    const markup = render(createElement(StepProgress, { step: 2 }));

    expect(markup).toMatch(
      /<div aria-hidden="true"[^>]*>(<span[^>]*><span[^>]*><\/span><\/span>){3}<\/div>/,
    );
  });

  it("announces the step politely", () => {
    const markup = render(createElement(StepProgress, { step: 2 }));

    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Step 2 of 3");
  });
});

describe("StepNav", () => {
  it("has only Next on the first step", () => {
    const markup = render(createElement(StepNav, { step: 1, onBack: noop, onNext: noop }));

    expect(markup).not.toContain("Back");
    expect(markup).toContain("Next");
  });

  it("has Back and Next on the second step", () => {
    const markup = render(createElement(StepNav, { step: 2, onBack: noop, onNext: noop }));

    expect(markup).toContain("Back");
    expect(markup).toContain("Next");
  });

  it("has only Back on the last step", () => {
    const markup = render(createElement(StepNav, { step: 3, onBack: noop }));

    expect(markup).toContain("Back");
    expect(markup).not.toContain("Next");
  });
});

describe("RecapRow", () => {
  const markup = render(
    createElement(
      RecapRow,
      { summary: "42.00", editLabel: "Edit amount and type" } as ComponentProps<typeof RecapRow>,
      createElement("input", { id: "editor-field" }),
    ),
  );

  it("has an Edit button that says it is collapsed and what it controls", () => {
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toMatch(/aria-controls="[^"]+"/);
    expect(markup).toContain('aria-label="Edit amount and type"');
    expect(markup).toContain(">Edit</button>");
  });

  it("keeps the editor out of the page until it is opened", () => {
    expect(markup).not.toContain("editor-field");
    expect(markup).not.toContain("Done");
  });
});

describe("AmountDisplayInput", () => {
  const markup = render(
    createElement(AmountDisplayInput, { id: "amount", direction: "out", currency: "EUR" }),
  );

  it("keeps the input a 44 px wide target on the phone layout", () => {
    expect(markup).toContain("@max-[759px]:min-w-11");
  });
});
