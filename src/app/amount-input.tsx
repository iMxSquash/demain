"use client";

import { WarningCircle } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";

import { Icon } from "../components/icon";
import {
  checkAmountSyntax,
  isAmountDraft,
  stripAmountSpaces,
} from "../domain/amount-syntax";
import { type MessageRef, messageRef } from "../domain/message";

type AmountInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "inputMode" | "autoComplete" | "id"
> & { id: string };

const PASTE_INPUT_TYPES = new Set(["insertFromPaste", "insertFromDrop"]);

type Message = { kind: "refusal" | "invalid"; ref: MessageRef };

/** The first character of `incoming` that no amount can contain once typed at `start`. */
function refusedCharacter(value: string, incoming: string, start: number, end: number) {
  let next = value.slice(0, start);
  const rest = value.slice(end);
  for (const character of incoming) {
    next += character;
    if (!isAmountDraft(next + rest)) return character;
  }
  return null;
}

/**
 * The text field of an amount (DESIGN section 9, "Exact syntax"): it refuses at once any
 * character that no amount can hold, says why in a polite live region, and flags an
 * incomplete value when the field is left. The server applies the same rule from
 * `domain/amount-syntax` and stays the authority.
 */
export function AmountInput({ id, onBlur, ...rest }: AmountInputProps) {
  const t = useTranslations("feedback");
  const common = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const regionId = `${id}-syntax`;
  const describedBy = [rest["aria-describedby"], regionId].filter(Boolean).join(" ");
  const isInvalid = rest["aria-invalid"] === true || rest["aria-invalid"] === "true";
  const isFlagged = message?.kind === "invalid";

  useEffect(() => {
    const current = inputRef.current;
    if (current === null) return;
    // The narrowed type does not reach into `filter`: a constant that cannot be null does.
    const input: HTMLInputElement = current;

    // A native listener: the synthetic React event has no `inputType` and misses drops.
    function filter(event: InputEvent) {
      if (event.isComposing || /^(delete|history)/.test(event.inputType)) return;
      const isPaste = PASTE_INPUT_TYPES.has(event.inputType);
      const data = isPaste ? (event.dataTransfer?.getData("text/plain") ?? "") : (event.data ?? "");
      if (data === "") return;

      const incoming = isPaste ? stripAmountSpaces(data) : data;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const refused = refusedCharacter(input.value, incoming, start, end);

      if (refused !== null) {
        event.preventDefault();
        setMessage({ kind: "refusal", ref: messageRef("amountCharacterRefused", { character: refused }) });
        return;
      }
      setMessage(null);
      if (incoming !== data) {
        event.preventDefault();
        input.setRangeText(incoming, start, end, "end");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
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
        inputMode="decimal"
        autoComplete="off"
        aria-describedby={describedBy}
        aria-invalid={isInvalid || isFlagged ? true : undefined}
        onBlur={(event) => {
          onBlur?.(event);
          const check = checkAmountSyntax(event.currentTarget.value);
          setMessage(check.ok ? null : { kind: "invalid", ref: check.ref });
        }}
      />
      {/* Present and empty from the first render: a polite region created with its text is
          often not announced. */}
      <p
        id={regionId}
        aria-live="polite"
        className={
          "text-caption not-empty:mt-1 " +
          (isFlagged ? "flex items-start gap-2 font-medium text-negative" : "text-text-muted")
        }
      >
        {message === null ? null : isFlagged ? (
          <>
            <Icon icon={WarningCircle} />
            <span>{common("error", { message: t(message.ref.key, message.ref.values) })}</span>
          </>
        ) : (
          t(message.ref.key, message.ref.values)
        )}
      </p>
    </div>
  );
}
