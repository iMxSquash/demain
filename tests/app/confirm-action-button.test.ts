import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../messages/en.json";
import { ConfirmActionButton } from "../../src/app/confirm-action-button";

function render(): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(ConfirmActionButton, {
        action: async () => {},
        label: "Archive",
        subject: "Savings",
        title: "Archive this account?",
        message: "It leaves the active list.",
        confirmLabel: "Archive",
      }),
    ),
  );
}

describe("ConfirmActionButton rendered by the server", () => {
  it("renders a closed dialog named by its title, next to the opening button", () => {
    const markup = render();

    expect(markup).toContain("<dialog");
    expect(markup).toContain("aria-labelledby=");
    expect(markup).not.toMatch(/<dialog[^>]* open/);
    expect(markup).toContain("Archive");
  });

  it("holds no content and no inline style until it is opened", () => {
    const markup = render();

    expect(markup).not.toContain("Archive this account?");
    expect(markup).not.toContain("style=");
  });

  it("is limited to 420 px over the backdrop token", () => {
    const markup = render();

    expect(markup).toContain("max-w-105");
    expect(markup).toContain("backdrop:bg-backdrop");
  });
});
