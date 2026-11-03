import type { ColumnChoiceFields, StagedFile } from "./import-form-data";

/** The columns the user chose, by position of the file among those chosen. */
export type ColumnChoicesBySource = Readonly<Record<number, ColumnChoiceFields>>;

/**
 * Reads the files one after the other, each with its own column choices (the
 * detection for a file the user chose nothing for), so that reading them again
 * for another account does not undo what was chosen on any of them.
 */
export async function stageSources(
  sources: readonly File[],
  choices: ColumnChoicesBySource,
  stageOne: (file: File, columns: ColumnChoiceFields | undefined) => Promise<StagedFile>,
  onProgress?: (current: number, file: File) => void,
): Promise<StagedFile[]> {
  const staged: StagedFile[] = [];
  for (const [index, file] of sources.entries()) {
    onProgress?.(index + 1, file);
    staged.push(await stageOne(file, choices[index]));
  }
  return staged;
}
