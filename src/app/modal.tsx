"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import styles from "./modal.module.css";
import { useMotion } from "./motion-provider";

interface ModalProps {
  isOpen: boolean;
  /** Asked for by Escape, the native close and the caller's own buttons: the caller sets `isOpen` to false. */
  onClose: () => void;
  /** The heading, which names the dialog. */
  title: string;
  children: ReactNode;
}

/**
 * The modal of the app (DESIGN section 6, "Dialog"): a native dialog, which traps the focus and
 * gives it back to the control that opened it. It stays open until the exit motion ends, then
 * `close()` runs; its content is only mounted while open, so the page never carries a hidden
 * Motion state. The caller keeps `isOpen`; the dialog is closed on the server.
 */
export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const motion = useMotion();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // After the commit, so that the content is mounted when the dialog looks for its first focus.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog !== null && !dialog.open) dialog.showModal();
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-closing={isOpen ? undefined : ""}
      // Escape would close at once: the exit motion runs first.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
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
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card bg-surface p-6 shadow-overlay"
          >
            <div className="flex flex-col gap-4">
              <h2 id={titleId} className="text-title font-medium">
                {title}
              </h2>
              {children}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </dialog>
  );
}
