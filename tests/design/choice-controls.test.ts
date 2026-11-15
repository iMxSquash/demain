import { NextIntlClientProvider } from "next-intl";
import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import messages from "../../messages/en.json";
import { Checkbox } from "../../src/components/checkbox";
import { Disclosure } from "../../src/components/disclosure";
import { FileInput } from "../../src/components/file-input";
import { Notice } from "../../src/components/notice";

function render(element: ReactElement): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages } as ComponentProps<typeof NextIntlClientProvider>,
      element,
    ),
  );
}

describe("Checkbox", () => {
  it("sits in a row of at least 44 px", () => {
    const markup = render(createElement(Checkbox, { name: "x", label: "Has header" }));

    expect(markup).toContain("min-h-11");
    expect(markup).toContain("Has header");
  });

  it("draws a 20 px native box that a label wraps", () => {
    const markup = render(createElement(Checkbox, { name: "x", label: "Has header" }));

    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("size-5");
    expect(markup).toMatch(/^<label[^>]*>.*<input/);
  });

  it("is a 44 px square without a visible label, named by aria-label", () => {
    const markup = render(createElement(Checkbox, { "aria-label": "Select row 3" }));

    expect(markup).toContain('aria-label="Select row 3"');
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("min-w-11");
  });

  it("fills with ink when checked and never with blue", () => {
    const markup = render(createElement(Checkbox, { name: "x", label: "L" }));

    expect(markup).toContain("checked:bg-primary");
    expect(markup).toContain("border-on-primary");
    expect(markup).not.toContain("accent");
  });

  it("keeps the checked state the caller sets", () => {
    const markup = render(
      createElement(Checkbox, { name: "x", label: "L", defaultChecked: true }),
    );

    expect(markup).toContain('checked=""');
  });

  it("marks a disabled box with colours, never with opacity", () => {
    const markup = render(createElement(Checkbox, { name: "x", label: "L", disabled: true }));

    expect(markup).toContain("disabled:bg-surface-sunken");
    expect(markup).toContain("disabled:border-divider");
    expect(markup).not.toContain("opacity-50");
  });
});

describe("FileInput", () => {
  const markup = render(createElement(FileInput, { id: "file", name: "file", multiple: true }));

  it("keeps a native file input, visually hidden but focusable", () => {
    expect(markup).toContain('type="file"');
    expect(markup).toContain('id="file"');
    expect(markup).toContain('name="file"');
    expect(markup).toContain("sr-only");
    expect(markup).not.toContain("hidden ");
    expect(markup).not.toContain('tabindex="-1"');
  });

  it("shows a Choose a file button that is the label of the input", () => {
    expect(markup).toMatch(/<label[^>]*for="file"[^>]*>Choose a file<\/label>/);
    expect(markup).toContain("bg-control");
    expect(markup).toContain("min-h-11");
  });

  it("rings the button when the input has keyboard focus", () => {
    expect(markup).toContain("peer-focus-visible:outline-focus");
    expect(markup.indexOf('type="file"')).toBeLessThan(markup.indexOf("<label"));
  });

  it("says that no file is chosen next to the button", () => {
    expect(markup).toContain("No file chosen");
  });

  it("passes the field links to the input", () => {
    const linked = render(
      createElement(FileInput, { id: "f", "aria-describedby": "f-hint", "aria-invalid": true }),
    );

    expect(linked).toContain('aria-describedby="f-hint"');
    expect(linked).toContain('aria-invalid="true"');
  });

  it("marks a disabled button with colours, never with opacity", () => {
    const disabled = render(createElement(FileInput, { id: "f", disabled: true }));

    expect(disabled).toContain("peer-disabled:bg-surface-sunken");
  });
});

describe("Disclosure", () => {
  const markup = render(createElement(Disclosure, { summary: "More options" }, "Body"));

  it("is a native details between two divider hairlines", () => {
    expect(markup).toMatch(/^<details[^>]*border-y[^>]*border-divider/);
    expect(markup).toContain("<summary");
    expect(markup).toContain("More options");
    expect(markup).toContain("Body");
  });

  it("has a 44 px medium summary with a chevron that turns when open", () => {
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("font-medium");
    expect(markup).toContain("group-open:rotate-180");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("is closed by default and opens when asked", () => {
    expect(markup).not.toMatch(/<details[^>]* open/);
    const open = render(createElement(Disclosure, { summary: "S", open: true }, "B"));

    expect(open).toMatch(/<details[^>]* open/);
  });

  it("fades its content in", () => {
    expect(markup).toContain("motion-enter");
  });
});

describe("Notice", () => {
  const markup = render(createElement(Notice, { id: "n1" } as ComponentProps<typeof Notice>, "Check this."));

  it("starts with the word Warning in the warning colour, so colour is never alone", () => {
    expect(markup).toContain("Warning:");
    expect(markup).toMatch(/text-warning[^>]*>Warning:/);
    expect(markup).toContain("Check this.");
  });

  it("is a warning tint panel with the control radius", () => {
    expect(markup).toContain("bg-warning-tint");
    expect(markup).toContain("rounded-control");
    expect(markup).toContain("text-text");
    expect(markup).toContain('id="n1"');
  });
});
