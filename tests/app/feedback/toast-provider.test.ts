import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/en.json";
import { ToastProvider, type Notice } from "../../../src/app/feedback/toast-provider";

function render(notice: Notice | null): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      // The casts only satisfy `createElement`, which wants `children` among the props even when
      // it is passed as the third argument, as the lint rule requires.
      { locale: "en", messages } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(ToastProvider, { notice } as ComponentProps<typeof ToastProvider>, createElement("p", null, "page")),
    ),
  );
}

describe("ToastProvider rendered by the server", () => {
  it("keeps both live regions in the page when there is no notice", () => {
    const markup = render(null);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("Success.");
  });

  it("puts a success in the status region with its kind word and a check icon", () => {
    const markup = render({ id: "a", kind: "success", message: "Account archived." });
    const statusRegion = markup.slice(markup.indexOf('role="status"'), markup.indexOf('role="alert"'));

    expect(statusRegion).toContain("Success.");
    expect(statusRegion).toContain("Account archived.");
    expect(statusRegion).toContain("bg-positive-tint");
    expect(statusRegion).toContain("<svg");
  });

  it("puts an error in the alert region with its kind word and the negative tint", () => {
    const markup = render({ id: "b", kind: "error", message: "Nothing was saved." });
    const alertRegion = markup.slice(markup.indexOf('role="alert"'));

    expect(alertRegion).toContain("Error.");
    expect(alertRegion).toContain("Nothing was saved.");
    expect(alertRegion).toContain("bg-negative-tint");
    expect(markup.slice(0, markup.indexOf('role="alert"'))).not.toContain("Nothing was saved.");
  });

  it("enters through the stylesheet, never through a state written in the HTML", () => {
    const markup = render({ id: "a", kind: "success", message: "Done." });

    expect(markup).toContain("motion-enter");
    expect(markup).not.toContain("style=");
  });

  it("gives the dismiss button a name and a 44 px target", () => {
    const markup = render({ id: "a", kind: "success", message: "Done." });

    expect(markup).toContain('aria-label="Dismiss the notification"');
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("min-w-11");
  });
});
