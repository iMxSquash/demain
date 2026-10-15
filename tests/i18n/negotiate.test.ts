import { describe, expect, it } from "vitest";

import { negotiateLocale } from "../../src/i18n/negotiate";

const SUPPORTED = ["en", "fr"];

describe("negotiateLocale", () => {
  it("prefers the explicit choice kept in the cookie", () => {
    expect(
      negotiateLocale({ cookie: "fr", acceptLanguage: "en-US,en;q=0.9" }, SUPPORTED),
    ).toBe("fr");
  });

  it("ignores a cookie that names an unsupported language", () => {
    expect(
      negotiateLocale({ cookie: "de", acceptLanguage: "fr" }, SUPPORTED),
    ).toBe("fr");
  });

  it("follows the order of quality of the browser preferences", () => {
    expect(
      negotiateLocale(
        { cookie: undefined, acceptLanguage: "de;q=0.9, fr;q=0.8, en;q=0.7" },
        SUPPORTED,
      ),
    ).toBe("fr");
  });

  it("falls back from a regional tag to its language", () => {
    expect(
      negotiateLocale({ cookie: undefined, acceptLanguage: "fr-CH" }, SUPPORTED),
    ).toBe("fr");
  });

  it("matches tags regardless of case", () => {
    expect(
      negotiateLocale({ cookie: "FR", acceptLanguage: null }, SUPPORTED),
    ).toBe("fr");
  });

  it("uses the default language when nothing matches", () => {
    expect(
      negotiateLocale({ cookie: undefined, acceptLanguage: "de, ja" }, SUPPORTED),
    ).toBe("en");
    expect(
      negotiateLocale({ cookie: undefined, acceptLanguage: null }, SUPPORTED),
    ).toBe("en");
  });

  it("skips malformed or refused entries of the header", () => {
    expect(
      negotiateLocale(
        { cookie: undefined, acceptLanguage: "*, fr;q=0, en;q=abc, fr-FR;q=0.4" },
        SUPPORTED,
      ),
    ).toBe("fr");
  });
});
