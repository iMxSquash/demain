/** The select of the link form: its value is `occurrenceKey` of the chosen candidate. */
export const OCCURRENCE_FIELD = "occurrence";

/** The heading of the section: it takes the focus once a link or an unlink is done. */
export const PLANNED_LINK_HEADING_ID = "planned-link-heading";

const KEY_PATTERN = /^([1-9]\d*):(\d{4}-\d{2}-\d{2})$/;

/** The value of an option: the planned item and the nominal date identify an occurrence. */
export function occurrenceKey(plannedItemId: number, nominalDate: string): string {
  return `${plannedItemId}:${nominalDate}`;
}

/** Null when the browser sent anything but a key. */
export function parseOccurrenceKey(
  key: unknown,
): { plannedItemId: number; nominalDate: string } | null {
  if (typeof key !== "string") return null;
  const match = KEY_PATTERN.exec(key);
  if (match === null) return null;
  return { plannedItemId: Number(match[1]), nominalDate: match[2] ?? "" };
}
