"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { ConfirmActionButton } from "../confirm-action-button";
import { BUTTON_CLASS } from "../form-field";
import { undoImportBatchAction } from "./checks-actions";
import type { UndoImportState } from "./import-form-data";

/** Offers to remove a recorded file as a whole, after a confirmation that says what goes. */
export function UndoImportPanel({
  batchId,
  fileName,
  onUndone,
}: {
  batchId: number;
  fileName: string;
  /** Called once the movements are removed: the panels that work on them are no longer offered. */
  onUndone: () => void;
}) {
  const t = useTranslations("imports.staged.undo");
  const headingId = useId();
  const [result, setResult] = useState<UndoImportState | null>(null);

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
      className="flex flex-col items-start gap-2 border-t border-neutral-500 pt-3"
    >
      <h4 id={headingId} className="font-semibold">
        {t("heading")}
      </h4>
      {result?.status === "undone" ? null : (
        <ConfirmActionButton
          action={undo}
          label={t("open")}
          subject={t("subject", { name: fileName })}
          title={t("title", { name: fileName })}
          message={t("message")}
          confirmLabel={t("confirm")}
          buttonClassName={BUTTON_CLASS}
        />
      )}
      <div role={result?.status === "error" ? "alert" : "status"}>
        {result === null ? null : <p className="font-medium">{result.message}</p>}
      </div>
    </section>
  );
}
