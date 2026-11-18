"use client";

import { useLocale } from "next-intl";
import type { ComponentProps } from "react";

import { currencySymbol } from "../../domain/money";
import { AmountInput } from "../amount-input";

type AmountDisplayInputProps = Omit<ComponentProps<typeof AmountInput>, "className"> & {
  /** Draws a red minus (an expense) or a green plus (money coming in) before the figure. */
  direction: "out" | "in";
  currency: string;
};

// The sign and the symbol sit over the 64 px field, on its own height: the live message under
// the field must not move them.
const MARK_CLASS = "pointer-events-none absolute top-0 flex h-16 items-center text-display";

/** The amount in `text-display` (DESIGN section 10): centred, its sign drawn from the type. */
export function AmountDisplayInput({ direction, currency, ...input }: AmountDisplayInputProps) {
  const locale = useLocale();

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className={`${MARK_CLASS} left-3 ${direction === "out" ? "text-negative" : "text-positive"}`}
      >
        {direction === "out" ? "−" : "+"}
      </span>
      <AmountInput
        {...input}
        className="min-h-16 w-full rounded-control border border-border-control bg-control px-14 text-center text-display tabular-nums transition-colors not-aria-[invalid=true]:hover:border-text not-aria-[invalid=true]:focus-visible:border-text aria-[invalid=true]:border-2 aria-[invalid=true]:border-negative"
      />
      <span aria-hidden="true" className={`${MARK_CLASS} right-3 text-text-muted`}>
        {currencySymbol(currency, locale)}
      </span>
    </div>
  );
}
