import { describe, expect, it } from "vitest";

import { withoutEmptyFilePlaceholders } from "../../src/app/form-files";

const file = (name: string, content = "Date;Label;Amount") =>
  new File([content], name, { type: "text/csv" });

describe("withoutEmptyFilePlaceholders", () => {
  it("drops the nameless empty file that a browser sends for an input left empty", () => {
    const formData = new FormData();
    formData.append("summary", new File([], ""));
    formData.append("year", "2026");

    const cleaned = withoutEmptyFilePlaceholders(formData);

    expect(cleaned.has("summary")).toBe(false);
    expect(cleaned.get("year")).toBe("2026");
  });

  it("keeps the files that were chosen, in order, even among placeholders", () => {
    const formData = new FormData();
    formData.append("tabs", file("january.csv"));
    formData.append("tabs", new File([], ""));
    formData.append("tabs", file("february.csv"));

    const names = withoutEmptyFilePlaceholders(formData)
      .getAll("tabs")
      .map((entry) => (entry instanceof File ? entry.name : entry));

    expect(names).toEqual(["january.csv", "february.csv"]);
  });

  it("keeps a chosen file that is empty, so that the form can say so", () => {
    const formData = new FormData();
    formData.append("tabs", new File([], "empty.csv"));

    expect(withoutEmptyFilePlaceholders(formData).getAll("tabs")).toHaveLength(1);
  });

  it("does not change the form it is given", () => {
    const formData = new FormData();
    formData.append("summary", new File([], ""));

    withoutEmptyFilePlaceholders(formData);

    expect(formData.has("summary")).toBe(true);
  });
});
