import { describe, expect, it } from "vitest";

import { MAX_FILE_BYTES } from "../../../src/app/form-files";
import { readSummaryBalancesForm } from "../../../src/app/balances/summary/summary-balances-form-data";

const ACCOUNTS = [{ id: 1 }, { id: 2 }];

const file = (name: string, content = "Month;Balance") =>
  new File([content], name, { type: "text/csv" });

function build(fields: Record<string, string | File> = {}): FormData {
  const defaults: Record<string, string | File> = {
    summary: file("summary.csv"),
    accountId: "1",
    year: "",
    intent: "preview",
  };
  const formData = new FormData();
  for (const [name, value] of Object.entries({ ...defaults, ...fields })) {
    formData.append(name, value);
  }
  return formData;
}

const errorOf = (formData: FormData) => {
  const result = readSummaryBalancesForm(formData, ACCOUNTS);
  if ("form" in result) throw new Error("The form was accepted");
  return result.error;
};

describe("readSummaryBalancesForm", () => {
  it("reads a complete form as a preview", () => {
    const result = readSummaryBalancesForm(build({ year: "2026" }), ACCOUNTS);

    if (!("form" in result)) throw new Error("The form was refused");
    expect(result.form).toMatchObject({ accountId: 1, year: 2026, isCommit: false });
    expect(result.form.file.name).toBe("summary.csv");
  });

  it("reads the commit intent", () => {
    const result = readSummaryBalancesForm(build({ intent: "commit" }), ACCOUNTS);

    if (!("form" in result)) throw new Error("The form was refused");
    expect(result.form.isCommit).toBe(true);
  });

  it("leaves the year undefined when it is empty", () => {
    const result = readSummaryBalancesForm(build(), ACCOUNTS);

    if (!("form" in result)) throw new Error("The form was refused");
    expect(result.form.year).toBeUndefined();
  });

  it("refuses an account that is not in the list", () => {
    expect(errorOf(build({ accountId: "9" }))).toEqual({
      key: "accountRequired",
      field: "accountId",
    });
    expect(errorOf(build({ accountId: "" })).key).toBe("accountRequired");
    expect(errorOf(build({ accountId: "1abc" })).key).toBe("accountRequired");
  });

  it("refuses a form without a file or with the nameless placeholder of an empty input", () => {
    expect(errorOf(build({ summary: new File([], "") })).key).toBe("fileRequired");
    const formData = build();
    formData.delete("summary");
    expect(errorOf(formData).key).toBe("fileRequired");
  });

  it("refuses an empty file and names it", () => {
    expect(errorOf(build({ summary: new File([], "summary.csv") }))).toEqual({
      key: "fileEmpty",
      field: "summary",
      values: { name: "summary.csv" },
    });
  });

  it("refuses a file above the size limit", () => {
    const large = file("big.csv", "x".repeat(MAX_FILE_BYTES + 1));

    expect(errorOf(build({ summary: large }))).toEqual({
      key: "fileTooLarge",
      field: "summary",
      values: { name: "big.csv", max: MAX_FILE_BYTES / 1024 },
    });
  });

  it("refuses a year that is not four digits", () => {
    expect(errorOf(build({ year: "26" }))).toEqual({
      key: "yearInvalid",
      field: "year",
    });
    expect(errorOf(build({ year: "20x6" })).key).toBe("yearInvalid");
  });
});
