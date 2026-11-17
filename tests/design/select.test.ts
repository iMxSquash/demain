import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Select } from "../../src/components/select";

function render(props: Parameters<typeof Select>[0]): string {
  return renderToStaticMarkup(
    createElement(
      Select,
      props,
      createElement("option", { value: "a" }, "Alpha"),
      createElement("option", { value: "b", lang: "fr" }, "Bravo"),
    ),
  );
}

describe("Select on the server", () => {
  it("renders the native select that posts the form without JavaScript", () => {
    const markup = render({ id: "letter", name: "letter", defaultValue: "b", required: true });

    expect(markup).toContain("<select");
    expect(markup).toContain('name="letter"');
    expect(markup).toContain('id="letter"');
    expect(markup).toContain("required");
    expect(markup).toContain('<option value="b" lang="fr" selected="">Bravo</option>');
  });

  it("does not render the combobox before the page is interactive", () => {
    const markup = render({ id: "letter", name: "letter" });

    expect(markup).not.toContain('role="combobox"');
    expect(markup).not.toContain('role="listbox"');
    expect(markup).not.toContain("hidden");
  });

  it("keeps the links to the hint and the error on the native select", () => {
    const markup = render({ id: "letter", "aria-describedby": "letter-hint", "aria-invalid": true });

    expect(markup).toContain('aria-describedby="letter-hint"');
    expect(markup).toContain('aria-invalid="true"');
  });

  it("carries no inline style, which the content security policy blocks", () => {
    expect(render({ id: "letter" })).not.toContain("style=");
  });

  it("refuses a child that is not an option, since the list could not show it", () => {
    const render = () =>
      renderToStaticMarkup(
        createElement(Select, { id: "letter" }, createElement("optgroup", { label: "Group" }, createElement("option", { value: "a" }, "Alpha"))),
      );

    expect(render).toThrow("Select only accepts <option> children");
  });

  it("reads options from arrays and fragments", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Select,
        { id: "letter" },
        [createElement("option", { key: "a", value: "a" }, "Alpha")],
        createElement(Fragment, null, createElement("option", { value: "b" }, "Bravo")),
      ),
    );

    expect(markup).toContain("Alpha");
    expect(markup).toContain("Bravo");
  });
});
