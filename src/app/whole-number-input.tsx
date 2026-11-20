"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";

type WholeNumberInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "inputMode" | "autoComplete" | "id"
> & { id: string };

const NOT_A_DIGIT = /\D/u;
const REMOVAL_INPUT_TYPES = /^(delete|history)/;
const PASTE_INPUT_TYPES = new Set(["insertFromPaste", "insertFromDrop"]);

/**
 * The text field of a whole number (a day, a count of months or weeks, a number of days). It refuses
 * at once any character that is not a digit and says why in a polite live region, the same rule
 * the server applies (DESIGN section 9, "Exact syntax").
 */
export function WholeNumberInput({ id, ...rest }: WholeNumberInputProps) {
  const t = useTranslations("feedback");
  const inputRef = useRef<HTMLInputElement>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const regionId = `${id}-syntax`;
  const describedBy = [rest["aria-describedby"], regionId].filter(Boolean).join(" ");

  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;

    // A native listener: the synthetic React event has no `inputType` and misses drops.
    function filter(event: InputEvent) {
      if (event.isComposing || REMOVAL_INPUT_TYPES.test(event.inputType)) return;
      const isPaste = PASTE_INPUT_TYPES.has(event.inputType);
      const data = isPaste ? (event.dataTransfer?.getData("text/plain") ?? "") : (event.data ?? "");
      const character = [...data].find((candidate) => NOT_A_DIGIT.test(candidate));
      if (character === undefined) {
        setRefused(null);
        return;
      }
      event.preventDefault();
      setRefused(character);
    }

    input.addEventListener("beforeinput", filter);
    return () => input.removeEventListener("beforeinput", filter);
  }, []);

  return (
    <div className="flex flex-col">
      <input
        {...rest}
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-describedby={describedBy}
      />
      {/* Present and empty from the first render: a polite region created with its text is
          often not announced. */}
      <p aria-live="polite" id={regionId} className="text-caption text-text-muted not-empty:mt-1">
        {refused === null ? null : t("wholeNumberCharacterRefused", { character: refused })}
      </p>
    </div>
  );
}
