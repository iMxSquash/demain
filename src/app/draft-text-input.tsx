"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";

import type { FeedbackKey } from "../domain/message";

type DraftTextInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "inputMode" | "autoComplete" | "id"
> & {
  id: string;
  inputMode: "numeric" | "decimal";
  /** Whether a text can still become a valid value by typing more: the rule of the server, minus "complete". */
  isDraft: (text: string) => boolean;
  /** Says why a character is refused: it takes the character as `{character}`. */
  refusalMessage: Extract<FeedbackKey, "wholeNumberCharacterRefused" | "percentCharacterRefused">;
};

const REMOVAL_INPUT_TYPES = /^(delete|history)/;
const PASTE_INPUT_TYPES = new Set(["insertFromPaste", "insertFromDrop"]);

/** The first character of `incoming` that no valid value can contain once typed at `start`. */
function refusedCharacter(
  isDraft: (text: string) => boolean,
  value: string,
  incoming: string,
  start: number,
  end: number,
): string | undefined {
  let next = value.slice(0, start);
  const rest = value.slice(end);
  for (const character of incoming) {
    next += character;
    if (!isDraft(next + rest)) return character;
  }
  return undefined;
}

/**
 * The text field of a value with an exact syntax that is not an amount (a number of days, a day of
 * the month, a percentage). It refuses at once any character that no valid value can hold and says
 * why in a polite live region. The server applies the same rule from the domain (DESIGN section 9,
 * "Exact syntax").
 */
export function DraftTextInput({
  id,
  inputMode,
  isDraft,
  refusalMessage,
  ...rest
}: DraftTextInputProps) {
  const t = useTranslations("feedback");
  const inputRef = useRef<HTMLInputElement>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const regionId = `${id}-syntax`;
  const describedBy = [rest["aria-describedby"], regionId].filter(Boolean).join(" ");

  useEffect(() => {
    const current = inputRef.current;
    if (current === null) return;
    // The narrowed type does not reach into `filter`: a constant that cannot be null does.
    const input: HTMLInputElement = current;

    // A native listener: the synthetic React event has no `inputType` and misses drops.
    function filter(event: InputEvent) {
      if (event.isComposing || REMOVAL_INPUT_TYPES.test(event.inputType)) return;
      const isPaste = PASTE_INPUT_TYPES.has(event.inputType);
      const data = isPaste ? (event.dataTransfer?.getData("text/plain") ?? "") : (event.data ?? "");
      const start = input.selectionStart ?? input.value.length;
      const character = refusedCharacter(isDraft, input.value, data, start, input.selectionEnd ?? start);
      if (character === undefined) {
        setRefused(null);
        return;
      }
      event.preventDefault();
      setRefused(character);
    }

    input.addEventListener("beforeinput", filter);
    return () => input.removeEventListener("beforeinput", filter);
  }, [isDraft]);

  return (
    <div className="flex flex-col">
      <input
        {...rest}
        ref={inputRef}
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        aria-describedby={describedBy}
      />
      {/* Present and empty from the first render: a polite region created with its text is
          often not announced. */}
      <p aria-live="polite" id={regionId} className="text-caption text-text-muted not-empty:mt-1">
        {refused === null ? null : t(refusalMessage, { character: refused })}
      </p>
    </div>
  );
}
