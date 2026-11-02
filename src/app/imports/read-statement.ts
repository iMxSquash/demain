import {
  chooseCsvMapping,
  detectDelimiter,
  parseCsv,
  suggestCsvMapping,
  type CsvMapping,
  type CsvReading,
} from "../../domain/import-csv";
import { parseOfx } from "../../domain/import-ofx";
import { getLastCsvMapping } from "../../ledger/imports";
import { withDatabase } from "../../storage/with-database";
import { mappingToFields, type MappingFields } from "./import-form-data";

const RAW_ROW_COUNT = 5;

const emptyMappingFields = (
  delimiter: CsvMapping["delimiter"],
): MappingFields => ({
  delimiter,
  hasHeader: true,
  dateColumn: "",
  dateFormat: "dmy",
  labelColumn: "",
  amountKind: "single",
  amountColumn: "",
  debitColumn: "",
  creditColumn: "",
});

/** What was read from a file, in the shape both formats share. */
export interface StatementReading extends CsvReading {
  /** What the mapping fields start from: null for OFX. */
  mapping: MappingFields | null;
  /** First rows of a CSV as they are, to read the column numbers from. */
  rawRows: string[][];
  /** Every row of a CSV as it is, header included; empty for OFX. */
  table: string[][];
  /** The CSV mapping that produced `rows`, null for OFX or while the columns are unknown. */
  used: CsvMapping | null;
}

export function readOfx(text: string, currency: string): StatementReading {
  return {
    rows: parseOfx(text, currency),
    errors: [],
    mapping: null,
    rawRows: [],
    table: [],
    used: null,
  };
}

// The mapping comes from the form once the user has seen it. Before that, the
// one of the last import on the account is tried first, then a guess on the
// header row: the first that reads the whole file wins, otherwise the first
// one is kept so that the user sees what is wrong and can fix it.
export function readCsv(
  text: string,
  submitted: CsvMapping | null,
  accountId: number,
  currency: string,
): StatementReading {
  const delimiter = submitted?.delimiter ?? detectDelimiter(text);
  const parsed = parseCsv(text, delimiter);
  const rawRows = parsed.slice(0, RAW_ROW_COUNT);

  const saved = withDatabase((db) => getLastCsvMapping(db, accountId));
  const candidates = submitted
    ? [submitted]
    : [
        saved?.delimiter === delimiter ? saved : null,
        suggestCsvMapping(parsed[0] ?? [], delimiter),
      ].filter((candidate): candidate is CsvMapping => candidate !== null);

  const chosen = chooseCsvMapping(parsed, candidates, currency);
  if (chosen === null) {
    return {
      rows: [],
      errors: [],
      mapping: emptyMappingFields(delimiter),
      rawRows,
      table: parsed,
      used: null,
    };
  }
  return {
    ...chosen.reading,
    mapping: mappingToFields(chosen.mapping),
    rawRows,
    table: parsed,
    used: chosen.mapping,
  };
}
