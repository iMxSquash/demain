import { describe, expect, it } from "vitest";

import {
  parseAccountParam,
  parseMonthParam,
  selectAccounts,
  type SelectableAccount,
} from "../../../src/app/calendar/lines/calendar-lines-params";

const CURRENT_MONTH = "2026-11";

describe("month parameter", () => {
  it("accepts a strict YYYY-MM", () => {
    expect(parseMonthParam("2026-03", CURRENT_MONTH)).toBe("2026-03");
    expect(parseMonthParam("0001-01", CURRENT_MONTH)).toBe("0001-01");
    expect(parseMonthParam("9999-12", CURRENT_MONTH)).toBe("9999-12");
  });

  it("falls back to the current month when it is missing", () => {
    expect(parseMonthParam(undefined, CURRENT_MONTH)).toBe(CURRENT_MONTH);
  });

  it.each([
    "2026-13",
    "2026-00",
    "abcd",
    "2026-1",
    "2026-03-01",
    " 2026-03",
    "0000-05",
    "",
    "2026/03",
  ])("falls back to the current month for %j", (value) => {
    expect(parseMonthParam(value, CURRENT_MONTH)).toBe(CURRENT_MONTH);
  });

  it("falls back to the current month when the parameter is repeated", () => {
    expect(parseMonthParam(["2026-03", "2026-04"], CURRENT_MONTH)).toBe(CURRENT_MONTH);
  });
});

describe("account parameter", () => {
  it("defaults to the checking accounts", () => {
    expect(parseAccountParam(undefined)).toBe("checking");
    expect(parseAccountParam("checking")).toBe("checking");
  });

  it("accepts a numeric id", () => {
    expect(parseAccountParam("12")).toBe("12");
  });

  it.each(["", "abc", "-1", "0", "1.5", "1e3", "007", "99999999999999999999", "Checking"])(
    "falls back to the checking accounts for %j",
    (value) => {
      expect(parseAccountParam(value)).toBe("checking");
    },
  );

  it("falls back to the checking accounts when the parameter is repeated", () => {
    expect(parseAccountParam(["1", "2"])).toBe("checking");
  });
});

describe("selected accounts", () => {
  const accounts: SelectableAccount[] = [
    { id: 1, name: "Current", kind: "checking", currency: "EUR" },
    { id: 2, name: "Joint", kind: "checking", currency: "USD" },
    { id: 3, name: "Savings", kind: "savings", currency: "EUR" },
  ];

  it("takes every checking account in the reference currency by default", () => {
    expect(selectAccounts("checking", accounts, "EUR")).toEqual({
      key: "checking",
      accountIds: [1, 2],
      currency: "EUR",
    });
  });

  it("takes one account in its own currency", () => {
    expect(selectAccounts("2", accounts, "EUR")).toEqual({
      key: "2",
      accountIds: [2],
      currency: "USD",
    });
  });

  it("falls back to the checking accounts for an id that is not selectable", () => {
    expect(selectAccounts("42", accounts, "EUR").key).toBe("checking");
  });

  it("selects nothing when there is no checking account", () => {
    expect(selectAccounts("checking", [accounts[2]!], "EUR")).toEqual({
      key: "checking",
      accountIds: [],
      currency: "EUR",
    });
  });
});
