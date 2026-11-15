"use client";

import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { Button, type ButtonVariant } from "../components/button";
import styles from "./confirm-action-button.module.css";
import { useMotion } from "./motion-provider";


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
 * is always the destructive one. The native dialog traps focus and gives focus back
 * to the button when it closes. It stays open until the exit motion ends, then
 * `close()` runs; its content is only mounted while open, so the page never
 * carries a hidden Motion state.
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
  const motion = useMotion();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);

  function open() {
    dialogRef.current?.showModal();
    setIsOpen(true);
  }

  function requestClose() {
    setIsOpen(false);
  }

  const content = (
    <>
      <h2 id={titleId} className="text-title font-medium">
        {title}
      </h2>
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
        onClick={open}
        className={className}
      >
        {label}
        <span className="sr-only"> {subject}</span>
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        data-closing={isOpen ? undefined : ""}
        // Escape would close at once: the exit motion runs first.
        onCancel={(event) => {
          event.preventDefault();
          requestClose();
        }}
        onClose={requestClose}
        className={`${styles.dialog} m-auto w-[calc(100%-2rem)] max-w-105 overflow-visible bg-transparent p-0 text-text backdrop:bg-backdrop`}
      >
        <AnimatePresence onExitComplete={() => dialogRef.current?.close()}>
          {isOpen ? (
            <m.div
              initial={{ opacity: 0, y: motion.offset.rise }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { duration: motion.duration.enter, ease: motion.ease.enter },
              }}
              exit={{
                opacity: 0,
                transition: { duration: motion.duration.exit, ease: motion.ease.exit },
              }}
              className="rounded-card bg-surface p-6 shadow-overlay"
            >
              {formId ? (
                <div className="flex flex-col gap-4">{content}</div>
              ) : (
                <form action={action} className="flex flex-col gap-4">
                  {content}
                </form>
              )}
            </m.div>
          ) : null}
        </AnimatePresence>
      </dialog>
    </>
  );
}
