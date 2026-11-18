"use client";

import { Backspace } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";

import { Icon } from "../../components/icon";
import type { KeypadKey } from "./add-transaction-steps";

const DIGIT_ROWS: readonly (readonly KeypadKey[])[] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

// 52 px keys (DESIGN section 10) on the sunken surface; the hover and the focus follow the chips.
const KEY_CLASS =
  "inline-flex min-h-13 items-center justify-center rounded-control bg-surface-sunken text-title " +
  "font-medium tabular-nums transition-colors enabled:hover:bg-control-hover " +
  "disabled:cursor-not-allowed disabled:text-text-muted";

interface AddTransactionKeypadProps {
  onKey: (key: KeypadKey) => void;
  /** The decimal separator of the locale: "," or ".". */
  separator: "," | ".";
  /** A currency without decimals has no separator key to press. */
  hasDecimals: boolean;
}

/** The 3 x 4 keypad of the phone flow: it types into the same amount value as the keyboard. */
export function AddTransactionKeypad({ onKey, separator, hasDecimals }: AddTransactionKeypadProps) {
  const add = useTranslations("transactions.add");

  return (
    <div role="group" aria-label={add("keypad")} className="grid grid-cols-3 gap-2">
      {DIGIT_ROWS.flat().map((key) => (
        <button key={key} type="button" onClick={() => onKey(key)} className={KEY_CLASS}>
          {key}
        </button>
      ))}
      <button
        type="button"
        aria-label={add("keypadDecimal")}
        disabled={!hasDecimals}
        onClick={() => onKey(separator)}
        className={KEY_CLASS}
      >
        {separator}
      </button>
      <button type="button" onClick={() => onKey("0")} className={KEY_CLASS}>
        0
      </button>
      <button
        type="button"
        aria-label={add("keypadBackspace")}
        onClick={() => onKey("backspace")}
        className={KEY_CLASS}
      >
        <Icon icon={Backspace} />
      </button>
    </div>
  );
}
