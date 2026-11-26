import { NextIntlClientProvider } from "next-intl";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FormField } from "../../src/app/form-field";
import messages from "../../messages/en.json";

interface FieldOptions {
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  optional?: boolean;
  controlProps?: Record<string, unknown>;
}

function render({ controlProps, ...field }: FieldOptions): string {
  const control = createElement("input", { id: "amount", name: "amount", ...controlProps });
  // The casts only satisfy `createElement`, which wants `children` among the props even when
  // it is passed as the third argument, as the lint rule requires.
  const formField = createElement(
    FormField,
    { id: "amount", label: "Amount", ...field } as ComponentProps<typeof FormField>,
    control,
  );

  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages } as ComponentProps<typeof NextIntlClientProvider>,
      formField,
    ),
  );
}

function attribute(markup: string, name: string): string | null {
  return markup.match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? null;
}

describe("FormField", () => {
  it("links the hint and the error to the control with aria-describedby", () => {
    const markup = render({ hint: "Without a sign.", error: "Invalid amount." });

    expect(attribute(markup, "aria-describedby")).toBe("amount-hint amount-error");
    expect(markup).toContain('id="amount-hint"');
    expect(markup).toContain('id="amount-error"');
  });

  it("links the hint alone when there is no error", () => {
    const markup = render({ hint: "Without a sign." });

    expect(attribute(markup, "aria-describedby")).toBe("amount-hint");
    expect(markup).not.toContain("amount-error");
    expect(markup).not.toContain("aria-invalid");
  });

  it("keeps the label for assistive technology only when asked to hide it", () => {
    const markup = render({ hideLabel: true });

    expect(markup).toMatch(/<label[^>]*class="sr-only"[^>]*>Amount/);
    expect(render({})).not.toContain("sr-only");
  });

  it("sets no aria-describedby when there is neither hint nor error", () => {
    const markup = render({});

    expect(markup).not.toContain("aria-describedby");
  });

  it("starts the error with the word Error, announces it and marks the control invalid", () => {
    const markup = render({ error: "Invalid amount." });

    expect(markup).toMatch(
      /<p id="amount-error" role="alert"[^>]*>.*<span>Error: Invalid amount\.<\/span><\/p>/,
    );
    expect(attribute(markup, "aria-invalid")).toBe("true");
  });

  it("hides the alert icon from assistive technology", () => {
    const markup = render({ error: "Invalid amount." });

    expect(markup).toContain('aria-hidden="true"');
  });

  it("keeps an aria-describedby the control already has, without repeating an id", () => {
    const markup = render({
      hint: "Without a sign.",
      controlProps: { "aria-describedby": "other amount-hint" },
    });

    expect(attribute(markup, "aria-describedby")).toBe("other amount-hint");
  });

  it("puts the hint between the label and the control", () => {
    const markup = render({ hint: "Without a sign." });

    expect(markup.indexOf("<label")).toBeLessThan(markup.indexOf('id="amount-hint"'));
    expect(markup.indexOf('id="amount-hint"')).toBeLessThan(markup.indexOf("<input"));
  });

  it("marks an optional field in the label, in muted text", () => {
    const markup = render({ optional: true });

    expect(markup).toContain('<span class="font-regular text-text-muted"> (optional)</span>');
  });
});
