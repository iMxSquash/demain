/**
 * Largest file accepted: a tab is a few kilobytes. With the tab limit this stays
 * under `serverActions.bodySizeLimit` in next.config.ts, which must stay above it.
 */
export const MAX_FILE_BYTES = 512 * 1024;
export const BYTES_PER_KILOBYTE = 1024;

// A browser sends one nameless file when nothing was chosen in a file input.
export const isChosenFile = (value: FormDataEntryValue): value is File =>
  value instanceof File && value.name !== "";

/**
 * A browser sends one nameless empty file for a file input left empty, and the
 * transport of server actions turns its name into the text "undefined": it is
 * removed before the form leaves, so that "nothing chosen" is never read as
 * "an empty file chosen". A real empty file keeps its name and is reported.
 */
export function withoutEmptyFilePlaceholders(formData: FormData): FormData {
  const cleaned = new FormData();
  for (const [name, value] of formData.entries()) {
    const isPlaceholder =
      typeof value !== "string" && value.name === "" && value.size === 0;
    if (!isPlaceholder) cleaned.append(name, value);
  }
  return cleaned;
}
