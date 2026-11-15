"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "../../../components/button";
import { DataTable } from "../../../components/data-display";
import { FileInput } from "../../../components/file-input";
import { Notice } from "../../../components/notice";
import {
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


function BalancesTable({ rows }: { rows: SummaryBalancesState["rows"] }) {
  const t = useTranslations("summaryBalances");
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="balances-heading" className="flex flex-col gap-2">
      <h2 id="balances-heading" className="text-title font-medium">
        {t("balancesHeading")}
      </h2>
      <DataTable caption={t("balancesCaption")}>
        <thead>
          <tr>
            <th scope="col">
              {t("balancesColumns.month")}
            </th>
            <th scope="col">
              {t("balancesColumns.date")}
            </th>
            <th scope="col" className="text-right">
              {t("balancesColumns.balance")}
            </th>
            <th scope="col">
              {t("balancesColumns.status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.date}>
              <th scope="row">
                {row.month}
              </th>
              <td className="tabular-nums">{row.date}</td>
              <td className="text-right">{row.balance}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </section>
  );
}

function ComparisonSection({ state }: { state: SummaryBalancesState }) {
  const t = useTranslations("summaryBalances");

  return (
    <section aria-labelledby="comparison-heading" className="flex flex-col gap-2">
      <h2 id="comparison-heading" className="text-title font-medium">
        {t("comparisonHeading")}
      </h2>
      {state.isMatching ? <p>{t("comparisonMatches")}</p> : null}
      {state.hasComparison ? null : <p>{t("comparisonNone")}</p>}
      {state.differences.length === 0 ? null : (
        <DataTable caption={t("comparisonCaption")}>
          <thead>
            <tr>
              <th scope="col">
                {t("comparisonColumns.month")}
              </th>
              <th scope="col">
                {t("comparisonColumns.figure")}
              </th>
              <th scope="col" className="text-right">
                {t("comparisonColumns.sheet")}
              </th>
              <th scope="col" className="text-right">
                {t("comparisonColumns.demain")}
              </th>
              <th scope="col" className="text-right">
                {t("comparisonColumns.difference")}
              </th>
            </tr>
          </thead>
          <tbody>
            {state.differences.map((difference) => (
              <tr
                key={`${difference.month}-${difference.figure}`}
                className="border-b border-divider"
              >
                <th scope="row">
                  {difference.month}
                </th>
                <td>{difference.figure}</td>
                <td className="text-right">{difference.sheet}</td>
                <td className="text-right">{difference.demain}</td>
                <td className="text-right">
                  {difference.difference}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
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

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      // A preview describes one file and one account: any change makes it stale.
      onChange={() => setState(null)}
      className="flex max-w-3xl flex-col gap-6"
      noValidate
    >
      <FormField
        id="summary"
        label={t("fileLabel")}
        hint={t("fileHint", { size: MAX_FILE_BYTES / BYTES_PER_KILOBYTE })}
        error={errorFor("summary")}
      >
        <FileInput id="summary" name="summary" accept=".csv,.txt,text/csv" />
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
          className={CONTROL_CLASS}
        >
          <option value="">{t("chooseAccount")}</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="year" label={t("yearLabel")} optional hint={t("yearHint")} error={errorFor("year")}>
        <input
          id="year"
          name="year"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          className={CONTROL_CLASS}
        />
      </FormField>

      <div aria-live="polite" className="flex flex-col gap-4">
        {state === null || hasFieldError ? null : (
          <p
            role={isError ? "alert" : "status"}
            className={isError ? "font-medium text-negative" : "font-medium"}
          >
            {isError ? common("error", { message: state.message }) : state.message}
          </p>
        )}
        {state === null ? null : (
          <>
            {state.notes.length === 0 ? null : (
              <section aria-labelledby="notes-heading">
                <h2 id="notes-heading" className="text-title font-medium">
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

      <div aria-live="polite">
        {state?.canCommit === true && !isDone ? <Notice>{t("replaceWarning")}</Notice> : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          variant="secondary"
          name="intent"
          value="preview"
          disabled={isDone}
          pending={isPending}
          pendingLabel={t("previewSubmitPending")}
        >
          {t("previewSubmit")}
        </Button>
        {state?.canCommit === true && !isDone ? (
          <Button
            type="submit"
            name="intent"
            value="commit"
            pending={isPending}
            pendingLabel={t("commitSubmitPending")}
          >
            {t("commitSubmit")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
