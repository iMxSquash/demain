import { describe, expect, it } from "vitest";

import { isThemePreference, themeAttribute } from "../theme-preference";

describe("isThemePreference", () => {
  it("accepts the three preferences", () => {
    expect(["system", "light", "dark"].every(isThemePreference)).toBe(true);
  });

  it("rejects anything else a client could post", () => {
    expect([null, "", "Dark", "auto", 1].some(isThemePreference)).toBe(false);
  });
});

describe("themeAttribute", () => {
  it("forces the chosen theme", () => {
    expect(themeAttribute("light")).toBe("light");
    expect(themeAttribute("dark")).toBe("dark");
  });

  it("leaves the system setting, a missing cookie and a tampered one to the device", () => {
    expect([themeAttribute("system"), themeAttribute(undefined), themeAttribute("x")]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});
