"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { Button } from "../../components/button";
import { BalanceSideField } from "../balance-side-field";
import { CONTROL_CLASS } from "../form-field";
import { formatCalendarDate } from "../../i18n/dates";
import {
  checkBatchBalanceAction,
  recordBatchBalanceAssertionAction,
} from "./checks-actions";
import type { BalanceCheckState } from "./import-form-data";

const SIDE_FIELD = "side";

/** The side is posted by the radios of the form; a missing one reads as credit on the server. */
function sideOf(form: HTMLFormElement | null): string {
  if (form === null) return "";
  const side = new FormData(form).get(SIDE_FIELD);
  return typeof side === "string" ? side : "";
}

/** Asks for the real balance at the end of a recorded file and tells the gap in text. */
export function BalanceCheckPanel({
  batchId,
  endDate,
}: {
  batchId: number;
  endDate: string;
}) {
  const t = useTranslations("imports.staged.balanceCheck");
  const locale = useLocale();
  const headingId = useId();
  const inputId = useId();
  const hintId = useId();
  const resultId = useId();
  const [text, setText] = useState("");
  const [result, setResult] = useState<BalanceCheckState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<"checking" | "recording">("checking");

  function run(
    action: typeof checkBatchBalanceAction,
    form: HTMLFormElement | null,
    progress: "checking" | "recording",
    failure: "failed" | "recordFailed",
  ) {
    setPendingKey(progress);
    startTransition(async () => {
      try {
        setResult(await action(batchId, text, sideOf(form)));
      } catch (error) {
        console.error("Balance check failed", error);
        setResult({ status: "error", message: t(failure) });
      }
    });
  }

  const isError = result?.status === "error";

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col items-start gap-2 border-t border-border-control pt-3"
    >
      <h3 id={headingId} className="font-medium">
        {t("heading")}
      </h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(checkBatchBalanceAction, event.currentTarget, "checking", "failed");
        }}
        className="flex w-full flex-col items-start gap-2"
      >
        <label htmlFor={inputId}>
          {t("label", { date: formatCalendarDate(endDate, locale) })}
        </label>
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
        <BalanceSideField name={SIDE_FIELD} value="credit" />
        <Button type="submit" variant="secondary" pending={isPending}>
          {t("submit")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={text.trim() === ""}
          pending={isPending}
          onClick={(event) =>
            run(
              recordBatchBalanceAssertionAction,
              event.currentTarget.form,
              "recording",
              "recordFailed",
            )
          }
        >
          {t("record")}
        </Button>
      </form>
      <div role="status">
        {isPending ? <p>{t(pendingKey)}</p> : null}
        {result === null || isPending ? null : (
          <p id={resultId} className="font-medium">
            {result.message}
          </p>
        )}
      </div>
    </section>
  );
}
