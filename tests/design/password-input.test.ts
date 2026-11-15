import { NextIntlClientProvider } from "next-intl";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FormField } from "../../src/app/form-field";
import { PasswordInput } from "../../src/app/password-input";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

function render(inField = false): string {
  const input = createElement(PasswordInput, {
    id: "secret",
    name: "password",
    autoComplete: "current-password",
  });
  const content = inField
    ? createElement(
        FormField,
        { id: "secret", label: "Password", error: "Refused." } as ComponentProps<typeof FormField>,
        input,
      )
    : input;

  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages: en } as ComponentProps<typeof NextIntlClientProvider>,
      content,
    ),
  );
}

function attribute(markup: string, name: string): string | null {
  return markup.match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? null;
}

describe("PasswordInput", () => {
  it("renders a hidden password input that keeps its name and autocomplete", () => {
    const markup = render();

    expect(markup).toContain('type="password"');
    expect(markup).toContain('name="password"');
    expect(markup).toContain('autoComplete="current-password"');
  });

  it("renders a type=button toggle that is not pressed, with one fixed label", () => {
    const markup = render();

    expect(markup).toContain('<button type="button"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-label="Show password"');
  });

  it("points aria-controls at the input id", () => {
    const markup = render();

    expect(attribute(markup, "aria-controls")).toBe("secret");
    expect(markup).toContain('id="secret"');
  });

  it("reserves right padding on the input only", () => {
    expect(render()).toContain("pr-[50px]");
  });

  it("receives aria-describedby and aria-invalid from FormField on the input, not the wrapper", () => {
    const markup = render(true);
    const input = markup.match(/<input[^>]*>/)?.[0] ?? "";

    expect(input).toContain('aria-describedby="secret-error"');
    expect(input).toContain('aria-invalid="true"');
    expect(markup.match(/<div class="relative"[^>]*>/)?.[0]).not.toContain("aria-");
  });

  it("has the same label key in both languages", () => {
    expect(en.common.showPassword).toBe("Show password");
    expect(fr.common.showPassword).toBe("Afficher le mot de passe");
  });
});
