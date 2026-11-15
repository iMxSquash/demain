"use client";

import type { ComponentPropsWithRef, MouseEvent } from "react";

export type ButtonVariant = "primary" | "secondary" | "link" | "destructive";

// `enabled:` keeps a disabled button from showing its hover tone behind muted text.
// Disabled is a fill and a text colour, never opacity: opacity cannot be measured (DESIGN section 8).
const BASE_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-pill font-medium transition-colors disabled:cursor-not-allowed";
const FILLED_CLASS = "px-4 disabled:bg-surface-sunken disabled:text-text-muted";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: `${FILLED_CLASS} bg-primary text-on-primary enabled:hover:bg-primary-hover`,
  secondary: `${FILLED_CLASS} bg-control text-text enabled:hover:bg-control-hover`,
  destructive: `${FILLED_CLASS} bg-danger text-on-danger`,
  link: "px-2 underline underline-offset-3 enabled:hover:decoration-2 disabled:text-text-muted disabled:no-underline",
};

type ButtonProps = Omit<ComponentPropsWithRef<"button">, "type" | "className"> & {
  // No default: a button that submits a form by accident is worse than a missing prop.
  type: "button" | "submit" | "reset";
  variant?: ButtonVariant;
  /** Layout only (for example `self-start`): a class that sets colour or shape would fight the variant. */
  className?: string;
  /** The action is running: the fill stays, further clicks are ignored and `aria-busy` is announced. */
  pending?: boolean;
  /** The ongoing verb shown while pending ("Adding..."). */
  pendingLabel?: string;
};

/**
 * The shared button. `pending` is not `disabled`: the button keeps its fill and its
 * focus (a native `disabled` would drop the focus in the middle of a submit), and the
 * click is cancelled instead, which also stops a second submit from the Enter key.
 */
export function Button({
  variant = "primary",
  className,
  pending = false,
  pendingLabel,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      {...rest}
      onClick={handleClick}
      aria-busy={pending ? true : undefined}
      aria-disabled={pending ? true : undefined}
      className={[BASE_CLASS, VARIANT_CLASS[variant], className].filter(Boolean).join(" ")}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
