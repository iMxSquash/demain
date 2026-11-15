import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import frMessages from "../../messages/fr.json";
import messages from "../../messages/en.json";

describe("the four forms use the shared choice controls", () => {
  const FORMS = [
    "src/app/imports/import-form.tsx",
    "src/app/categories/categorize-form.tsx",
    "src/app/backup/restore-form.tsx",
    "src/app/balances/summary/summary-balances-form.tsx",
  ];

  it.each(FORMS)("%s has no bare checkbox, file input or details", (file) => {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");

    expect(source).not.toContain('type="checkbox"');
    expect(source).not.toContain('type="file"');
    expect(source).not.toContain("<details");
  });

  it.each([
    "src/app/imports/staged-file-card.tsx",
    "src/app/imports/staged-file-tools.tsx",
    "src/app/imports/staged-row-editor.tsx",
    "src/app/imports/rule-proposals-panel.tsx",
  ])("%s has no bare checkbox or details", (file) => {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");

    expect(source).not.toContain('type="checkbox"');
    expect(source).not.toContain("<details");
  });
});

describe("warnings use the Notice", () => {
  it.each([
    "src/app/backup/page.tsx",
    "src/app/balances/summary/summary-balances-form.tsx",
    "src/app/imports/import-form.tsx",
    "src/app/imports/staged-file-card.tsx",
    "src/app/imports/rule-proposals-panel.tsx",
  ])("%s writes its warnings through Notice", (file) => {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");

    expect(source).toContain("<Notice");
  });

  it.each([
    ["en", "Warning:", messages],
    ["fr", "Attention :", frMessages],
  ])("no %s message that a Notice shows starts with the word itself", (_locale, word, tree) => {
    const text = JSON.stringify(tree);

    expect(text).not.toMatch(new RegExp(`"(?:shadowed|jsonWarning|restoreWarning)": "${word}`));
  });
});
