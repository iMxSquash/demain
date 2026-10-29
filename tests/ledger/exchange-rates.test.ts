import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExchangeRateValidationError } from "../../src/domain/exchange-rate";
import { createAccount } from "../../src/ledger/accounts";
import {
  deleteExchangeRate,
  EcbFetchDisabledError,
  fetchEcbRates,
  getReferenceCurrency,
  listExchangeRates,
  saveExchangeRate,
  setEcbFetchEnabled,
  setReferenceCurrency,
} from "../../src/ledger/exchange-rates";
import { getMonthlySynthesis } from "../../src/ledger/synthesis";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";

describe("exchange rates", () => {
  let dataDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe("reference currency", () => {
    it("is EUR until the owner chooses another one", () => {
      expect(getReferenceCurrency(db)).toBe("EUR");
    });

    it("keeps the currency the owner chose", () => {
      setReferenceCurrency(db, "USD");
      setReferenceCurrency(db, "CHF");

      expect(getReferenceCurrency(db)).toBe("CHF");
    });

    it("refuses a code that is not an ISO 4217 currency", () => {
      expect(() => setReferenceCurrency(db, "XYZ1")).toThrow(
        ExchangeRateValidationError,
      );
      expect(getReferenceCurrency(db)).toBe("EUR");
    });
  });

  describe("manual rates", () => {
    it("stores a typed rate as a scaled integer and lists it", () => {
      const saved = saveExchangeRate(db, {
        date: "2026-03-01",
        base: "EUR",
        quote: "USD",
        rate: "1,0821",
      });

      expect(saved).toEqual({
        id: expect.any(Number),
        date: "2026-03-01",
        base: "EUR",
        quote: "USD",
        rate: 108_210_000,
        source: "manual",
      });
      expect(listExchangeRates(db)).toEqual([saved]);
    });

    it("replaces the rate of the same pair and day instead of adding one", () => {
      saveExchangeRate(db, { date: "2026-03-01", base: "EUR", quote: "USD", rate: "1.08" });
      saveExchangeRate(db, { date: "2026-03-01", base: "EUR", quote: "USD", rate: "1.09" });
      saveExchangeRate(db, { date: "2026-03-02", base: "EUR", quote: "USD", rate: "1.10" });

      expect(listExchangeRates(db).map((r) => [r.date, r.rate])).toEqual([
        ["2026-03-01", 109_000_000],
        ["2026-03-02", 110_000_000],
      ]);
    });

    it.each([
      ["a date that does not exist", { date: "2026-02-30" }, "date"],
      ["an unknown base currency", { base: "XXL" }, "base"],
      ["an unknown quote currency", { quote: "eur1" }, "quote"],
      ["the same currency on both sides", { quote: "EUR" }, "quote"],
      ["a rate of zero", { rate: "0" }, "rate"],
      ["a rate that is not a number", { rate: "one" }, "rate"],
    ])("refuses %s", (_, override, field) => {
      const input = {
        date: "2026-03-01",
        base: "EUR",
        quote: "USD",
        rate: "1.08",
        ...override,
      };

      expect(() => saveExchangeRate(db, input)).toThrow(
        expect.objectContaining({ name: "ExchangeRateValidationError", field }),
      );
      expect(listExchangeRates(db)).toEqual([]);
    });

    it("deletes a rate that was entered by mistake", () => {
      const mistaken = saveExchangeRate(db, {
        date: "2026-03-01",
        base: "EUR",
        quote: "USD",
        rate: "1.08",
      });

      deleteExchangeRate(db, mistaken.id);

      expect(listExchangeRates(db)).toEqual([]);
    });
  });

  describe("totals", () => {
    it("converts an account in a second currency with the stored rate", () => {
      createAccount(db, {
        name: "Checking",
        kind: "checking",
        currency: "EUR",
        openingDate: "2026-01-01",
        openingBalance: 100_000,
      });
      createAccount(db, {
        name: "Dollars",
        kind: "other",
        currency: "USD",
        openingDate: "2026-01-01",
        openingBalance: 11_000,
      });
      saveExchangeRate(db, { date: "2026-01-15", base: "EUR", quote: "USD", rate: "1.1" });

      const [january] = getMonthlySynthesis(db, {
        referenceCurrency: "EUR",
        throughMonth: "2026-01",
      });

      // 110.00 USD at 1.1 is 100.00 EUR.
      expect(january).toMatchObject({ total: 110_000, unconvertedCurrencies: [] });
    });
  });

  describe("ECB fetch", () => {
    const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time='2026-03-02'>
      <Cube currency='USD' rate='1.0821'/>
      <Cube currency='JPY' rate='160.5'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

    it("makes no call while the owner has not enabled it", async () => {
      const fetchSpy = vi.fn();

      await expect(fetchEcbRates(db, fetchSpy)).rejects.toThrow(
        EcbFetchDisabledError,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("stores the published rates once enabled, from the ECB endpoint only", async () => {
      setEcbFetchEnabled(db, true);
      const fetchSpy = vi.fn<typeof fetch>(async () => new Response(ECB_XML));

      const stored = await fetchEcbRates(db, fetchSpy);

      expect(stored).toBe(2);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]?.[0]).toBe(
        "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
      );
      expect(
        listExchangeRates(db).map((r) => [r.base, r.quote, r.date, r.rate, r.source]),
      ).toEqual([
        ["EUR", "JPY", "2026-03-02", 16_050_000_000, "ecb"],
        ["EUR", "USD", "2026-03-02", 108_210_000, "ecb"],
      ]);
    });

    it("keeps a rate the owner typed for the same day", async () => {
      setEcbFetchEnabled(db, true);
      saveExchangeRate(db, { date: "2026-03-02", base: "EUR", quote: "USD", rate: "1.5" });

      await fetchEcbRates(db, async () => new Response(ECB_XML));

      expect(
        listExchangeRates(db).find((r) => r.quote === "USD"),
      ).toMatchObject({ rate: 150_000_000, source: "manual" });
    });

    it("stores nothing when the feed holds an invalid rate", async () => {
      setEcbFetchEnabled(db, true);
      const broken = ECB_XML.replace("rate='160.5'", "rate='n/a'");

      await expect(
        fetchEcbRates(db, async () => new Response(broken)),
      ).rejects.toThrow(ExchangeRateValidationError);
      expect(listExchangeRates(db)).toEqual([]);
    });

    it.each([
      ["an error status", () => Promise.resolve(new Response("oops", { status: 503 }))],
      ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
      ["a feed without rates", () => Promise.resolve(new Response("<html></html>"))],
    ])("reports %s without storing anything", async (_, answer) => {
      setEcbFetchEnabled(db, true);

      await expect(fetchEcbRates(db, answer)).rejects.toThrow();
      expect(listExchangeRates(db)).toEqual([]);
    });
  });
});
