import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TransactionValidationError } from "../../src/domain/transaction";
import {
  getDefaultPaymentMode,
  setDefaultPaymentMode,
} from "../../src/ledger/default-payment-mode";
import {
  type AppDatabase,
  migrateDatabase,
  openDatabase,
} from "../../src/storage/database";
import { settings } from "../../src/storage/schema";

describe("default payment mode", () => {
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

  it("is card when nothing is stored", () => {
    expect(getDefaultPaymentMode(db)).toBe("card");
  });

  it("reads back a saved mode", () => {
    setDefaultPaymentMode(db, "transfer");
    setDefaultPaymentMode(db, "direct_debit");

    expect(getDefaultPaymentMode(db)).toBe("direct_debit");
  });

  it("falls back to card when the stored value is unknown", () => {
    db.insert(settings)
      .values({ key: "default_payment_mode", value: "cheque" })
      .run();

    expect(getDefaultPaymentMode(db)).toBe("card");
  });

  it("refuses an invalid value on save", () => {
    setDefaultPaymentMode(db, "transfer");

    for (const invalid of ["cheque", 42, null]) {
      expect(() => setDefaultPaymentMode(db, invalid)).toThrow(
        expect.objectContaining({
          name: TransactionValidationError.name,
          ref: expect.objectContaining({ key: "transactionPaymentModeUnknown" }),
        }),
      );
    }
    expect(getDefaultPaymentMode(db)).toBe("transfer");
  });
});
