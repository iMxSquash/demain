"use client";

import { useTranslations } from "next-intl";
import { useId, useRef } from "react";

type ConfirmTarget =
  | {
      /** The server action to run once the user confirms. */
      action: () => Promise<void>;
      formId?: undefined;
    }
  | {
      action?: undefined;
      /** Id of a form elsewhere on the page that the confirmation submits (a form with files or fields). */
      formId: string;
    };

type ConfirmActionButtonProps = ConfirmTarget & {
  /** Visible label of the button that opens the confirmation, e.g. "Archive". */
  label: string;
  /** What the action applies to: read after the label by screen readers. */
  subject: string;
  title: string;
  message: string;
  confirmLabel: string;
  /** Replaces the link-like style of the opening button. */
  buttonClassName?: string;
};

const LINK_BUTTON_CLASS = "min-h-11 px-2 underline";

/**
 * Asks before an action the user cannot undo from the app. The native dialog
 * traps focus, closes on Escape and gives focus back to the button.
 */
export function ConfirmActionButton({
  action,
  formId,
  label,
  subject,
  title,
  message,
  confirmLabel,
  buttonClassName = LINK_BUTTON_CLASS,
}: ConfirmActionButtonProps) {
  const t = useTranslations("common");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const content = (
    <>
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
          {t("cancel")}
        </button>
        <button
          type="submit"
          form={formId}
          onClick={formId ? () => dialogRef.current?.close() : undefined}
          className="min-h-11 rounded bg-red-800 px-4 font-medium text-white"
        >
          {confirmLabel}
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonClassName}
      >
        {label}
        <span className="sr-only"> {subject}</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="rounded border border-neutral-500 bg-white p-6 text-neutral-900 backdrop:bg-black/40"
      >
        {formId ? (
          <div className="flex max-w-sm flex-col gap-4">{content}</div>
        ) : (
          <form action={action} className="flex max-w-sm flex-col gap-4">
            {content}
          </form>
        )}
      </dialog>
    </>
  );
}
