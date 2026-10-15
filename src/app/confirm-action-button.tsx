"use client";

import { useId, useRef } from "react";

interface ConfirmActionButtonProps {
  /** The server action to run once the user confirms. */
  action: () => Promise<void>;
  /** Visible label of the button that opens the confirmation, e.g. "Archive". */
  label: string;
  /** What the action applies to: read after the label by screen readers. */
  subject: string;
  title: string;
  message: string;
  confirmLabel: string;
}

/**
 * Asks before an action the user cannot undo from the app. The native dialog
 * traps focus, closes on Escape and gives focus back to the button.
 */
export function ConfirmActionButton({
  action,
  label,
  subject,
  title,
  message,
  confirmLabel,
}: ConfirmActionButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="min-h-11 px-2 underline"
      >
        {label}
        <span className="sr-only"> {subject}</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="rounded border border-neutral-500 bg-white p-6 text-neutral-900 backdrop:bg-black/40"
      >
        <form action={action} className="flex max-w-sm flex-col gap-4">
          <h2 id={titleId} className="text-xl font-semibold">
            {title}
          </h2>
          <p>{message}</p>
          <div className="flex gap-2">
            {/* Cancel takes the initial focus: the safe answer comes first. */}
            <button
              type="button"
              autoFocus
              onClick={() => dialogRef.current?.close()}
              className="min-h-11 rounded border border-neutral-500 px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-11 rounded bg-red-800 px-4 font-medium text-white"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
