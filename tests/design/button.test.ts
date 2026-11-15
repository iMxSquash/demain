import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, type ButtonVariant } from "../../src/components/button";

function render(props: Partial<Parameters<typeof Button>[0]> = {}): string {
  return renderToStaticMarkup(createElement(Button, { type: "submit", ...props }, "Add"));
}

describe("Button", () => {
  it.each<[ButtonVariant, string]>([
    ["primary", "bg-primary"],
    ["secondary", "bg-control"],
    ["destructive", "bg-danger"],
    ["link", "underline"],
  ])("draws the %s variant", (variant, expectedClass) => {
    expect(render({ variant })).toContain(expectedClass);
  });

  it("is primary by default", () => {
    expect(render()).toContain("bg-primary");
  });

  it("is at least 44 px square", () => {
    const markup = render();

    expect(markup).toContain("min-h-11");
    expect(markup).toContain("min-w-11");
  });

  it("marks a disabled button with colours, never with opacity", () => {
    const markup = render({ disabled: true });

    expect(markup).toContain(" disabled");
    expect(markup).toContain("disabled:bg-surface-sunken");
    expect(markup).not.toContain("opacity");
  });

  it("shows the ongoing verb and aria-busy while pending, and stays enabled", () => {
    const markup = render({ pending: true, pendingLabel: "Adding…" });

    expect(markup).toContain("Adding…");
    expect(markup).not.toContain(">Add<");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toMatch(/ disabled[ =>]/);
  });

  it("keeps its label while pending when no ongoing verb is given", () => {
    expect(render({ pending: true })).toContain(">Add<");
  });

  it("is not busy when idle", () => {
    expect(render()).not.toContain("aria-busy");
  });
});
