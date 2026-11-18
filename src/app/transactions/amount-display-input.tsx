"use client";

import { useLocale } from "next-intl";
import type { ComponentProps } from "react";

import { currencySymbol } from "../../domain/money";
import { AmountInput } from "../amount-input";

type AmountDisplayInputProps = Omit<ComponentProps<typeof AmountInput>, "className"> & {
  /** A red minus (an expense), a green plus (money coming in), or no sign (a transfer). */
  direction: "out" | "in" | "neutral";
  currency: string;
};

// The sign, the figure and the symbol share one grid row, whatever the figure's width; the live
// message of the amount rule takes the row under. The input is the grid's own item: the wrapper
// of `AmountInput` is flattened with `contents`.
const GROUP_CLASS =
  "grid min-h-16 grid-cols-[auto_auto_auto] items-baseline justify-center gap-x-1.5 rounded-control " +
  "[&>div]:contents [&_input]:col-start-2 [&_input]:row-start-1 [&_p]:col-span-3 [&_p]:row-start-2 [&_p]:text-center " +
  "focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-focus " +
  "has-[[aria-invalid=true]]:outline-2 has-[[aria-invalid=true]]:outline-offset-4 has-[[aria-invalid=true]]:outline-negative";
const INPUT_CLASS =
  "field-sizing-content min-w-[1ch] border-0 bg-transparent p-0 text-center text-display " +
  "text-text tabular-nums outline-none placeholder:text-text-muted";

const SIGN = { out: "\u2212", in: "+", neutral: "" } as const;
const SIGN_TONE = { out: "text-negative", in: "text-positive", neutral: "text-text-muted" } as const;

/** The amount in `text-display` (DESIGN section 10): centred, no box, its sign drawn from the type. */
export function AmountDisplayInput({ direction, currency, ...input }: AmountDisplayInputProps) {
  const locale = useLocale();

  return (
    <div className={GROUP_CLASS}>
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 text-amount ${SIGN_TONE[direction]}`}
      >
        {SIGN[direction]}
      </span>
      <AmountInput {...input} placeholder="0" className={INPUT_CLASS} />
      <span aria-hidden="true" className="col-start-3 row-start-1 text-title text-text-muted">
        {currencySymbol(currency, locale)}
      </span>
    </div>
  );
}
