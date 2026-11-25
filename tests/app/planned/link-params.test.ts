import { describe, expect, it } from "vitest";

import {
  calendarHref,
  linkHref,
  parseBackView,
  parseLinkFilters,
  parseOccurrenceRef,
  shownBound,
} from "../../../src/app/planned/link-params";

describe("the parameters of the Link a transaction page", () => {
  it("names the occurrence with its item and its nominal date", () => {
    expect(parseOccurrenceRef("12", "2026-11-20")).toEqual({ plannedItemId: 12, nominalDate: "2026-11-20" });
    expect(linkHref({ plannedItemId: 12, nominalDate: "2026-11-20" }, "lines")).toBe(
      "/planned/link?item=12&date=2026-11-20&back=lines",
    );
  });

  it.each([
    ["0", "2026-11-20"],
    ["1.5", "2026-11-20"],
    ["abc", "2026-11-20"],
    ["12", "2026-02-30"],
    [undefined, "2026-11-20"],
  ])("refuses the item %j on %j", (item, date) => {
    expect(parseOccurrenceRef(item, date)).toBeNull();
  });

  it("goes back to the line view only when it is named, in the month of the occurrence", () => {
    expect(calendarHref(parseBackView("lines"), "2026-11")).toBe("/calendar/lines?month=2026-11");
    expect(calendarHref(parseBackView("anything"), "2026-11")).toBe("/calendar?month=2026-11");
  });

  it("leaves an absent or invalid bound to the window of the occurrence", () => {
    expect(parseLinkFilters({})).toEqual({ search: "", range: {} });
    expect(parseLinkFilters({ from: "2026-13-01", to: "2026-11-30", q: " pharm " })).toEqual({
      search: "pharm",
      range: { to: "2026-11-30" },
    });
  });

  it("opens a bound the user cleared, and shows it empty", () => {
    const { range } = parseLinkFilters({ from: "", to: "" });

    expect(range.from! < "1900-01-01" && range.to! > "2999-12-31").toBe(true);
    expect([shownBound(range.from!), shownBound(range.to!), shownBound("2026-11-20")]).toEqual(["", "", "2026-11-20"]);
  });
});
