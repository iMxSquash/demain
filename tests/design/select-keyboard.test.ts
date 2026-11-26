import { describe, expect, it } from "vitest";

import {
  findTypeaheadMatch,
  resolveSelectKey,
  type SelectKeyState,
  type SelectOption,
} from "../../src/components/select-keyboard";

const NO_MODIFIERS = { alt: false, ctrl: false, meta: false };

function options(...labels: string[]): SelectOption[] {
  return labels.map((label) => ({ value: label.toLowerCase(), label }));
}

function numbered(count: number): SelectOption[] {
  return Array.from({ length: count }, (_, index) => ({
    value: `${index}`,
    label: `Option ${index}`,
  }));
}

function open(activeIndex: number, typeahead = ""): SelectKeyState {
  return { isOpen: true, activeIndex, typeahead };
}

function closed(activeIndex: number): SelectKeyState {
  return { isOpen: false, activeIndex, typeahead: "" };
}

const FRUITS = options("Apple", "Banana", "Cherry", "Date");

describe("resolveSelectKey, closed", () => {
  it.each(["ArrowDown", "ArrowUp", "Enter", " "])("%s opens on the selected option", (key) => {
    expect(resolveSelectKey(closed(2), key, FRUITS, NO_MODIFIERS)).toEqual({
      type: "open",
      activeIndex: 2,
      preventDefault: true,
    });
  });

  it("opens on the first option for Home and the last for End", () => {
    expect(resolveSelectKey(closed(2), "Home", FRUITS, NO_MODIFIERS)).toMatchObject({
      type: "open",
      activeIndex: 0,
    });
    expect(resolveSelectKey(closed(1), "End", FRUITS, NO_MODIFIERS)).toMatchObject({
      type: "open",
      activeIndex: 3,
    });
  });

  it("opens ten options further for PageDown and ten back for PageUp", () => {
    const list = numbered(30);

    expect(resolveSelectKey(closed(5), "PageDown", list, NO_MODIFIERS)).toMatchObject({
      type: "open",
      activeIndex: 15,
    });
    expect(resolveSelectKey(closed(15), "PageUp", list, NO_MODIFIERS)).toMatchObject({
      type: "open",
      activeIndex: 5,
    });
  });

  it("opens on the first enabled option when nothing is selected", () => {
    const list: SelectOption[] = [{ value: "a", label: "A", disabled: true }, ...options("B")];

    expect(resolveSelectKey(closed(-1), "ArrowDown", list, NO_MODIFIERS)).toMatchObject({
      type: "open",
      activeIndex: 1,
    });
  });

  it("opens on the first match of a typed letter", () => {
    expect(resolveSelectKey(closed(0), "c", FRUITS, NO_MODIFIERS)).toEqual({
      type: "typeahead",
      buffer: "c",
      activeIndex: 2,
      preventDefault: true,
    });
  });

  it("lets Tab and Escape through", () => {
    expect(resolveSelectKey(closed(0), "Tab", FRUITS, NO_MODIFIERS)).toEqual({ type: "none" });
    expect(resolveSelectKey(closed(0), "Escape", FRUITS, NO_MODIFIERS)).toEqual({ type: "none" });
  });
});

describe("resolveSelectKey, open", () => {
  it("moves one option with the arrows and stays at the ends", () => {
    expect(resolveSelectKey(open(1), "ArrowDown", FRUITS, NO_MODIFIERS)).toMatchObject({
      type: "move",
      activeIndex: 2,
    });
    expect(resolveSelectKey(open(1), "ArrowUp", FRUITS, NO_MODIFIERS)).toMatchObject({
      type: "move",
      activeIndex: 0,
    });
    expect(resolveSelectKey(open(3), "ArrowDown", FRUITS, NO_MODIFIERS)).toMatchObject({
      type: "move",
      activeIndex: 3,
    });
    expect(resolveSelectKey(open(0), "ArrowUp", FRUITS, NO_MODIFIERS)).toMatchObject({
      type: "move",
      activeIndex: 0,
    });
  });

  it("jumps to the first and last option with Home and End", () => {
    expect(resolveSelectKey(open(2), "Home", FRUITS, NO_MODIFIERS)).toMatchObject({
      type: "move",
      activeIndex: 0,
    });
    expect(resolveSelectKey(open(1), "End", FRUITS, NO_MODIFIERS)).toMatchObject({
      type: "move",
      activeIndex: 3,
    });
  });

  it("jumps by ten with PageDown and PageUp and stops at the ends", () => {
    const list = numbered(25);

    expect(resolveSelectKey(open(3), "PageDown", list, NO_MODIFIERS)).toMatchObject({
      activeIndex: 13,
    });
    expect(resolveSelectKey(open(20), "PageDown", list, NO_MODIFIERS)).toMatchObject({
      activeIndex: 24,
    });
    expect(resolveSelectKey(open(12), "PageUp", list, NO_MODIFIERS)).toMatchObject({
      activeIndex: 2,
    });
    expect(resolveSelectKey(open(4), "PageUp", list, NO_MODIFIERS)).toMatchObject({
      activeIndex: 0,
    });
  });

  it("skips disabled options", () => {
    const list: SelectOption[] = [
      { value: "a", label: "A" },
      { value: "b", label: "B", disabled: true },
      { value: "c", label: "C" },
      { value: "d", label: "D", disabled: true },
    ];

    expect(resolveSelectKey(open(0), "ArrowDown", list, NO_MODIFIERS)).toMatchObject({
      activeIndex: 2,
    });
    expect(resolveSelectKey(open(2), "ArrowDown", list, NO_MODIFIERS)).toMatchObject({
      activeIndex: 2,
    });
    expect(resolveSelectKey(open(2), "End", list, NO_MODIFIERS)).toMatchObject({ activeIndex: 2 });
    expect(resolveSelectKey(open(2), "PageDown", list, NO_MODIFIERS)).toMatchObject({
      activeIndex: 2,
    });
  });

  it("commits the active option on Enter and Space", () => {
    expect(resolveSelectKey(open(2), "Enter", FRUITS, NO_MODIFIERS)).toEqual({
      type: "commit",
      activeIndex: 2,
      preventDefault: true,
    });
    expect(resolveSelectKey(open(1), " ", FRUITS, NO_MODIFIERS)).toMatchObject({
      type: "commit",
      activeIndex: 1,
    });
  });

  it("commits on Alt+ArrowUp", () => {
    expect(
      resolveSelectKey(open(1), "ArrowUp", FRUITS, { ...NO_MODIFIERS, alt: true }),
    ).toMatchObject({
      type: "commit",
      activeIndex: 1,
    });
  });

  it("closes without choosing on Escape", () => {
    expect(resolveSelectKey(open(2), "Escape", FRUITS, NO_MODIFIERS)).toEqual({
      type: "close",
      preventDefault: true,
    });
  });

  it("closes on Tab without choosing and lets the focus move on", () => {
    expect(resolveSelectKey(open(2), "Tab", FRUITS, NO_MODIFIERS)).toEqual({
      type: "close",
      preventDefault: false,
    });
  });

  it("never lands on a disabled option when every option of a jump is disabled", () => {
    const list: SelectOption[] = [
      { value: "0", label: "0", disabled: true },
      ...Array.from({ length: 10 }, (_, index) => ({
        value: `${index + 1}`,
        label: `${index + 1}`,
        disabled: true,
      })),
    ];

    expect(resolveSelectKey(open(-1), "PageDown", list, NO_MODIFIERS)).toEqual({ type: "none" });
  });

  it("does nothing when there is no option", () => {
    expect(resolveSelectKey(open(-1), "ArrowDown", [], NO_MODIFIERS)).toEqual({ type: "none" });
    expect(resolveSelectKey(open(-1), "Enter", [], NO_MODIFIERS)).toEqual({
      type: "close",
      preventDefault: true,
    });
  });

  it("leaves browser shortcuts alone", () => {
    expect(resolveSelectKey(open(0), "a", FRUITS, { ...NO_MODIFIERS, ctrl: true })).toEqual({
      type: "none",
    });
    expect(resolveSelectKey(open(0), "r", FRUITS, { ...NO_MODIFIERS, meta: true })).toEqual({
      type: "none",
    });
  });

  it("ignores keys it does not know", () => {
    expect(resolveSelectKey(open(0), "F5", FRUITS, NO_MODIFIERS)).toEqual({ type: "none" });
    expect(resolveSelectKey(open(0), "Shift", FRUITS, NO_MODIFIERS)).toEqual({ type: "none" });
  });
});

describe("type-ahead", () => {
  it("moves to the next option starting with the typed letter, wrapping around", () => {
    const list = options("Bank", "Cash", "Card", "Credit");

    expect(findTypeaheadMatch(list, 1, "c")).toBe(2);
    expect(findTypeaheadMatch(list, 3, "c")).toBe(1);
  });

  it("matches the whole typed prefix, starting from the active option", () => {
    const list = options("Car", "Card", "Cash");

    expect(findTypeaheadMatch(list, 0, "ca")).toBe(0);
    expect(findTypeaheadMatch(list, 0, "card")).toBe(1);
    expect(findTypeaheadMatch(list, 1, "cas")).toBe(2);
  });

  it("cycles through the matches when the same letter is repeated", () => {
    const list = options("Car", "Card", "Cash");

    expect(findTypeaheadMatch(list, 0, "cc")).toBe(1);
    expect(findTypeaheadMatch(list, 1, "ccc")).toBe(2);
    expect(findTypeaheadMatch(list, 2, "cccc")).toBe(0);
  });

  it("ignores case and accents", () => {
    const list = options("Rent", "Épargne", "Food");

    expect(findTypeaheadMatch(list, 0, "e")).toBe(1);
    expect(findTypeaheadMatch(list, 0, "ÉP")).toBe(1);
  });

  it("skips disabled options and returns -1 without a match", () => {
    const list: SelectOption[] = [
      { value: "a", label: "Alpha", disabled: true },
      { value: "b", label: "Beta" },
    ];

    expect(findTypeaheadMatch(list, 1, "a")).toBe(-1);
    expect(findTypeaheadMatch(list, 0, "z")).toBe(-1);
  });

  it("extends the buffer and keeps the active option when nothing matches", () => {
    expect(resolveSelectKey(open(1), "z", FRUITS, NO_MODIFIERS)).toEqual({
      type: "typeahead",
      buffer: "z",
      activeIndex: 1,
      preventDefault: true,
    });
  });

  it("writes a space into a running search instead of choosing", () => {
    const list = options("New York", "Newark", "New Delhi");

    expect(resolveSelectKey(open(0, "new"), " ", list, NO_MODIFIERS)).toEqual({
      type: "typeahead",
      buffer: "new ",
      activeIndex: 0,
      preventDefault: true,
    });
  });

  it("finds an option whose label has a space", () => {
    const list = options("Livret A", "Livret Jeune", "Compte");

    expect(findTypeaheadMatch(list, 2, "livret j")).toBe(1);
  });
});
