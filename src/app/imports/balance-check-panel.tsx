"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { BUTTON_CLASS, CONTROL_CLASS } from "../form-field";
import { checkBatchBalanceAction } from "./checks-actions";
import type { BalanceCheckState } from "./import-form-data";

/** Asks for the real balance at the end of a recorded file and tells the gap in text. */
export function BalanceCheckPanel({ batchId }: { batchId: number }) {
  const t = useTranslations("imports.staged.balanceCheck");
  const headingId = useId();
  const inputId = useId();
  const hintId = useId();
  const resultId = useId();
  const [text, setText] = useState("");
  const [result, setResult] = useState<BalanceCheckState | null>(null);
  const [isPending, startTransition] = useTransition();

  function check() {
    startTransition(async () => {
      try {
        setResult(await checkBatchBalanceAction(batchId, text));
      } catch (error) {
        console.error("Balance check failed", error);
        setResult({ status: "error", message: t("failed") });
      }
    });
  }

  const isError = result?.status === "error";

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col items-start gap-2 border-t border-neutral-500 pt-3"
    >
      <h4 id={headingId} className="font-semibold">
        {t("heading")}
      </h4>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          check();
        }}
        className="flex w-full flex-col items-start gap-2"
      >
        <label htmlFor={inputId}>{t("label")}</label>
        <p id={hintId}>{t("hint")}</p>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          aria-invalid={isError}
          aria-describedby={isError ? `${hintId} ${resultId}` : hintId}
          className={`${CONTROL_CLASS} max-w-xs`}
        />
        <button type="submit" disabled={isPending} className={BUTTON_CLASS}>
          {t("submit")}
        </button>
      </form>
      <div role="status">
        {isPending ? <p>{t("checking")}</p> : null}
        {result === null || isPending ? null : (
          <p id={resultId} className="font-medium">
            {result.message}
          </p>
        )}
      </div>
    </section>
  );
}
