import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CountBadge,
  DataTable,
  EmptyState,
  Pill,
} from "../../src/components/data-display";

describe("DataTable", () => {
  const markup = renderToStaticMarkup(
    DataTable({ caption: "Recorded rates", children: createElement("tbody") }),
  );

  it("shows its caption and names the scroll region with it", () => {
    expect(markup).toContain("<caption>Recorded rates</caption>");
    expect(markup).toContain('aria-label="Recorded rates"');
  });

  it("aligns its caption left, since a caption is centred by default", () => {
    expect(markup).toContain("[&amp;_caption]:text-left");
  });

  it("scrolls inside a focusable region, never the page", () => {
    expect(markup).toContain('role="region"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain("relative overflow-x-auto");
  });

  it("sits in a card with narrow padding of 16 and wide padding of 24", () => {
    expect(markup).toContain("rounded-card bg-surface p-4 @3xl:p-6");
  });

  it("gives rows 48 px and a hairline above them", () => {
    expect(markup).toContain("[&amp;_tbody_td]:h-12");
    expect(markup).toContain("[&amp;_tbody_tr]:border-divider");
  });
});

describe("Pill", () => {
  it("is neutral by default", () => {
    const markup = renderToStaticMarkup(Pill({ children: "Archived" }));

    expect(markup).toContain("bg-control text-text");
    expect(markup).toContain("rounded-pill");
  });

  it("draws the warning tone", () => {
    const markup = renderToStaticMarkup(Pill({ tone: "warning", children: "To categorize" }));

    expect(markup).toContain("bg-warning-tint text-warning");
  });

  it("is a status, not a control", () => {
    const markup = renderToStaticMarkup(Pill({ children: "Archived" }));

    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<a ");
  });
});

describe("CountBadge", () => {
  it("shows the count on the control tone", () => {
    const markup = renderToStaticMarkup(CountBadge({ count: 12 }));

    expect(markup).toContain("bg-control");
    expect(markup).toContain(">12<");
  });

  it("hides its digits from assistive technology when decorative", () => {
    const markup = renderToStaticMarkup(CountBadge({ count: 3, decorative: true }));

    expect(markup).toContain('aria-hidden="true"');
  });

  it("takes layout classes", () => {
    const markup = renderToStaticMarkup(CountBadge({ count: 0, className: "ml-auto" }));

    expect(markup).toContain("ml-auto");
  });
});

describe("EmptyState", () => {
  it("limits a line to 36 characters", () => {
    const markup = renderToStaticMarkup(EmptyState({ children: "Nothing yet." }));

    expect(markup).toContain("max-w-[36ch]");
    expect(markup).toContain("bg-surface-sunken");
    expect(markup).toContain("rounded-control");
  });

  it("offers one secondary action as a link of at least 44 px", () => {
    const markup = renderToStaticMarkup(
      EmptyState({
        action: { href: "#new-heading", label: "Add" },
        children: "Nothing yet.",
      }),
    );

    expect(markup).toContain('href="#new-heading"');
    expect(markup).toContain("min-h-11");
    expect(markup.match(/<a /g)).toHaveLength(1);
  });

  it("shows no action when there is none", () => {
    const markup = renderToStaticMarkup(EmptyState({ children: "Nothing yet." }));

    expect(markup).not.toContain("<a ");
  });
});
