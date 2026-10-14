import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

    expect(created).toEqual({ ...CHECKING_INPUT, id: expect.any(Number), archived: false });
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
});
