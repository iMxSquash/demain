import { describe, expect, it } from "vitest";

import { filterLabelSuggestions } from "../../src/domain/label-suggestions";

const SUGGESTIONS = [
  { label: "Groceries" },
  { label: "Café du coin" },
  { label: "Gym" },
  { label: "Gas" },
];

describe("filterLabelSuggestions", () => {
  it("keeps the first suggestions, in order, when nothing is typed", () => {
    expect(filterLabelSuggestions(SUGGESTIONS, "", 2)).toEqual([
      { label: "Groceries" },
      { label: "Café du coin" },
    ]);
  });

  it("keeps the labels that contain the typed text, ignoring case", () => {
    expect(filterLabelSuggestions(SUGGESTIONS, "g", 5).map(({ label }) => label)).toEqual([
      "Groceries",
      "Gym",
      "Gas",
    ]);
  });

  it("ignores accents on both sides", () => {
    expect(filterLabelSuggestions(SUGGESTIONS, "CAFE", 5)).toEqual([{ label: "Café du coin" }]);
  });

  it("drops a label that is already typed in full", () => {
    expect(filterLabelSuggestions(SUGGESTIONS, "gym", 5)).toEqual([]);
  });

  it("trims the typed text", () => {
    expect(filterLabelSuggestions(SUGGESTIONS, "  gas ", 5)).toEqual([]);
  });

  it("stops at the limit", () => {
    expect(filterLabelSuggestions(SUGGESTIONS, "g", 2)).toHaveLength(2);
  });
});
