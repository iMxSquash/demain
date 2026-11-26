// Keyboard model of the month grid (DESIGN section 18, "Keyboard"): the date picker's keys, held to
// the displayed month because the grid shows one month. Pure: no DOM, no clock.

import {
  addDays,
  addMonths,
  resolveDateKey,
  type DateKeyModifiers,
} from "../../components/date-picker-keyboard";

interface GridKeyState {
  /** The day the focus is on, YYYY-MM-DD. */
  focused: string;
  /** The day whose details are open, YYYY-MM-DD. */
  opened: string | null;
}

interface GridKeyResult extends GridKeyState {
  /** False when the key means nothing here: the browser keeps its default. */
  handled: boolean;
}

function clampToMonth(date: string, month: string): string {
  const first = `${month}-01`;
  const last = addDays(addMonths(first, 1), -1);
  if (date < first) return first;
  return date > last ? last : date;
}

/**
 * The state after a key. Moving never opens a day, and a move that the month edge cancels is still
 * handled, so that the page does not scroll. Escape is not handled: nothing opens in a popup.
 */
export function reduceGridKey(
  state: GridKeyState,
  key: string,
  modifiers: DateKeyModifiers,
  weekStart: number,
  month: string,
): GridKeyResult {
  const action = resolveDateKey({ focused: state.focused }, key, modifiers, weekStart);
  switch (action.type) {
    case "move":
      return { focused: clampToMonth(action.date, month), opened: state.opened, handled: true };
    case "commit":
      return { focused: state.focused, opened: action.date, handled: true };
    default:
      return { ...state, handled: false };
  }
}
