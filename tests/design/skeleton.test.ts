import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  SkeletonBlock,
  SkeletonFields,
  SkeletonLine,
  SkeletonPageHead,
  SkeletonRegion,
  SkeletonRows,
  SkeletonSection,
  SkeletonTable,
} from "../../src/components/skeleton";

const TOKENS_CSS = readFileSync("src/app/tokens.css", "utf8");
const GLOBALS_CSS = readFileSync("src/app/globals.css", "utf8");

function render(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element);
}

function countOf(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

// The text a screen reader could reach: markup without tags and without the hidden parts.
function textOutsideHiddenParts(markup: string): string {
  return markup
    .replace(/<([a-z]+)[^>]*aria-hidden="true"[^>]*>(?:(?!<\/\1>).)*<\/\1>/gs, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

describe("SkeletonLine", () => {
  it("is hidden from assistive technology and holds no text", () => {
    const markup = render(createElement(SkeletonLine));

    expect(markup).toContain('aria-hidden="true"');
    expect(markup.replace(/<[^>]+>/g, "")).toBe("");
  });

  it("takes the exact height of a line of its text size, so a swap moves nothing", () => {
    expect(render(createElement(SkeletonLine))).toContain("h-lh");
    expect(render(createElement(SkeletonLine))).toContain("text-body");
    expect(render(createElement(SkeletonLine, { size: "heading" }))).toContain("text-heading");
  });

  it("draws the block with the radius of a line of text", () => {
    expect(render(createElement(SkeletonLine))).toContain("skeleton rounded-control");
  });
});

describe("SkeletonBlock", () => {
  it("is hidden from assistive technology", () => {
    const markup = render(createElement(SkeletonBlock, { className: "h-[280px] rounded-control" }));

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('class="skeleton h-[280px] rounded-control"');
  });
});

describe("SkeletonRegion", () => {
  const markup = render(
    createElement(
      SkeletonRegion,
      { label: "Loading transactions", as: "main", className: "p-8" },
      createElement(SkeletonLine),
      createElement(SkeletonBlock, { className: "h-12" }),
    ),
  );

  it("draws its blocks for the page ground", () => {
    expect(markup).toContain("skeleton-ground");
    expect(markup).toContain("skeleton-ground p-8");
  });

  it("is busy and says so in words, once, in a polite status", () => {
    expect(markup).toContain('aria-busy="true"');
    expect(countOf(markup, 'role="status"')).toBe(1);
    expect(markup).toContain("Loading transactions");
  });

  it("keeps the status text visually hidden", () => {
    expect(markup).toMatch(/<p[^>]*class="sr-only"[^>]*>Loading transactions<\/p>/);
  });

  it("renders the element asked for, a main for a page", () => {
    expect(markup.startsWith("<main")).toBe(true);
    expect(render(createElement(SkeletonRegion, { label: "Loading" })).startsWith("<div")).toBe(true);
  });

  it("shows no text but the status: no invented figure or label", () => {
    expect(textOutsideHiddenParts(markup)).toBe("Loading transactions");
  });

  it("never moves the focus", () => {
    expect(markup).not.toContain("autofocus");
    expect(markup).not.toContain("tabindex");
  });
});

describe("SkeletonTable", () => {
  const markup = render(createElement(SkeletonTable, { columns: 4, rows: 3 }));

  it("draws one line per cell of a row and of the header, and one for the caption", () => {
    const rows = 3;
    const columns = 4;
    const header = columns;
    const caption = 1;

    expect(countOf(markup, 'class="skeleton rounded-control')).toBe(rows * columns + header + caption);
  });

  it("keeps 48 px rows with a hairline above them", () => {
    expect(countOf(markup, "h-12 border-t border-divider")).toBe(3);
  });

  it("sits in a card with narrow padding of 16 and wide padding of 24, like a data table", () => {
    expect(markup).toContain("rounded-card bg-surface p-4 @3xl:p-6");
  });

  it("draws its blocks for a card, not for the page ground", () => {
    expect(markup).toContain("skeleton-card");
  });

  it("holds no text", () => {
    expect(markup.replace(/<[^>]+>/g, "")).toBe("");
  });
});

describe("SkeletonRows", () => {
  it("draws the rows it is given with the classes of the caller", () => {
    const markup = render(
      createElement(SkeletonRows, { columns: 3, rows: 2, rowClassName: "border-b border-divider py-2" }),
    );

    expect(countOf(markup, "border-b border-divider py-2")).toBe(2);
    expect(countOf(markup, 'class="skeleton rounded-control')).toBe(6);
  });
});

describe("SkeletonPageHead", () => {
  it("draws a back link and a title, each one line of text", () => {
    const markup = render(createElement(SkeletonPageHead));

    expect(markup).toContain("w-32 self-start");
    expect(markup).toContain("text-heading");
  });

  it("leaves out the back link for a page that has none", () => {
    const markup = render(createElement(SkeletonPageHead, { backLink: false }));

    expect(markup).not.toContain("self-start");
    expect(markup).toContain("text-heading");
  });
});

describe("SkeletonSection", () => {
  it("is a section with the title line of a heading, then its content", () => {
    const markup = render(createElement(SkeletonSection, null, createElement(SkeletonBlock, { className: "h-12" })));

    expect(markup.startsWith("<section")).toBe(true);
    expect(markup.indexOf("text-title")).toBeLessThan(markup.indexOf("h-12"));
    expect(markup.replace(/<[^>]+>/g, "")).toBe("");
  });
});

describe("SkeletonFields", () => {
  it("draws a label line and a 48 px field per field", () => {
    const markup = render(createElement(SkeletonFields, { count: 3 }));

    expect(countOf(markup, "h-12 rounded-control")).toBe(3);
  });
});

describe("no inline style", () => {
  it("is written in classes only, since the content security policy blocks style attributes", () => {
    const markup = render(
      createElement(
        SkeletonRegion,
        { label: "Loading" },
        createElement(SkeletonLine, { width: "1/3" }),
        createElement(SkeletonTable, { columns: 2, rows: 1 }),
        createElement(SkeletonFields, { count: 1 }),
      ),
    );

    expect(markup).not.toContain("style=");
  });
});

describe("the shimmer in the stylesheets", () => {
  it("has its token, with a cycle shorter than 5 seconds, set to 0 under reduced motion", () => {
    const cycle = /--motion-duration-shimmer:\s*(\d+)ms;/.exec(TOKENS_CSS);
    const reduced = /prefers-reduced-motion: reduce\)\s*{[^}]*--motion-duration-shimmer:\s*0ms;/s;

    expect(Number(cycle?.[1])).toBeGreaterThan(0);
    expect(Number(cycle?.[1])).toBeLessThan(5000);
    expect(TOKENS_CSS).toMatch(reduced);
  });

  it("repeats with a token for its cycle and for its easing, never a raw value", () => {
    expect(GLOBALS_CSS).toContain(
      "animation: shimmer var(--motion-duration-shimmer) var(--motion-ease-move) infinite;",
    );
  });

  it("is the only animation that repeats", () => {
    const repeating = GLOBALS_CSS.match(/animation:[^;]*infinite[^;]*;/g) ?? [];

    expect(repeating).toHaveLength(1);
  });

  it("keeps its band outside its block at rest, so reduced motion leaves no stripe", () => {
    expect(GLOBALS_CSS).toMatch(/&::after\s*{[^}]*translate:\s*-100% 0;/s);
  });

  it("uses no other colour than the tokens of the skeleton: a block on a card or on the ground, and the band", () => {
    const layer = /@layer components {\s*(\/\*.*?\*\/\s*)?\.skeleton-ground.*?\n  }\n}/s.exec(GLOBALS_CSS)?.[0] ?? "";
    const colours = layer.match(/var\(--color-[a-z-]+\)/g) ?? [];

    expect(layer).toContain("&::after");
    expect([...new Set(colours)].sort()).toEqual([
      "var(--color-control-hover)",
      "var(--color-surface)",
      "var(--color-surface-sunken)",
    ]);
  });
});
