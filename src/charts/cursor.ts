/**
 * Keyboard cursor of a chart: the category whose values are read out. Pure, so
 * the key handling is tested without a DOM.
 */

/**
 * The category the cursor moves to when `key` is pressed, or null when the key
 * is not one the cursor reacts to. Without a cursor yet, the first arrow lands
 * on the most recent category.
 */
export function moveCursor(
  key: string,
  current: number | null,
  lastIndex: number,
): number | null {
  switch (key) {
    case "ArrowLeft":
      return current === null ? lastIndex : Math.max(0, current - 1);
    case "ArrowRight":
      return current === null ? lastIndex : Math.min(lastIndex, current + 1);
    case "Home":
      return 0;
    case "End":
      return lastIndex;
    default:
      return null;
  }
}
