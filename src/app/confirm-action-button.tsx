"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button, type ButtonVariant } from "../components/button";
import { Modal } from "./modal";


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
 * Asks before an action the user cannot undo from the app, so its confirm button
 * is always the destructive one, in the modal of the app.
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
  const [isOpen, setIsOpen] = useState(false);

  function requestClose() {
    setIsOpen(false);
  }

  const content = (
    <>
      <p>{message}</p>
      <div className="flex justify-end gap-2">
        {/* Cancel takes the initial focus: the safe answer comes first. */}
        <Button
          type="button"
          variant="secondary"
          autoFocus
          onClick={requestClose}
        >
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          variant="destructive"
          form={formId}
          onClick={requestClose}
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
        onClick={() => setIsOpen(true)}
        className={className}
      >
        {label}
        <span className="sr-only"> {subject}</span>
      </Button>
      <Modal isOpen={isOpen} onClose={requestClose} title={title}>
        {formId ? (
          <div className="flex flex-col gap-4">{content}</div>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            {content}
          </form>
        )}
      </Modal>
    </>
  );
}
