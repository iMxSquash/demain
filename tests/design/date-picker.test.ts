import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { DatePicker } from "../../src/components/date-picker";

const MESSAGES = {
  common: {
    datePicker: { dialog: "Choose a date", previousMonth: "Previous", nextMonth: "Next", today: "Today" },
  },
};

function render(props: Parameters<typeof DatePicker>[0]): string {
  return renderToStaticMarkup(
    // The provider's props type requires `children`, so it cannot go as an argument of createElement.
    // eslint-disable-next-line react/no-children-prop
    createElement(NextIntlClientProvider, {
      locale: "en",
      timeZone: "UTC",
      messages: MESSAGES,
      children: createElement(DatePicker, props),
    }),
  );
}

describe("DatePicker on the server", () => {
  it("renders the native date input that posts the form without JavaScript", () => {
    const markup = render({ id: "date", name: "date", defaultValue: "2026-11-17", required: true });

    expect(markup).toContain('type="date"');
    expect(markup).toContain('name="date"');
    expect(markup).toContain('id="date"');
    expect(markup).toContain('value="2026-11-17"');
    expect(markup).toContain("required");
  });

  it("does not render the dialog or the trigger before the page is interactive", () => {
    const markup = render({ id: "date", name: "date" });

    expect(markup).not.toContain("<button");
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain("hidden");
  });

  it("keeps the links to the hint and the error on the native input", () => {
    const markup = render({ id: "date", "aria-describedby": "date-hint", "aria-invalid": true });

    expect(markup).toContain('aria-describedby="date-hint"');
    expect(markup).toContain('aria-invalid="true"');
  });

  it("carries no inline style, which the content security policy blocks", () => {
    expect(render({ id: "date" })).not.toContain("style=");
  });
});
