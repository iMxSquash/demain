import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AccountValidationError, type AccountInput } from "../../src/domain/account";
import { createAccount, getAccount } from "../../src/ledger/accounts";
import {
  createOverflowCandidate,
  setImportOverflowAccount,
} from "../../src/ledger/import-overflow";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";

const BASE: AccountInput = {
  name: "Account",
  kind: "savings",
  currency: "EUR",
  openingDate: "2026-01-01",
  openingBalance: 0,
};

describe("import overflow account", () => {
  let dataDir: string;
  let db: AppDatabase;
  let checkingId: number;
  let capped: number;

  const make = (overrides: Partial<AccountInput>) => createAccount(db, { ...BASE, ...overrides });
  const refusal = (action: () => unknown): AccountValidationError => {
    try {
      action();
    } catch (error) {
      if (error instanceof AccountValidationError) return error;
      throw error;
    }
    throw new Error("Expected a refusal");
  };

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    checkingId = make({ name: "Checking", kind: "checking" }).id;
    capped = make({ name: "Capped", depositCeiling: 160_000 }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const choose = (overflowAccountId: number, accountId = capped) =>
    setImportOverflowAccount(db, { receivingAccountId: checkingId, accountId, overflowAccountId });

  it("makes the chosen account the overflow account for good, keeping the other fields", () => {
    const next = make({ name: "Next" });

    choose(next.id);

    expect(getAccount(db, capped)).toMatchObject({
      name: "Capped",
      depositCeiling: 160_000,
      overflowAccountId: next.id,
    });
  });

  it("refuses an account of another currency", () => {
    const dollars = make({ name: "Dollars", currency: "USD" });

    expect(refusal(() => choose(dollars.id)).ref.key).toBe("overflowAccountCurrencyMismatch");
    expect(getAccount(db, capped).overflowAccountId).toBeNull();
  });

  it("refuses an account whose chain comes back to the savings account", () => {
    const loop = make({ name: "Loop", overflowAccountId: capped });

    expect(refusal(() => choose(loop.id)).ref.key).toBe("overflowChainLoop");
  });

  it("refuses an archived account", () => {
    const archived = make({ name: "Archived" });
    db.$client.prepare("update accounts set archived = 1 where id = ?").run(archived.id);

    expect(refusal(() => choose(archived.id)).ref.key).toBe("overflowAccountArchived");
  });

  it("refuses the account that receives the file: the surplus would move to itself", () => {
    expect(refusal(() => choose(checkingId)).ref.key).toBe("importOverflowIsReceiving");
  });

  it("refuses to replace an overflow account that is already defined", () => {
    const first = make({ name: "First" });
    const second = make({ name: "Second" });
    choose(first.id);

    expect(refusal(() => choose(second.id)).ref.key).toBe("importOverflowAlreadySet");
    expect(getAccount(db, capped).overflowAccountId).toBe(first.id);
  });

  it("creates a savings account in the currency of the account it will receive from", () => {
    const dollars = make({ name: "Dollars", currency: "USD", depositCeiling: 1_000 });

    const created = createOverflowCandidate(db, {
      likeAccountId: dollars.id,
      name: "  Overflow  ",
      openingDate: "2026-03-01",
    });

    expect(created).toMatchObject({
      name: "Overflow",
      kind: "savings",
      currency: "USD",
      openingBalance: 0,
      depositCeiling: null,
      overflowAccountId: null,
    });
  });

  it("refuses a new account without a name", () => {
    expect(
      refusal(() => createOverflowCandidate(db, { likeAccountId: capped, name: " ", openingDate: "2026-03-01" })).ref.key,
    ).toBe("accountNameRequired");
  });
});
