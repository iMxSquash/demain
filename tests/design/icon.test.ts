import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Check } from "@phosphor-icons/react/ssr";

import { Icon } from "../../src/components/icon";

function render(label?: string): string {
  return renderToStaticMarkup(createElement(Icon, { icon: Check, label }));
}

describe("Icon", () => {
  it("is hidden from assistive technology when it has no label", () => {
    expect(render()).toContain('aria-hidden="true"');
  });

  it("is drawn in currentColor at 20 px with no inline style", () => {
    const markup = render();

    expect(markup).toContain('fill="currentColor"');
    expect(markup).toContain('width="20"');
    expect(markup).toContain('height="20"');
    expect(markup).not.toContain("style=");
  });

  it("exposes its label as an accessible name instead of being hidden", () => {
    const markup = render("Saved");

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Saved"');
    expect(markup).not.toContain("aria-hidden");
  });
});
