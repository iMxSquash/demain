"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";

import {
  BUTTON_CLASS,
  CONTROL_CLASS,
  FormField,
} from "../../form-field";
import {
  BYTES_PER_KILOBYTE,
  MAX_FILE_BYTES,
  withoutEmptyFilePlaceholders,
} from "../../form-files";
import { useFocusFirstError } from "../../use-focus-first-error";
import { summaryBalancesAction } from "./actions";
import type { SummaryBalancesState } from "./summary-balances-state";
import type { SummaryField } from "./summary-balances-form-data";

export interface AccountOption {
  id: number;
  name: string;
}

const HEADER_CELL = "py-2 pr-4";
const NUMBER_HEADER = "py-2 pr-4 text-right";
const NUMBER_CELL = "py-2 pr-4 text-right tabular-nums";

function describedBy(id: string, hasError: boolean, hasHint: boolean) {
  const ids = [hasHint ? `${id}-hint` : null, hasError ? `${id}-error` : null];
  return ids.filter((value) => value !== null).join(" ") || undefined;
}

function BalancesTable({ rows }: { rows: SummaryBalancesState["rows"] }) {
  const t = useTranslations("summaryBalances");
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="balances-heading" className="flex flex-col gap-2">
      <h2 id="balances-heading" className="text-lg font-semibold">
        {t("balancesHeading")}
      </h2>
      {/* A focusable region: the table is wider than a phone. */}
      <div
        role="region"
        aria-labelledby="balances-heading"
        tabIndex={0}
        className="overflow-x-auto"
      >
        <table className="w-full border-collapse text-left">
          <caption className="pb-2 text-left">{t("balancesCaption")}</caption>
          <thead>
            <tr className="border-b border-neutral-500">
              <th scope="col" className={HEADER_CELL}>
                {t("balancesColumns.month")}
              </th>
              <th scope="col" className={HEADER_CELL}>
                {t("balancesColumns.date")}
              </th>
              <th scope="col" className={NUMBER_HEADER}>
                {t("balancesColumns.balance")}
              </th>
              <th scope="col" className="py-2">
                {t("balancesColumns.status")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date} className="border-b border-neutral-300">
                <th scope="row" className={`${HEADER_CELL} font-medium`}>
                  {row.month}
                </th>
                <td className={`${HEADER_CELL} tabular-nums`}>{row.date}</td>
                <td className={NUMBER_CELL}>{row.balance}</td>
                <td className="py-2">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ComparisonSection({ state }: { state: SummaryBalancesState }) {
  const t = useTranslations("summaryBalances");

  return (
    <section aria-labelledby="comparison-heading" className="flex flex-col gap-2">
      <h2 id="comparison-heading" className="text-lg font-semibold">
        {t("comparisonHeading")}
      </h2>
      {state.isMatching ? <p>{t("comparisonMatches")}</p> : null}
      {state.hasComparison ? null : <p>{t("comparisonNone")}</p>}
      {state.differences.length === 0 ? null : (
        <div
          role="region"
          aria-labelledby="comparison-heading"
          tabIndex={0}
          className="overflow-x-auto"
        >
          <table className="w-full border-collapse text-left">
            <caption className="pb-2 text-left">{t("comparisonCaption")}</caption>
            <thead>
              <tr className="border-b border-neutral-500">
                <th scope="col" className={HEADER_CELL}>
                  {t("comparisonColumns.month")}
                </th>
                <th scope="col" className={HEADER_CELL}>
                  {t("comparisonColumns.figure")}
                </th>
                <th scope="col" className={NUMBER_HEADER}>
                  {t("comparisonColumns.sheet")}
                </th>
                <th scope="col" className={NUMBER_HEADER}>
                  {t("comparisonColumns.demain")}
                </th>
                <th scope="col" className="py-2 text-right">
                  {t("comparisonColumns.difference")}
                </th>
              </tr>
            </thead>
            <tbody>
              {state.differences.map((difference) => (
                <tr
                  key={`${difference.month}-${difference.figure}`}
                  className="border-b border-neutral-300"
                >
                  <th scope="row" className={`${HEADER_CELL} font-medium`}>
                    {difference.month}
                  </th>
                  <td className={HEADER_CELL}>{difference.figure}</td>
                  <td className={NUMBER_CELL}>{difference.sheet}</td>
                  <td className={NUMBER_CELL}>{difference.demain}</td>
                  <td className="py-2 text-right tabular-nums">
                    {difference.difference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function SummaryBalancesForm({ accounts }: { accounts: AccountOption[] }) {
  const t = useTranslations("summaryBalances");
  const common = useTranslations("common");
  const [state, setState] = useState<SummaryBalancesState | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useFocusFirstError(state?.status === "error" ? state : null);

  // The action is called by hand rather than through the form's `action`: React
  // would reset the form afterwards and the chosen file would be lost, while the
  // record button must send the very file that was previewed.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = withoutEmptyFilePlaceholders(
      new FormData(
        event.currentTarget,
        submitter instanceof HTMLElement ? submitter : null,
      ),
    );
    startTransition(async () => {
      setState(await summaryBalancesAction(state, formData));
    });
  }

  const isDone = state?.status === "done";
  const isError = state?.status === "error";
  const errorFor = (field: SummaryField) =>
    isError && state.errorField === field ? state.message : undefined;
  const hasFieldError = isError && state.errorField !== null;
  const fieldProps = (field: SummaryField, hasHint: boolean) => ({
    "aria-invalid": errorFor(field) === undefined ? undefined : true,
    "aria-describedby": describedBy(field, errorFor(field) !== undefined, hasHint),
    className: CONTROL_CLASS,
  });

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      // A preview describes one file and one account: any change makes it stale.
      onChange={() => setState(null)}
      className="flex max-w-3xl flex-col gap-6"
      noValidate
    >
      <FormField id="summary" label={t("fileLabel")} error={errorFor("summary")}>
        <p id="summary-hint" className="text-neutral-700">
          {t("fileHint", { size: MAX_FILE_BYTES / BYTES_PER_KILOBYTE })}
        </p>
        <input
          id="summary"
          name="summary"
          type="file"
          accept=".csv,.txt,text/csv"
          {...fieldProps("summary", true)}
        />
      </FormField>
      <FormField
        id="accountId"
        label={t("accountLabel")}
        error={errorFor("accountId")}
      >
        <select
          id="accountId"
          name="accountId"
          defaultValue=""
          {...fieldProps("accountId", false)}
        >
          <option value="">{t("chooseAccount")}</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="year" label={t("yearLabel")} error={errorFor("year")}>
        <p id="year-hint" className="text-neutral-700">
          {t("yearHint")}
        </p>
        <input
          id="year"
          name="year"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          {...fieldProps("year", true)}
        />
      </FormField>

      <div aria-live="polite" className="flex flex-col gap-4">
        {state === null || hasFieldError ? null : (
          <p
            role={isError ? "alert" : "status"}
            className={isError ? "font-medium text-red-800" : "font-medium"}
          >
            {isError ? common("error", { message: state.message }) : state.message}
          </p>
        )}
        {state === null ? null : (
          <>
            {state.notes.length === 0 ? null : (
              <section aria-labelledby="notes-heading">
                <h2 id="notes-heading" className="text-lg font-semibold">
                  {t("noteHeading")}
                </h2>
                <ul className="list-disc pl-6">
                  {state.notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              </section>
            )}
            <BalancesTable rows={state.rows} />
            {isError ? null : <ComparisonSection state={state} />}
          </>
        )}
      </div>

      {state?.canCommit === true && !isDone ? (
        <p>{t("replaceWarning")}</p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="preview"
          disabled={isPending || isDone}
          className={BUTTON_CLASS}
        >
          {t("previewSubmit")}
        </button>
        {state?.canCommit === true && !isDone ? (
          <button
            type="submit"
            name="intent"
            value="commit"
            disabled={isPending}
            className={BUTTON_CLASS}
          >
            {t("commitSubmit")}
          </button>
        ) : null}
      </div>
    </form>
  );
}
