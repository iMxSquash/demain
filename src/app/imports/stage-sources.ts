import type { CsvMapping } from "../../domain/import-csv";
import { mappingToFormFields, type ColumnChoiceFields, type StagedFile } from "./import-form-data";

/** The columns the user chose, by position of the file among those chosen. */
export type ColumnChoicesBySource = Readonly<Record<number, ColumnChoiceFields>>;

/** The mappings the user set by hand, by position of the file among those chosen. */
export type MappingsBySource = Readonly<Record<number, CsvMapping>>;

/** What the user chose for every file, by position among those chosen. */
export interface ChoicesBySource {
  columns: ColumnChoicesBySource;
  mappings: MappingsBySource;
}

/** What one file is read with; an absent choice is left to the detection. */
export interface SourceChoices {
  columns?: ColumnChoiceFields;
  mapping?: CsvMapping;
}

/** The request that reads one file with what the user chose for it. */
export function stagingForm(
  file: File,
  accountText: string,
  { columns, mapping }: SourceChoices,
): FormData {
  const formData = new FormData();
  formData.set("accountId", accountText);
  formData.set("file", file);
  const fields = { ...columns, ...(mapping === undefined ? {} : mappingToFormFields(mapping)) };
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

/**
 * Reads the files one after the other, each with its own column choices and
 * mapping (the detection for a file the user chose nothing for), so that
 * reading them again for another account does not undo what was chosen on any of them.
 */
export async function stageSources(
  sources: readonly File[],
  { columns, mappings }: ChoicesBySource,
  stageOne: (file: File, choices: SourceChoices) => Promise<StagedFile>,
  onProgress?: (current: number, file: File) => void,
): Promise<StagedFile[]> {
  const staged: StagedFile[] = [];
  for (const [index, file] of sources.entries()) {
    onProgress?.(index + 1, file);
    staged.push(await stageOne(file, { columns: columns[index], mapping: mappings[index] }));
  }
  return staged;
}
