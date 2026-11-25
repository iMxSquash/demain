import { describe, expect, it } from "vitest";

import {
  parseOccurrenceOverrideForm as parse,
  readOccurrenceTarget,
} from "../../../src/app/calendar/occurrence-override-form-data";
import type { PlannedItemKind } from "../../../src/domain/planned-item";
import { translateKey } from "../translate-key";

const TARGET = { itemId: 7, nominalDate: "2026-03-05" };

function formOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

const parseOccurrenceOverrideForm = (
  fields: Record<string, string>,
  { kind = "expense", currency = "EUR" }: { kind?: PlannedItemKind; currency?: string } = {},
) => parse(formOf(fields), { ...TARGET, kind, currency }, translateKey);

describe("readOccurrenceTarget", () => {
  it("reads the item id and the nominal date", () => {
    expect(readOccurrenceTarget(formOf({ itemId: "7", nominalDate: "2026-03-05" }))).toEqual({
      ok: true,
      target: TARGET,
    });
  });

  it.each(["", "0", "-3", "1.5", "abc", "7abc", "1e3", "99999999999999999999"])(
    "refuses the item id %j",
    (itemId) => {
      expect(readOccurrenceTarget(formOf({ itemId, nominalDate: "2026-03-05" }))).toEqual({
        ok: false,
        ref: { key: "plannedItemGone" },
      });
    },
  );

  it("refuses a missing item id", () => {
    expect(readOccurrenceTarget(formOf({ nominalDate: "2026-03-05" }))).toMatchObject({ ok: false });
  });

  it.each(["", "2026-02-30", "2026-3-5", "05/03/2026", "garbage"])(
    "refuses the nominal date %j",
    (nominalDate) => {
      expect(readOccurrenceTarget(formOf({ itemId: "7", nominalDate }))).toEqual({
        ok: false,
        ref: { key: "plannedItemDateInvalid", values: { date: nominalDate } },
      });
    },
  );

  it("refuses a nominal date sent as a file instead of text", () => {
    const formData = formOf({ itemId: "7" });
    formData.set("nominalDate", new Blob(["2026-03-05"]));

    expect(readOccurrenceTarget(formData)).toMatchObject({ ok: false });
  });
});

describe("parseOccurrenceOverrideForm", () => {
  it("moves the occurrence to a new date and keeps the computed amount", () => {
    expect(parseOccurrenceOverrideForm({ intent: "save", overrideDate: "2026-03-09", overrideAmount: "" })).toEqual({
      ok: true,
      input: { nominalDate: "2026-03-05", status: "modified", overrideDate: "2026-03-09", overrideAmount: null },
    });
  });

  it("signs a new amount with the kind of the item: an expense leaves the account", () => {
    expect(parseOccurrenceOverrideForm({ intent: "save", overrideDate: "", overrideAmount: "1250,50" })).toEqual({
      ok: true,
      input: { nominalDate: "2026-03-05", status: "modified", overrideDate: null, overrideAmount: -125_050 },
    });
  });

  it("keeps an income amount positive", () => {
    expect(
      parseOccurrenceOverrideForm({ intent: "save", overrideAmount: "2000" }, { kind: "income" }),
    ).toMatchObject({ ok: true, input: { overrideAmount: 200_000 } });
  });

  it("scales the amount with the currency of the item", () => {
    expect(
      parseOccurrenceOverrideForm({ intent: "save", overrideAmount: "1500" }, { currency: "JPY" }),
    ).toMatchObject({ ok: true, input: { overrideAmount: -1_500 } });
  });

  it("changes the date and the amount together", () => {
    expect(
      parseOccurrenceOverrideForm({ intent: "save", overrideDate: "2026-03-09", overrideAmount: "12" }),
    ).toMatchObject({ ok: true, input: { overrideDate: "2026-03-09", overrideAmount: -1_200 } });
  });

  it("skips the occurrence, whatever the fields hold", () => {
    expect(
      parseOccurrenceOverrideForm({ intent: "skip", overrideDate: "not a date", overrideAmount: "abc" }),
    ).toEqual({
      ok: true,
      input: { nominalDate: "2026-03-05", status: "cancelled", overrideDate: null, overrideAmount: null },
    });
  });

  it("leaves both fields empty for the domain to refuse", () => {
    expect(parseOccurrenceOverrideForm({ intent: "save", overrideDate: "  ", overrideAmount: " " })).toEqual({
      ok: true,
      input: { nominalDate: "2026-03-05", status: "modified", overrideDate: null, overrideAmount: null },
    });
  });

  it("reads missing fields as empty", () => {
    expect(parseOccurrenceOverrideForm({ intent: "save" })).toMatchObject({
      ok: true,
      input: { overrideDate: null, overrideAmount: null },
    });
  });

  it("sends a zero amount on instead of reading it as empty", () => {
    expect(parseOccurrenceOverrideForm({ intent: "save", overrideAmount: "0" })).toMatchObject({
      ok: true,
      input: { overrideAmount: 0 },
    });
  });

  it("refuses an invalid date on its field and keeps what was typed", () => {
    expect(
      parseOccurrenceOverrideForm({ intent: "save", overrideDate: "2026-02-30", overrideAmount: "12" }),
    ).toEqual({
      ok: false,
      error: {
        field: "overrideDate",
        message: "plannedItemDateInvalid",
        values: { overrideDate: "2026-02-30", overrideAmount: "12" },
      },
    });
  });

  it("refuses a signed amount: the kind gives the direction", () => {
    expect(parseOccurrenceOverrideForm({ intent: "save", overrideAmount: "-12" })).toEqual({
      ok: false,
      error: {
        field: "overrideAmount",
        message: "amountUnsigned",
        values: { overrideDate: "", overrideAmount: "-12" },
      },
    });
  });

  it("refuses an amount it cannot read and keeps what was typed", () => {
    expect(
      parseOccurrenceOverrideForm({ intent: "save", overrideDate: "2026-03-09", overrideAmount: "12,345" }),
    ).toMatchObject({
      ok: false,
      error: { field: "overrideAmount", values: { overrideDate: "2026-03-09", overrideAmount: "12,345" } },
    });
  });

  it.each<Record<string, string>>([{}, { intent: "" }, { intent: "delete" }])("refuses the intent %j", (fields) => {
    expect(parseOccurrenceOverrideForm({ ...fields, overrideDate: "2026-03-09" })).toEqual({
      ok: false,
      error: { message: "nothingSaved", values: { overrideDate: "2026-03-09", overrideAmount: "" } },
    });
  });
});
