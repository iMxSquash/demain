"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { ConfirmActionButton } from "../confirm-action-button";
import { undoImportBatchAction } from "./checks-actions";
import type { UndoImportState } from "./import-form-data";

/** Offers to remove a recorded file as a whole, after a confirmation that says what goes. */
export function UndoImportPanel({
  batchId,
  fileName,
  replacedCount,
  onUndone,
}: {
  batchId: number;
  fileName: string;
  /** Entries marked as paid that the file replaced: undoing it does not bring them back. */
  replacedCount: number;
  /** Called once the movements are removed: the panels that work on them are no longer offered. */
  onUndone: () => void;
}) {
  const t = useTranslations("imports.staged.undo");
  const headingId = useId();
  const [result, setResult] = useState<UndoImportState | null>(null);
  const replacedNote = t("replacedNote", { count: replacedCount });

  async function undo() {
    try {
      const state = await undoImportBatchAction(batchId);
      setResult(state);
      if (state.status === "undone") onUndone();
    } catch (error) {
      console.error("Undoing an import failed", error);
      setResult({ status: "error", message: t("failed") });
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col items-start gap-2 border-t border-border-control pt-3"
    >
      <h3 id={headingId} className="font-medium">
        {t("heading")}
      </h3>
      {replacedCount > 0 && result?.status !== "undone" ? <p className="max-w-prose">{replacedNote}</p> : null}
      {result?.status === "undone" ? null : (
        <ConfirmActionButton
          action={undo}
          label={t("open")}
          subject={t("subject", { name: fileName })}
          title={t("title", { name: fileName })}
          message={replacedCount > 0 ? `${t("message")} ${replacedNote}` : t("message")}
          confirmLabel={t("confirm")}
          variant="secondary"
        />
      )}
      <div role="status">
        {result?.status === "undone" ? <p className="font-medium">{result.message}</p> : null}
      </div>
      <div role="alert">
        {result?.status === "error" ? <p className="font-medium">{result.message}</p> : null}
      </div>
    </section>
  );
}
