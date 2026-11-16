// Keyboard rules of the select (DESIGN.md, section 9, "Custom pickers"), after the WAI-ARIA
// select-only combobox. Pure functions: no DOM, no clock. The component owns the state, the focus
// and the timer that empties the type-ahead buffer.

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectKeyState {
  isOpen: boolean;
  /** The option the list points at (the selected one while closed), -1 when there is none. */
  activeIndex: number;
  /** The letters typed so far in the current search. */
  typeahead: string;
}

export interface SelectKeyModifiers {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

export type SelectKeyAction =
  | { type: "none" }
  | { type: "open"; activeIndex: number; preventDefault: boolean }
  | { type: "move"; activeIndex: number; preventDefault: boolean }
  | { type: "commit"; activeIndex: number; preventDefault: boolean }
  | { type: "close"; preventDefault: boolean }
  | { type: "typeahead"; buffer: string; activeIndex: number; preventDefault: boolean };

const PAGE_JUMP = 10;

const NONE: SelectKeyAction = { type: "none" };

function isEnabled(options: readonly SelectOption[], index: number): boolean {
  const option = options[index];
  return option !== undefined && option.disabled !== true;
}

export function firstEnabled(options: readonly SelectOption[]): number {
  return options.findIndex((_, index) => isEnabled(options, index));
}

function lastEnabled(options: readonly SelectOption[]): number {
  return options.findLastIndex((_, index) => isEnabled(options, index));
}

// The nearest enabled option from `from` in the direction of `step` (1 or -1), `from` itself when
// there is none: the list stops at its ends instead of wrapping.
function nearestEnabled(options: readonly SelectOption[], from: number, step: 1 | -1): number {
  for (let index = from + step; index >= 0 && index < options.length; index += step) {
    if (isEnabled(options, index)) return index;
  }
  return from;
}

// A page jump lands on `from + delta` clamped to the list; a disabled landing spot gives way to
// the nearest enabled option on the side of `from`, so the jump never overshoots.
function jump(options: readonly SelectOption[], from: number, delta: number): number {
  const target = Math.min(Math.max(from + delta, 0), options.length - 1);
  if (isEnabled(options, target)) return target;
  const towardFrom = delta > 0 ? -1 : 1;
  return nearestEnabled(options, target, towardFrom);
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function isRepeatedLetter(buffer: string): boolean {
  const letters = [...buffer];
  return letters.length > 1 && letters.every((letter) => letter === letters[0]);
}

/**
 * The option a search lands on, -1 when none matches. One letter, or the same letter repeated,
 * moves on to the next option that starts with it; a longer buffer keeps the option the list
 * already points at when it still matches. Case and accents are ignored; disabled options are skipped.
 */
export function findTypeaheadMatch(
  options: readonly SelectOption[],
  activeIndex: number,
  buffer: string,
): number {
  if (buffer === "" || options.length === 0) return -1;
  const repeated = isRepeatedLetter(buffer);
  const needle = fold(repeated ? [...buffer][0] ?? "" : buffer);
  const firstOffset = repeated || [...buffer].length === 1 ? 1 : 0;

  for (let offset = firstOffset; offset < options.length + firstOffset; offset += 1) {
    const index = (((activeIndex + offset) % options.length) + options.length) % options.length;
    const option = options[index];
    if (option !== undefined && option.disabled !== true && fold(option.label).startsWith(needle)) {
      return index;
    }
  }
  return -1;
}

function isLetter(key: string): boolean {
  return [...key].length === 1;
}

function commit(activeIndex: number, preventDefault: boolean): SelectKeyAction {
  return activeIndex < 0 ? { type: "close", preventDefault } : { type: "commit", activeIndex, preventDefault };
}

function resolveClosed(
  state: SelectKeyState,
  key: string,
  options: readonly SelectOption[],
): SelectKeyAction {
  const start = state.activeIndex >= 0 ? state.activeIndex : firstEnabled(options);
  switch (key) {
    case "ArrowDown":
    case "ArrowUp":
    case "Enter":
    case " ":
      return { type: "open", activeIndex: start, preventDefault: true };
    case "Home":
      return { type: "open", activeIndex: firstEnabled(options), preventDefault: true };
    case "End":
      return { type: "open", activeIndex: lastEnabled(options), preventDefault: true };
    case "PageDown":
      return { type: "open", activeIndex: jump(options, Math.max(start, 0), PAGE_JUMP), preventDefault: true };
    case "PageUp":
      return { type: "open", activeIndex: jump(options, Math.max(start, 0), -PAGE_JUMP), preventDefault: true };
    default:
      return NONE;
  }
}

function resolveOpen(
  state: SelectKeyState,
  key: string,
  options: readonly SelectOption[],
  modifiers: SelectKeyModifiers,
): SelectKeyAction {
  const { activeIndex } = state;
  const move = (index: number): SelectKeyAction =>
    index < 0 ? NONE : { type: "move", activeIndex: index, preventDefault: true };

  switch (key) {
    case "ArrowDown":
      return move(activeIndex < 0 ? firstEnabled(options) : nearestEnabled(options, activeIndex, 1));
    case "ArrowUp":
      if (modifiers.alt) return commit(activeIndex, true);
      return move(activeIndex < 0 ? lastEnabled(options) : nearestEnabled(options, activeIndex, -1));
    case "Home":
      return move(firstEnabled(options));
    case "End":
      return move(lastEnabled(options));
    case "PageDown":
      return move(jump(options, Math.max(activeIndex, 0), PAGE_JUMP));
    case "PageUp":
      return move(jump(options, Math.max(activeIndex, 0), -PAGE_JUMP));
    case "Enter":
      return commit(activeIndex, true);
    case "Escape":
      return { type: "close", preventDefault: true };
    case "Tab":
      // Tab only leaves: the value stays as it was and the focus moves on.
      return { type: "close", preventDefault: false };
    case " ":
      return commit(activeIndex, true);
    default:
      return isLetter(key) ? resolveTypeahead(state, key, options) : NONE;
  }
}

function resolveTypeahead(
  state: SelectKeyState,
  key: string,
  options: readonly SelectOption[],
): SelectKeyAction {
  const buffer = state.typeahead + key;
  const match = findTypeaheadMatch(options, state.activeIndex, buffer);
  return { type: "typeahead", buffer, activeIndex: match >= 0 ? match : state.activeIndex, preventDefault: true };
}

/** What a key press does to the select. `none` means the browser keeps the key. */
export function resolveSelectKey(
  state: SelectKeyState,
  key: string,
  options: readonly SelectOption[],
  modifiers: SelectKeyModifiers,
): SelectKeyAction {
  if (modifiers.ctrl || modifiers.meta) return NONE;
  if (state.isOpen) return resolveOpen(state, key, options, modifiers);
  if (isLetter(key) && key !== " ") return resolveTypeahead(state, key, options);
  return resolveClosed(state, key, options);
}
