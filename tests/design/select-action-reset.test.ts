import { describe, expect, it } from "vitest";

import { readSourceFiles } from "../source-files";

/**
 * The attributes written directly on each `<Select ...>` of a source text: what sits inside braces
 * (handlers, spreads, expressions) is left out, so a `value=` is only found as a prop of its own.
 */
function selectTopLevelProps(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(/<Select\b/g)) {
    let depth = 0;
    let props = "";
    for (let index = match.index + match[0].length; index < text.length; index += 1) {
      const character = text.charAt(index);
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      else if (character === ">" && depth === 0) break;
      else if (depth === 0) props += character;
    }
    tags.push(props);
  }
  return tags;
}

const CONTROLLED_VALUE = /(^|\s)value=/;

describe("a Select in a form that runs an action", () => {
  it("finds a controlled value in the shape that caused the bug", () => {
    const withTheBug = `
      <Select
        key={\`repetition-\${resultCount}\`}
        id="repetition"
        value={repetition}
        onChange={(event) => setRepetition(event.target.value)}
      >`;

    expect(selectTopLevelProps(withTheBug).some((props) => CONTROLLED_VALUE.test(props))).toBe(
      true,
    );
  });

  it("does not take a value inside a handler or a spread for a prop", () => {
    const fixed = `
      <Select key={resultCount} id="r" defaultValue={repetition} onChange={(e) => set(e.target.value)} {...rest}>`;

    expect(selectTopLevelProps(fixed).some((props) => CONTROLLED_VALUE.test(props))).toBe(false);
  });

  // React resets the form after an action. A controlled select is put back on its first option by
  // that reset, because React only marks the default option for a `defaultValue`: the next submit
  // then posts the first option. A `defaultValue` remounted by a key survives the reset.
  it("is not controlled with a value", () => {
    const offenders = readSourceFiles("src")
      .filter(({ text }) => text.includes("useActionState"))
      .filter(({ text }) => selectTopLevelProps(text).some((props) => CONTROLLED_VALUE.test(props)))
      .map(({ relative }) => relative);

    expect(offenders).toEqual([]);
  });
});
