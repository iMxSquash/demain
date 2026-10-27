/**
 * Roles of the columns of a CSV file, found from the values they hold. Pure
 * functions: no database, no clock. Whatever cannot be settled is reported,
 * never dropped: the user decides.
 */

import { normalizeHeader } from "./import-csv";
import type { PaymentMode } from "./transaction";

export type MovementType = "expense" | "income" | "savings";

// Normalized spellings (see `normalizeHeader`) of the types a spreadsheet may name.
// A Map, not an object: cell text comes from the file and must not reach Object.prototype.
const MOVEMENT_TYPE_NAMES: ReadonlyMap<string, MovementType> = new Map([
  ["expense", "expense"],
  ["expenses", "expense"],
  ["depense", "expense"],
  ["depenses", "expense"],
  ["income", "income"],
  ["incomes", "income"],
  ["revenu", "income"],
  ["revenus", "income"],
  ["savings", "savings"],
  ["saving", "savings"],
  ["epargne", "savings"],
]);

/** The movement type a cell names, in English or French; null for any other text. */
export function readMovementType(text: string): MovementType | null {
  return MOVEMENT_TYPE_NAMES.get(normalizeHeader(text)) ?? null;
}

/** A cell text the vocabulary does not know, with every line of the file where it appears. */
export interface UnrecognizedValue {
  value: string;
  lines: number[];
}

export interface VocabularyColumn {
  /** 0-based. */
  column: number;
  /** Shown to the user, who maps each one: none is dropped silently. */
  unrecognized: UnrecognizedValue[];
  /** Other columns that also hold known cells: set aside, so they are reported. */
  alsoMatching: number[];
}

/**
 * The first column (0-based) where most non-empty cells are known to `read`.
 * The other cells are reported, since they are in the same column but unknown.
 * `rows` are the data rows (no header) and `firstLine` is the line of the
 * first one in the file. Null when no column has a majority of known cells.
 */
function detectVocabularyColumn(
  rows: readonly (readonly string[])[],
  firstLine: number,
  read: (text: string) => unknown,
): VocabularyColumn | null {
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  const matches: Omit<VocabularyColumn, "alsoMatching">[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    const cells = rows
      .map((row, index) => ({
        text: (row[column] ?? "").trim(),
        line: firstLine + index,
      }))
      .filter((cell) => cell.text !== "");
    const unknown = cells.filter((cell) => read(cell.text) === null);
    if (cells.length - unknown.length <= unknown.length) continue;

    // Spellings that differ only by case or accents are one value to map.
    const byValue = new Map<string, UnrecognizedValue>();
    for (const { text, line } of unknown) {
      const key = normalizeHeader(text);
      const known = byValue.get(key);
      if (known === undefined) byValue.set(key, { value: text, lines: [line] });
      else known.lines.push(line);
    }
    matches.push({ column, unrecognized: [...byValue.values()] });
  }

  const [first, ...others] = matches;
  if (first === undefined) return null;
  return { ...first, alsoMatching: others.map((match) => match.column) };
}

/** The column that names the movement types, with the names it does not know. */
export function detectTypeColumn(
  rows: readonly (readonly string[])[],
  firstLine: number,
): VocabularyColumn | null {
  return detectVocabularyColumn(rows, firstLine, readMovementType);
}

// Same rules as the movement types: normalized spellings, in a Map.
const PAYMENT_MODE_NAMES: ReadonlyMap<string, PaymentMode> = new Map([
  ["card", "card"],
  ["carte", "card"],
  ["transfer", "transfer"],
  ["virement", "transfer"],
  ["directdebit", "direct_debit"],
  ["prelevement", "direct_debit"],
]);

/** The payment mode a cell names, in English or French; null for any other text. */
export function readPaymentMode(text: string): PaymentMode | null {
  return PAYMENT_MODE_NAMES.get(normalizeHeader(text)) ?? null;
}

/** The column that names the payment modes, with the names it does not know. */
export function detectPaymentModeColumn(
  rows: readonly (readonly string[])[],
  firstLine: number,
): VocabularyColumn | null {
  return detectVocabularyColumn(rows, firstLine, readPaymentMode);
}

/**
 * Among the columns not yet taken (date, label, amount, type, payment mode),
 * the one with the smallest share of distinct values, as categories repeat.
 * A column whose values are all different is a label or a reference, not a
 * category. Null when no column qualifies; a tie goes to the earlier column.
 */
export function detectCategoryColumn(
  rows: readonly (readonly string[])[],
  taken: readonly number[],
): number | null {
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  let best: { column: number; distinctShare: number } | null = null;
  for (let column = 0; column < columnCount; column += 1) {
    if (taken.includes(column)) continue;
    const cells = rows
      .map((row) => (row[column] ?? "").trim())
      .filter((cell) => cell !== "");
    const distinct = new Set(cells).size;
    if (cells.length === 0 || distinct === cells.length) continue;

    const distinctShare = distinct / cells.length;
    if (best === null || distinctShare < best.distinctShare) {
      best = { column, distinctShare };
    }
  }
  return best?.column ?? null;
}

export type VocabularyRole = "type" | "paymentMode";

/** Something the detection could not settle: the preview shows each one for the user to handle. */
export type ColumnIssue =
  | { kind: "columnNotFound"; role: VocabularyRole | "category" }
  | {
      kind: "ambiguousColumn";
      role: VocabularyRole;
      /** The one kept; the user may prefer one of `alsoMatching`. */
      column: number;
      alsoMatching: number[];
    }
  | ({ kind: "unrecognizedValue"; role: VocabularyRole } & UnrecognizedValue);

export interface ColumnRoles {
  typeColumn: number | null;
  paymentModeColumn: number | null;
  categoryColumn: number | null;
  /** Every column not found and every value not read; empty only when nothing is left to the user. */
  issues: ColumnIssue[];
}

function issuesOf(
  role: VocabularyRole,
  found: VocabularyColumn | null,
): ColumnIssue[] {
  if (found === null) return [{ kind: "columnNotFound", role }];
  return [
    ...(found.alsoMatching.length === 0
      ? []
      : [
          {
            kind: "ambiguousColumn" as const,
            role,
            column: found.column,
            alsoMatching: found.alsoMatching,
          },
        ]),
    ...found.unrecognized.map((value) => ({
      kind: "unrecognizedValue" as const,
      role,
      ...value,
    })),
  ];
}

/**
 * Finds the optional columns (type, payment mode, category) of a file whose
 * date, label and amount columns are already mapped. Nothing is dropped: a
 * column not found and a value not read both end up in `issues`.
 */
export function detectColumnRoles(
  rows: readonly (readonly string[])[],
  firstLine: number,
  mappedColumns: readonly number[],
): ColumnRoles {
  const type = detectTypeColumn(rows, firstLine);
  const paymentMode = detectPaymentModeColumn(rows, firstLine);
  const taken = [...mappedColumns];
  if (type !== null) taken.push(type.column);
  if (paymentMode !== null) taken.push(paymentMode.column);
  const categoryColumn = detectCategoryColumn(rows, taken);

  return {
    typeColumn: type?.column ?? null,
    paymentModeColumn: paymentMode?.column ?? null,
    categoryColumn,
    issues: [
      ...issuesOf("type", type),
      ...issuesOf("paymentMode", paymentMode),
      ...(categoryColumn === null
        ? [{ kind: "columnNotFound" as const, role: "category" as const }]
        : []),
    ],
  };
}
