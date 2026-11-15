"use client";

import { useTranslations } from "next-intl";
import { useId, useRef } from "react";

import { Button, type ButtonVariant } from "../components/button";


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
  /** Look of the button that opens the confirmation: a link, unless it is the main action of its form. */
  variant?: ButtonVariant;
  /** Layout of the opening button (for example `self-start`). */
  className?: string;
};

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
  variant = "link",
  className,
}: ConfirmActionButtonProps) {
  const t = useTranslations("common");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const content = (
    <>
      <h2 id={titleId} className="text-title font-medium">
        {title}
      </h2>
      <p>{message}</p>
      <div className="flex gap-2">
        {/* Cancel takes the initial focus: the safe answer comes first. */}
        <Button
          type="button"
          variant="secondary"
          autoFocus
          onClick={() => dialogRef.current?.close()}
        >
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          variant="destructive"
          form={formId}
          onClick={() => dialogRef.current?.close()}
        >
          {confirmLabel}
        </Button>
      </div>
    </>
  );

  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={() => dialogRef.current?.showModal()}
        className={className}
      >
        {label}
        <span className="sr-only"> {subject}</span>
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="rounded-control border border-border-control bg-surface p-6 text-text backdrop:bg-backdrop"
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
