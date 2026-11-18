"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ReactNode } from "react";

import { Button } from "../../components/button";

interface RecapRowProps {
  /** What the row says: the figure and its type, or the label and its category. */
  summary: ReactNode;
  /** Names what "Edit" edits, for assistive technology ("Edit amount"). */
  editLabel: string;
  /** The controls of the in-place editor, shown while the row is open. */
  children: ReactNode;
}

/**
 * A recap row of step 3 (DESIGN section 10): 56 px, with an "Edit" link that opens its editor
 * inside the row. "Done" closes it and gives the focus back to "Edit"; nothing goes back to an
 * earlier step.
 */
export function RecapRow({ summary, editLabel, children }: RecapRowProps) {
  const add = useTranslations("transactions.add");
  const editorId = useId();
  const editRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setOpen] = useState(false);

  return (
    <div>
      <div className="flex min-h-14 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">{summary}</div>
        <Button
          ref={editRef}
          type="button"
          variant="link"
          aria-expanded={isOpen}
          aria-controls={editorId}
          aria-label={editLabel}
          onClick={() => setOpen((current) => !current)}
        >
          {add("edit")}
        </Button>
      </div>
      <div id={editorId}>
        {isOpen ? (
          <div className="motion-enter flex flex-col gap-4 pb-4">
            {children}
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => {
                setOpen(false);
                editRef.current?.focus();
              }}
            >
              {add("done")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
