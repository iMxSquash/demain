import { createHash } from "node:crypto";

import type { EnteredTransactionKind } from "./transaction";

/** The fields of a transaction that an undo must find unchanged. */
export interface DigestRow {
  id: number;
  accountId: number;
  date: string;
  amount: number;
  kind: EnteredTransactionKind | "transfer";
  label: string;
  description?: string | null;
  paymentMode?: string | null;
  categoryId?: number | null;
  transferCounterpartId?: number | null;
}

// JSON quotes and escapes every text, so no value can run into the next one.
// null and undefined get a spelling that no JSON value has.
function encode(value: string | number | null | undefined): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

function encodeRow(row: DigestRow): string {
  return [
    row.id,
    row.accountId,
    row.date,
    row.amount,
    row.kind,
    row.label,
    row.description,
    row.paymentMode,
    row.categoryId,
    row.transferCounterpartId,
  ]
    .map(encode)
    .join(",");
}

/**
 * SHA-256 (hexadecimal) of the transactions of a batch, in order of id. The
 * same content always gives the same digest, whatever the order of the rows.
 */
export function digestBatchTransactions(rows: readonly DigestRow[]): string {
  const text = [...rows]
    .sort((a, b) => a.id - b.id)
    .map(encodeRow)
    .join("\n");
  return createHash("sha256").update(text).digest("hex");
}
