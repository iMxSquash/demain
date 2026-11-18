/**
 * Label suggestions of the add-transaction form. Pure functions: no database, no clock.
 */

import { foldAccents } from "./fold-accents";

/**
 * The suggestions to show for what is typed so far: those that contain it, ignoring case and
 * accents, in the order given. A label already typed in full is not suggested again.
 */
export function filterLabelSuggestions<T extends { label: string }>(
  suggestions: readonly T[],
  typed: string,
  limit: number,
): T[] {
  const wanted = foldAccents(typed.trim());
  return suggestions
    .filter(({ label }) => {
      const folded = foldAccents(label);
      return folded !== wanted && folded.includes(wanted);
    })
    .slice(0, limit);
}
