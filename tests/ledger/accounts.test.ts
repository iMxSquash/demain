import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import {
  archiveAccount,
  createAccount,
  listAccounts,
  updateAccount,
} from "../../src/ledger/accounts";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";
import { accounts } from "../../src/storage/schema";

const CHECKING_INPUT = {
  name: "Checking",
  kind: "checking",
  currency: "EUR",
  openingDate: "2026-01-01",
  openingBalance: 5627,
};

describe("accounts", () => {
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

  it("creates an account and lists it", () => {
    const created = createAccount(db, CHECKING_INPUT);

    expect(created).toEqual({
      ...CHECKING_INPUT,
      id: expect.any(Number),
      archived: false,
      depositCeiling: null,
      overflowAccountId: null,
    });
    expect(listAccounts(db)).toEqual([created]);
  });

  it("hides an archived account from the default list but keeps it for history", () => {
    const checking = createAccount(db, CHECKING_INPUT);
    const livretA = createAccount(db, {
      ...CHECKING_INPUT,
      name: "Livret A",
      kind: "savings",
      openingBalance: 0,
    });

    archiveAccount(db, livretA.id);

    expect(listAccounts(db)).toEqual([checking]);
    expect(listAccounts(db, { includeArchived: true })).toEqual([
      checking,
      { ...livretA, archived: true },
    ]);
  });

  it("updates the fields of an account", () => {
    const created = createAccount(db, CHECKING_INPUT);

    const updated = updateAccount(db, created.id, {
      ...CHECKING_INPUT,
      name: "Main checking",
      openingBalance: 6000,
    });

    expect(updated).toEqual({
      ...created,
      name: "Main checking",
      openingBalance: 6000,
    });
    expect(listAccounts(db)).toEqual([updated]);
  });

  it("refuses an invalid update and leaves the account unchanged", () => {
    const created = createAccount(db, CHECKING_INPUT);

    expect(() =>
      updateAccount(db, created.id, { ...CHECKING_INPUT, name: " " }),
    ).toThrow(expect.objectContaining({ field: "name" }));
    expect(listAccounts(db)).toEqual([created]);
  });

  it("reports an unknown account instead of silently doing nothing", () => {
    expect(() => updateAccount(db, 999, CHECKING_INPUT)).toThrow(
      expect.objectContaining({ name: "AccountNotFoundError" }),
    );
    expect(() => archiveAccount(db, 999)).toThrow(
      expect.objectContaining({ name: "AccountNotFoundError" }),
    );
  });

  describe("overflow accounts", () => {
    const SAVINGS_INPUT = { ...CHECKING_INPUT, kind: "savings", openingBalance: 0 };

    it("stores a deposit ceiling and an overflow account", () => {
      const livretA = createAccount(db, { ...SAVINGS_INPUT, name: "Livret A" });

      const livretJeune = createAccount(db, {
        ...SAVINGS_INPUT,
        name: "Livret Jeune",
        depositCeiling: 160_000,
        overflowAccountId: livretA.id,
      });

      expect(livretJeune).toMatchObject({
        depositCeiling: 160_000,
        overflowAccountId: livretA.id,
      });
    });

    it("refuses an overflow account in another currency", () => {
      const usd = createAccount(db, { ...SAVINGS_INPUT, currency: "USD" });

      expect(() =>
        createAccount(db, { ...SAVINGS_INPUT, overflowAccountId: usd.id }),
      ).toThrow(expect.objectContaining({ field: "overflowAccountId" }));
      expect(listAccounts(db)).toEqual([usd]);
    });

    it("refuses an archived overflow account", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      archiveAccount(db, livretA.id);

      expect(() =>
        createAccount(db, { ...SAVINGS_INPUT, overflowAccountId: livretA.id }),
      ).toThrow(expect.objectContaining({ field: "overflowAccountId" }));
    });

    it("refuses an update that would close a loop", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      const livretJeune = createAccount(db, {
        ...SAVINGS_INPUT,
        overflowAccountId: livretA.id,
      });

      expect(() =>
        updateAccount(db, livretA.id, {
          ...SAVINGS_INPUT,
          overflowAccountId: livretJeune.id,
        }),
      ).toThrow(expect.objectContaining({ field: "overflowAccountId" }));
      expect(listAccounts(db)[0]?.overflowAccountId).toBeNull();
    });

    it("lets an account clear its overflow account", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      const livretJeune = createAccount(db, {
        ...SAVINGS_INPUT,
        overflowAccountId: livretA.id,
      });

      const updated = updateAccount(db, livretJeune.id, {
        ...SAVINGS_INPUT,
        overflowAccountId: null,
      });

      expect(updated.overflowAccountId).toBeNull();
    });

    it("refuses to archive an account used as an overflow account", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      createAccount(db, { ...SAVINGS_INPUT, overflowAccountId: livretA.id });

      expect(() => archiveAccount(db, livretA.id)).toThrow(
        expect.objectContaining({ name: "AccountInUseError" }),
      );
      expect(listAccounts(db)).toHaveLength(2);
    });

    it("archives an account once its referrer no longer points to it", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      const livretJeune = createAccount(db, {
        ...SAVINGS_INPUT,
        overflowAccountId: livretA.id,
      });
      updateAccount(db, livretJeune.id, SAVINGS_INPUT);

      archiveAccount(db, livretA.id);

      expect(listAccounts(db).map((account) => account.id)).toEqual([livretJeune.id]);
    });

    it("makes the database itself refuse to delete a referenced account", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      createAccount(db, { ...SAVINGS_INPUT, overflowAccountId: livretA.id });

      expect(() =>
        db.delete(accounts).where(eq(accounts.id, livretA.id)).run(),
      ).toThrow();
      expect(listAccounts(db)).toHaveLength(2);
    });

    it("refuses a currency change that would break a referrer's overflow link", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      createAccount(db, { ...SAVINGS_INPUT, overflowAccountId: livretA.id });

      expect(() =>
        updateAccount(db, livretA.id, { ...SAVINGS_INPUT, currency: "USD" }),
      ).toThrow(expect.objectContaining({ field: "currency" }));
      expect(listAccounts(db)[0]?.currency).toBe("EUR");
    });

    it("lets an archived referrer release its overflow account", () => {
      const livretA = createAccount(db, SAVINGS_INPUT);
      const livretJeune = createAccount(db, {
        ...SAVINGS_INPUT,
        overflowAccountId: livretA.id,
      });
      archiveAccount(db, livretJeune.id);

      expect(() => archiveAccount(db, livretA.id)).not.toThrow();
    });
  });
});
