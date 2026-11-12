import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findIdentityViolations } from "./identity-guard";

const SOURCE_DIRECTORY = path.join(import.meta.dirname, "..", "..", "src");

function readSourceFiles(): { file: string; source: string }[] {
  return readdirSync(SOURCE_DIRECTORY, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => ({
      file,
      source: readFileSync(path.join(SOURCE_DIRECTORY, file), "utf8"),
    }));
}

describe("identity guard", () => {
  it("finds no refused class or colour in src", () => {
    const violations = readSourceFiles().flatMap(({ file, source }) =>
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

  it("accepts the identity utilities and in-page anchors", () => {
    const source = `<a href="#content" className="bg-surface text-text-muted border-border-control bg-accent-tint text-label rounded-pill shadow-overlay font-medium tabular-nums font-mono stroke-divider fill-text">Skip</a>`;

    expect(findIdentityViolations(source, "link.tsx")).toEqual([]);
  });
});
