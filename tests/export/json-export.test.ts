import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { setupOwner } from "../../src/auth/owner";
import { decryptPayload } from "../../src/export/envelope";
import { exportSchema } from "../../src/export/export-schema";
import { createJsonExport } from "../../src/export/json-export";
import { createAccount } from "../../src/ledger/accounts";
import { createCategory } from "../../src/ledger/categories";
import { commitImport } from "../../src/ledger/imports";
import { createTransaction, createTransfer } from "../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";
import { balanceAssertions, exchangeRates, settings } from "../../src/storage/schema";

const NOW = new Date("2026-10-30T09:15:00.000Z");
const PASSWORD = "a long enough backup passphrase";
const SCHEMA_FILE = path.join(process.cwd(), "docs", "export.schema.json");

describe("JSON export", () => {
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

  async function exportAsObject(): Promise<unknown> {
    return JSON.parse((await createJsonExport(db, NOW)).toString("utf8"));
  }

  function seed() {
    const checking = createAccount(db, {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 5_627,
    });
    const savings = createAccount(db, {
      name: "Savings",
      kind: "savings",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 100_000,
    });
    const travel = createAccount(db, {
      name: "Travel",
      kind: "savings",
      currency: "USD",
      openingDate: "2026-01-01",
      openingBalance: 50_000,
      depositCeiling: 2_000_000,
    });
    const groceries = createCategory(db, { name: "Groceries" });
    createTransaction(db, {
      accountId: checking.id,
      date: "2026-02-03",
      amount: -1_234,
      kind: "expense",
      label: "Market",
      categoryId: groceries.id,
    });
    createTransfer(db, {
      sourceId: checking.id,
      destinationId: savings.id,
      date: "2026-02-05",
      amount: 5_000,
      label: "Monthly saving",
    });
    db.insert(balanceAssertions)
      .values({ accountId: checking.id, date: "2026-02-28", amount: 9_876, note: "from the app" })
      .run();
    db.insert(exchangeRates)
      .values({ date: "2026-02-01", base: "EUR", quote: "USD", rate: 108_000_000, source: "manual" })
      .run();
    db.insert(settings).values({ key: "reference_currency", value: "EUR" }).run();
    return { checking, travel };
  }

  it("is valid against the documented schema", async () => {
    seed();

    const parsed = exportSchema.safeParse(await exportAsObject());

    expect(parsed.success).toBe(true);
  });

  it("is valid when the instance holds nothing", async () => {
    expect(exportSchema.safeParse(await exportAsObject()).success).toBe(true);
  });

  it("is described by the schema file published in the documentation", () => {
    const published: unknown = JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));

    // On a mismatch, regenerate the file (see docs/BACKUPS.md, "Regenerating the schema").
    expect(published).toEqual(z.toJSONSchema(exportSchema));
  });

  it("states its format, its version and when it was made", async () => {
    expect(await exportAsObject()).toMatchObject({
      format: "demain-export",
      schemaVersion: 1,
      exportedAt: "2026-10-30T09:15:00.000Z",
    });
  });

  it("writes every amount as integer minor units next to its currency code", async () => {
    const { checking, travel } = seed();

    const exported = exportSchema.parse(await exportAsObject());

    expect(exported.accounts.find((a) => a.id === checking.id)?.openingBalance).toEqual({
      minorUnits: 5_627,
      currency: "EUR",
    });
    expect(exported.accounts.find((a) => a.id === travel.id)?.depositCeiling).toEqual({
      minorUnits: 2_000_000,
      currency: "USD",
    });
    expect(exported.transactions.find((t) => t.label === "Market")?.amount).toEqual({
      minorUnits: -1_234,
      currency: "EUR",
    });
    expect(exported.balanceAssertions[0]?.amount).toEqual({ minorUnits: 9_876, currency: "EUR" });
  });

  it("keeps the two legs of a transfer linked to each other", async () => {
    seed();

    const { transactions } = exportSchema.parse(await exportAsObject());

    const legs = transactions.filter((t) => t.kind === "transfer");
    expect(legs).toHaveLength(2);
    expect(legs[0]?.transferCounterpartId).toBe(legs[1]?.id);
    expect(legs[1]?.transferCounterpartId).toBe(legs[0]?.id);
  });

  it("keeps exchange rates as exact scaled integers", async () => {
    seed();

    const { exchangeRates: rates } = exportSchema.parse(await exportAsObject());

    expect(rates).toEqual([
      expect.objectContaining({ base: "EUR", quote: "USD", rate: 108_000_000, source: "manual" }),
    ]);
  });

  it("does not carry the credentials of the account", async () => {
    seed();
    await setupOwner(db, {
      providedToken: "setup-token-of-at-least-thirty-two-characters",
      expectedToken: "setup-token-of-at-least-thirty-two-characters",
      password: "the owner password",
      now: NOW,
    });
    db.$client.exec(
      "update owner set totp_secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', backup_code_hashes = '[\"abc123hash\"]'",
    );
    db.$client.exec(
      "insert into sessions (id, created_at, last_seen_at, expires_at) values ('session-hash-value', 'x', 'x', 'x')",
    );

    const text = (await createJsonExport(db, NOW)).toString("utf8");

    for (const secret of ["$argon2id", "JBSWY3DPEHPK3PXP", "abc123hash", "session-hash-value"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("exports an import batch without its content digest", async () => {
    const account = createAccount(db, {
      name: "Checking",
      kind: "checking",
      currency: "EUR",
      openingDate: "2026-01-01",
      openingBalance: 0,
    });
    commitImport(db, {
      accountId: account.id,
      rows: [{ date: "2026-03-10", amount: -1_000, label: "A", externalId: null }],
      format: "csv",
      fileName: "march.csv",
      mapping: null,
      now: NOW,
    });

    const text = (await createJsonExport(db, NOW)).toString("utf8");

    expect(exportSchema.safeParse(JSON.parse(text)).success).toBe(true);
    expect(text).not.toContain("contentDigest");
  });

  it("is plain readable JSON when no password is given", async () => {
    seed();

    const file = await createJsonExport(db, NOW);

    expect(file.toString("utf8")).toContain('"Checking"');
  });

  it("can be encrypted with a password", async () => {
    seed();
    const plain = await createJsonExport(db, NOW);

    const encrypted = await createJsonExport(db, NOW, PASSWORD);
    const decrypted = await decryptPayload(encrypted, PASSWORD, "json-export");

    expect(encrypted.includes(Buffer.from("Checking"))).toBe(false);
    expect(decrypted.equals(plain)).toBe(true);
  });
});
