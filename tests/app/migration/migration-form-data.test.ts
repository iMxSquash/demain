import { describe, expect, it } from "vitest";

import { MAX_FILE_BYTES } from "../../../src/app/form-files";
import {
  MAX_TAB_FILES,
  readMigrationForm,
  type MigrationAccount,
} from "../../../src/app/migration/migration-form-data";

const ACCOUNTS: MigrationAccount[] = [
  { id: 1, name: "Checking", currency: "EUR" },
  { id: 2, name: "Livret Jeune", currency: "EUR" },
  { id: 3, name: "Livret A", currency: "EUR" },
];

const file = (name: string, content = "Date;Label;Amount") =>
  new File([content], name, { type: "text/csv" });

function build(
  fields: Record<string, string | File | File[]> = {},
  extra: [string, string | File][] = [],
): FormData {
  const defaults: Record<string, string | File | File[]> = {
    tabs: [file("january.csv"), file("february.csv")],
    summary: file("summary.csv"),
    year: "",
    delimiter: "",
    checkingId: "1",
    savingsId: "2",
    openingDate: "2025-12-31",
    "balance-1": "56,27",
    "balance-2": "1 476,84",
    "balance-3": "",
    intent: "preview",
  };
  const formData = new FormData();
  for (const [name, value] of Object.entries({ ...defaults, ...fields })) {
    for (const item of Array.isArray(value) ? value : [value]) {
      formData.append(name, item);
    }
  }
  for (const [name, value] of extra) formData.append(name, value);
  return formData;
}

const errorOf = (formData: FormData) => {
  const result = readMigrationForm(formData, ACCOUNTS);
  if ("form" in result) throw new Error("The form was accepted");
  return result.error;
};

describe("readMigrationForm", () => {
  it("reads a complete form", () => {
    const result = readMigrationForm(build({ year: "2026" }), ACCOUNTS);

    if (!("form" in result)) throw new Error("The form was refused");
    expect(result.form).toMatchObject({
      checkingId: 1,
      savingsId: 2,
      openingDate: "2025-12-31",
      year: 2026,
      delimiter: undefined,
      isCommit: false,
      hasConfirmed: false,
      openingBalances: [
        { accountId: 1, amount: 5_627 },
        { accountId: 2, amount: 147_684 },
      ],
    });
    expect(result.form.tabs.map((tab) => tab.name)).toEqual([
      "january.csv",
      "february.csv",
    ]);
    expect(result.form.summary?.name).toBe("summary.csv");
  });

  it("knows a commit and a confirmation", () => {
    const result = readMigrationForm(
      build({ intent: "commit" }, [["confirmReview", "on"]]),
      ACCOUNTS,
    );

    if (!("form" in result)) throw new Error("The form was refused");
    expect(result.form).toMatchObject({ isCommit: true, hasConfirmed: true });
  });

  it("takes the separator the user chose, and ignores any other value", () => {
    const chosen = readMigrationForm(build({ delimiter: "," }), ACCOUNTS);
    const unknown = readMigrationForm(build({ delimiter: "|" }), ACCOUNTS);

    if (!("form" in chosen) || !("form" in unknown)) throw new Error("Refused");
    expect(chosen.form.delimiter).toBe(",");
    expect(unknown.form.delimiter).toBeUndefined();
  });

  it("treats the Summary as optional", () => {
    const result = readMigrationForm(build({ summary: file("") }), ACCOUNTS);

    if (!("form" in result)) throw new Error("The form was refused");
    expect(result.form.summary).toBeNull();
  });

  it("asks for both accounts, and for two different ones", () => {
    expect(errorOf(build({ checkingId: "" })).key).toBe("errors.accountRequired");
    expect(errorOf(build({ savingsId: "99" })).key).toBe("errors.accountRequired");
    expect(errorOf(build({ savingsId: "1" })).key).toBe("errors.sameAccount");
  });

  it("asks for at least one monthly tab, ignoring the empty entry that a browser sends", () => {
    expect(errorOf(build({ tabs: [file("")] })).key).toBe("errors.filesRequired");
    expect(errorOf(build({ tabs: [] })).key).toBe("errors.filesRequired");
  });

  it("refuses too many files, a file too large and an empty file, naming the file", () => {
    const many = Array.from({ length: MAX_TAB_FILES + 1 }, (_, i) =>
      file(`tab-${i}.csv`),
    );
    expect(errorOf(build({ tabs: many }))).toEqual({
      key: "errors.tooManyFiles",
      values: { max: MAX_TAB_FILES },
    });

    const large = file("big.csv", "x".repeat(MAX_FILE_BYTES + 1));
    expect(errorOf(build({ tabs: [large] }))).toMatchObject({
      key: "errors.fileTooLarge",
      values: { name: "big.csv" },
    });
    expect(errorOf(build({ summary: large })).key).toBe("errors.fileTooLarge");

    // A file with a name and no content is not the placeholder of an empty input.
    const empty = new File([], "empty.csv");
    expect(errorOf(build({ tabs: [empty] }))).toMatchObject({
      key: "errors.fileEmpty",
      values: { name: "empty.csv" },
    });
  });

  it("refuses a year that does not have four digits, and accepts none", () => {
    expect(errorOf(build({ year: "26" })).key).toBe("errors.yearInvalid");
    expect(errorOf(build({ year: "2026a" })).key).toBe("errors.yearInvalid");
    expect(readMigrationForm(build({ year: "" }), ACCOUNTS)).toHaveProperty("form");
  });

  it("refuses an opening date that is not on the calendar", () => {
    expect(errorOf(build({ openingDate: "" })).key).toBe("errors.openingDateInvalid");
    expect(errorOf(build({ openingDate: "2026-02-30" })).key).toBe(
      "errors.openingDateInvalid",
    );
  });

  it("refuses an opening balance that is not an amount, naming the account", () => {
    expect(errorOf(build({ "balance-2": "abc" }))).toEqual({
      key: "errors.balanceInvalid",
      values: { account: "Livret Jeune" },
    });
  });

  it("keeps an opening balance of zero and skips a blank one", () => {
    const result = readMigrationForm(
      build({ "balance-1": "0", "balance-2": "", "balance-3": "0,00" }),
      ACCOUNTS,
    );

    if (!("form" in result)) throw new Error("The form was refused");
    expect(result.form.openingBalances).toEqual([
      { accountId: 1, amount: 0 },
      { accountId: 3, amount: 0 },
    ]);
  });

  it("refuses two files with the same name, which would make their lines indistinguishable", () => {
    expect(
      errorOf(build({ tabs: [file("january.csv"), file("january.csv")] })),
    ).toEqual({ key: "errors.duplicateFileName", values: { name: "january.csv" } });
    expect(
      errorOf(build({ tabs: [file("january.csv")], summary: file("january.csv") })).key,
    ).toBe("errors.duplicateFileName");
  });
});
