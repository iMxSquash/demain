"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { CSV_DELIMITERS } from "../../domain/import-csv";
import { CONTROL_CLASS, FormField } from "../form-field";
import { migrationAction } from "./actions";
import {
  MAX_FILE_BYTES,
  MAX_TAB_FILES,
  withoutEmptyFilePlaceholders,
  type MigrationFormState,
} from "./migration-form-data";

export interface AccountOption {
  id: number;
  name: string;
}

const DELIMITER_KEY = { ";": "semicolon", ",": "comma", "\t": "tab" } as const;
const BUTTON_CLASS =
  "min-h-11 rounded border border-neutral-900 px-4 font-medium disabled:opacity-60";
const BYTES_PER_KILOBYTE = 1024;
// Ticking the confirmation box is not a change to what was previewed.
const CONFIRMATION_FIELD = "confirmReview";

/** A labelled control with a hint that assistive technology reads after the label. */
function HintedField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <FormField id={id} label={label}>
      <p id={`${id}-hint`} className="text-neutral-700">
        {hint}
      </p>
      {children}
    </FormField>
  );
}

function AccountSelect({
  name,
  label,
  hint,
  accounts,
}: {
  name: "checkingId" | "savingsId";
  label: string;
  hint?: string;
  accounts: AccountOption[];
}) {
  const t = useTranslations("migration");
  const select = (
    <select
      id={name}
      name={name}
      defaultValue=""
      aria-describedby={hint === undefined ? undefined : `${name}-hint`}
      className={CONTROL_CLASS}
    >
      <option value="">{t("chooseAccount")}</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}
        </option>
      ))}
    </select>
  );

  return hint === undefined ? (
    <FormField id={name} label={label}>
      {select}
    </FormField>
  ) : (
    <HintedField id={name} label={label} hint={hint}>
      {select}
    </HintedField>
  );
}

function MessageList({
  id,
  heading,
  items,
}: {
  id: string;
  heading: string;
  items: string[];
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold">
        {heading}
      </h2>
      <ul className="list-disc pl-6">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function SplitsTable({ splits }: { splits: MigrationFormState["splits"] }) {
  const t = useTranslations("migration");
  if (splits.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-left">
        <caption className="pb-2 text-left font-semibold">
          {t("splitsHeading")}
        </caption>
        <thead>
          <tr className="border-b border-neutral-500">
            <th scope="col" className="py-2 pr-4">
              {t("splitsColumns.location")}
            </th>
            <th scope="col" className="py-2 pr-4">
              {t("splitsColumns.date")}
            </th>
            <th scope="col" className="py-2 pr-4 text-right">
              {t("splitsColumns.amount")}
            </th>
            <th scope="col" className="py-2">
              {t("splitsColumns.parts")}
            </th>
          </tr>
        </thead>
        <tbody>
          {splits.map((split, index) => (
            <tr key={index} className="border-b border-neutral-300">
              <th scope="row" className="py-2 pr-4 font-medium">
                {split.location}
              </th>
              <td className="py-2 pr-4 tabular-nums">{split.date}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {split.amount}
              </td>
              <td className="py-2">{split.parts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DifferencesTable({
  differences,
}: {
  differences: MigrationFormState["differences"];
}) {
  const t = useTranslations("migration");
  if (differences.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-left">
        <caption className="pb-2 text-left font-semibold">
          {t("verificationHeading")}
        </caption>
        <thead>
          <tr className="border-b border-neutral-500">
            <th scope="col" className="py-2 pr-4">
              {t("verificationColumns.month")}
            </th>
            <th scope="col" className="py-2 pr-4">
              {t("verificationColumns.figure")}
            </th>
            <th scope="col" className="py-2 pr-4 text-right">
              {t("verificationColumns.sheet")}
            </th>
            <th scope="col" className="py-2 pr-4 text-right">
              {t("verificationColumns.demain")}
            </th>
            <th scope="col" className="py-2 text-right">
              {t("verificationColumns.difference")}
            </th>
          </tr>
        </thead>
        <tbody>
          {differences.map((difference, index) => (
            <tr key={index} className="border-b border-neutral-300">
              <th scope="row" className="py-2 pr-4 font-medium">
                {difference.month}
              </th>
              <td className="py-2 pr-4">{difference.figure}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {difference.sheet}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {difference.demain}
              </td>
              <td className="py-2 text-right tabular-nums">
                {difference.difference}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MigrationForm({ accounts }: { accounts: AccountOption[] }) {
  const t = useTranslations("migration");
  const common = useTranslations("common");
  const [state, setState] = useState<MigrationFormState | null>(null);
  const [isPending, startTransition] = useTransition();

  // The action is called by hand rather than through the form's `action`: React
  // would reset the form afterwards and the chosen files would be lost, while
  // the migrate button must send the very files that were previewed.
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
      setState(await migrationAction(state, formData));
    });
  }

  // A preview describes one set of files and choices: any change makes it stale.
  function discardPreview(event: ChangeEvent<HTMLFormElement>) {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === CONFIRMATION_FIELD) {
      return;
    }
    setState(null);
  }

  const isDone = state?.status === "done";
  const isError = state?.status === "error";

  return (
    <form
      onSubmit={handleSubmit}
      onChange={discardPreview}
      className="flex max-w-3xl flex-col gap-6"
      noValidate
    >
      <HintedField
        id="tabs"
        label={t("tabsLabel")}
        hint={t("tabsHint", {
          max: MAX_TAB_FILES,
          size: MAX_FILE_BYTES / BYTES_PER_KILOBYTE,
        })}
      >
        <input
          id="tabs"
          name="tabs"
          type="file"
          multiple
          accept=".csv,.txt,text/csv"
          aria-describedby="tabs-hint"
          className={CONTROL_CLASS}
        />
      </HintedField>
      <HintedField
        id="summary"
        label={t("summaryLabel")}
        hint={t("summaryHint")}
      >
        <input
          id="summary"
          name="summary"
          type="file"
          accept=".csv,.txt,text/csv"
          aria-describedby="summary-hint"
          className={CONTROL_CLASS}
        />
      </HintedField>

      <AccountSelect
        name="checkingId"
        label={t("checkingLabel")}
        accounts={accounts}
      />
      <AccountSelect
        name="savingsId"
        label={t("savingsLabel")}
        hint={t("savingsHint")}
        accounts={accounts}
      />

      <HintedField
        id="openingDate"
        label={t("openingDateLabel")}
        hint={t("openingDateHint")}
      >
        <input
          id="openingDate"
          name="openingDate"
          type="date"
          aria-describedby="openingDate-hint"
          className={CONTROL_CLASS}
        />
      </HintedField>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-lg font-semibold">
          {t("openingBalancesHeading")}
        </legend>
        <p>{t("openingBalancesHint")}</p>
        {accounts.map((account) => (
          <FormField
            key={account.id}
            id={`balance-${account.id}`}
            label={account.name}
          >
            <input
              id={`balance-${account.id}`}
              name={`balance-${account.id}`}
              inputMode="decimal"
              autoComplete="off"
              className={CONTROL_CLASS}
            />
          </FormField>
        ))}
      </fieldset>

      <HintedField id="year" label={t("yearLabel")} hint={t("yearHint")}>
        <input
          id="year"
          name="year"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          aria-describedby="year-hint"
          className={CONTROL_CLASS}
        />
      </HintedField>
      <FormField id="delimiter" label={t("delimiterLabel")}>
        <select
          id="delimiter"
          name="delimiter"
          defaultValue=""
          className={CONTROL_CLASS}
        >
          <option value="">{t("delimiterAuto")}</option>
          {CSV_DELIMITERS.map((delimiter) => (
            <option key={delimiter} value={delimiter}>
              {t(`delimiters.${DELIMITER_KEY[delimiter]}`)}
            </option>
          ))}
        </select>
      </FormField>

      <div aria-live="polite" className="flex flex-col gap-4">
        {state === null ? null : (
          <p
            role={isError ? "alert" : "status"}
            className={isError ? "font-medium text-red-800" : "font-medium"}
          >
            {isError ? common("error", { message: state.message }) : state.message}
          </p>
        )}
        {state === null ? null : (
          <>
            <MessageList
              id="blocking-heading"
              heading={t("blockingHeading")}
              items={state.blocking}
            />
            <MessageList
              id="review-heading"
              heading={t("reviewHeading")}
              items={state.review}
            />
            <MessageList
              id="plan-heading"
              heading={t("planHeading")}
              items={state.plan}
            />
            <SplitsTable splits={state.splits} />
            {state.isMatching ? <p>{t("verificationMatches")}</p> : null}
            <DifferencesTable differences={state.differences} />
          </>
        )}
      </div>

      {state?.canCommit === true && state.needsConfirmation && !isDone ? (
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name={CONFIRMATION_FIELD}
            className="size-5"
          />
          {t("confirmReview")}
        </label>
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
        {isDone ? (
          <Link
            href="/categories"
            className="inline-flex min-h-11 items-center underline"
          >
            {t("toCategorize")}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
