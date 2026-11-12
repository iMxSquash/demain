import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findIdentityViolations } from "./identity-guard";

const SOURCE_DIRECTORY = "src";

const SOURCE_FILES = readdirSync(SOURCE_DIRECTORY, { recursive: true, encoding: "utf8" })
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => path.join(SOURCE_DIRECTORY, file))
  .map((file) => ({ file, source: readFileSync(file, "utf8") }));

describe("identity guard", () => {
  it("scans the components of src", () => {
    expect(SOURCE_FILES.map(({ file }) => file)).toContain(path.join("src", "app", "layout.tsx"));
  });

  it("finds no refused class or colour in src", () => {
    const violations = SOURCE_FILES.flatMap(({ file, source }) =>
      findIdentityViolations(source, file).map((violation) => `${file}: ${violation}`),
    );

    expect(violations).toEqual([]);
  });

  it("rejects the old blue button fill", () => {
    const source = `<button className="min-h-11 bg-blue-800 px-4">Save</button>`;

    expect(findIdentityViolations(source, "button.tsx")).toEqual(["bg-blue-800"]);
  });

  it("rejects a class chosen inside a template literal", () => {
    const source = "className={`border-2 ${isError ? \"border-red-800\" : \"border-green-800\"}`}";

    expect(findIdentityViolations(source, "toast.tsx")).toEqual([
      "border-red-800",
      "border-green-800",
    ]);
  });

  it("rejects a duration class, with or without a variant", () => {
    const source = `const CLASS = "transition-colors duration-200 hover:duration-75";`;

    expect(findIdentityViolations(source, "chip.ts")).toEqual([
      "duration-200",
      "hover:duration-75",
    ]);
  });

  it("rejects a hex colour in a component", () => {
    const source = `<rect fill="#1d4ed8" stroke="#fff" />`;

    expect(findIdentityViolations(source, "mark.tsx")).toEqual(["#1d4ed8", "#fff"]);
  });

  it("rejects the other default theme values that no longer compile", () => {
    const source = `const CLASS = "rounded-lg rounded-t leading-tight tracking-wide ease-in-out animate-spin border-t-neutral-300 ring-offset-white inset-ring-red-800";`;

    expect(findIdentityViolations(source, "card.ts")).toEqual([
      "rounded-lg",
      "rounded-t",
      "leading-tight",
      "tracking-wide",
      "ease-in-out",
      "animate-spin",
      "border-t-neutral-300",
      "ring-offset-white",
      "inset-ring-red-800",
    ]);
  });

  it("accepts the static utilities that still compile", () => {
    const source = `const CLASS = "rounded-full rounded-none leading-none leading-6 ease-linear animate-none border-t-divider";`;

    expect(findIdentityViolations(source, "card.ts")).toEqual([]);
  });

  it("accepts the identity utilities and in-page anchors", () => {
    const source = `<a href="#content" className="bg-surface text-text-muted border-border-control bg-accent-tint text-label rounded-pill shadow-overlay font-medium tabular-nums font-mono stroke-divider fill-text">Skip</a>`;

    expect(findIdentityViolations(source, "link.tsx")).toEqual([]);
  });
});
