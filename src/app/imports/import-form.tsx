"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "../../components/button";
import { Checkbox } from "../../components/checkbox";
import { FileInput } from "../../components/file-input";
import { Notice } from "../../components/notice";
import type { AssertionLinkSnapshot } from "../../domain/import-assertions";
import type { EnteredPaymentEntry } from "../../ledger/planned-matching";
import { CSV_DATE_FORMATS, CSV_DELIMITERS } from "../../domain/import-csv";
import { CONTROL_CLASS, FormField } from "../form-field";
import { importAction } from "./actions";
import {
  AMOUNT_KINDS,
  type ImportFormState,
  type ImportView,
  type MappingFields,
} from "./import-form-data";
import { useReviewSession } from "./review-session";
import { useStaging } from "./use-staging";
import { Select } from "../../components/select";

const DELIMITER_KEY = { ";": "semicolon", ",": "comma", "\t": "tab" } as const;

type ColumnField =
  | "dateColumn"
  | "labelColumn"
  | "amountColumn"
  | "debitColumn"
  | "creditColumn";

function ColumnInput({
  name,
  fields,
}: {
  name: ColumnField;
  fields: MappingFields;
}) {
  const t = useTranslations("imports");

  return (
    <FormField id={name} label={t(name)}>
      <input
        id={name}
        name={name}
        inputMode="numeric"
        defaultValue={fields[name]}
        className={CONTROL_CLASS}
      />
    </FormField>
  );
}

function ChoiceSelect<T extends string>({
  name,
  values,
  defaultValue,
  optionLabel,
}: {
  name: "delimiter" | "dateFormat" | "amountKind";
  values: readonly T[];
  defaultValue: T;
  optionLabel: (value: T) => string;
}) {
  const t = useTranslations("imports");

  return (
    <FormField id={name} label={t(name)}>
      <Select
        id={name}
        name={name}
        defaultValue={defaultValue}
      >
        {values.map((value) => (
          <option key={value} value={value}>
            {optionLabel(value)}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

function MappingFieldset({ fields }: { fields: MappingFields }) {
  const t = useTranslations("imports");

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-title font-medium">{t("mappingHeading")}</legend>
      <p>{t("mappingHint")}</p>
      <input type="hidden" name="mappingPresent" value="1" />
      <ChoiceSelect
        name="delimiter"
        values={CSV_DELIMITERS}
        defaultValue={fields.delimiter}
        optionLabel={(value) => t(`delimiters.${DELIMITER_KEY[value]}`)}
      />
      <Checkbox
        name="hasHeader"
        defaultChecked={fields.hasHeader}
        label={t("hasHeader")}
      />
      <ColumnInput name="dateColumn" fields={fields} />
      <ChoiceSelect
        name="dateFormat"
        values={CSV_DATE_FORMATS}
        defaultValue={fields.dateFormat}
        optionLabel={(value) => t(`dateFormats.${value}`)}
      />
      <ColumnInput name="labelColumn" fields={fields} />
      <ChoiceSelect
        name="amountKind"
        values={AMOUNT_KINDS}
        defaultValue={fields.amountKind}
        optionLabel={(value) => t(`amountKinds.${value}`)}
      />
      <ColumnInput name="amountColumn" fields={fields} />
      <ColumnInput name="debitColumn" fields={fields} />
      <ColumnInput name="creditColumn" fields={fields} />
    </fieldset>
  );
}

function MessageList({
  id,
  heading,
  items,
  asNotices = false,
}: {
  id: string;
  heading: string;
  items: string[];
  /** Each item is a warning: it opens with "Warning:" instead of a bullet. */
  asNotices?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-title font-medium">
        {heading}
      </h2>
      <ul className="flex flex-col gap-2 pt-2">
        {items.map((item) => (
          <li key={item}>{asNotices ? <Notice>{item}</Notice> : item}</li>
        ))}
      </ul>
    </section>
  );
}

function RawRows({ rows }: { rows: string[][] }) {
  const t = useTranslations("imports");
  const width = Math.max(...rows.map((row) => row.length));

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-left">
        <caption className="pb-2 text-left font-medium">
          {t("rawHeading")}
        </caption>
        <thead>
          <tr className="border-b border-border-control">
            {Array.from({ length: width }, (_, index) => (
              <th key={index} scope="col" className="py-2 pr-4">
                {t("rawColumn", { number: index + 1 })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-divider">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-2 pr-4">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ImportForm({
  accounts,
  overflowAccounts,
  assertionSnapshot,
  enteredPayments,
}: Pick<ImportView, "accounts" | "overflowAccounts"> & {
  assertionSnapshot: AssertionLinkSnapshot;
  enteredPayments: EnteredPaymentEntry[];
}) {
  const t = useTranslations("imports");
  const common = useTranslations("common");
  const [state, setState] = useState<ImportFormState | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { setReview } = useReviewSession();
  const { staging, stageFiles } = useStaging();

  async function stageThenReview(
    files: File[],
    accountText: string,
    fallback: () => void,
  ) {
    const staged = await stageFiles(files, accountText, {});
    // A lone CSV whose columns are not found goes back to the mapping form.
    if (files.length === 1 && staged[0]?.needsMapping === true) {
      fallback();
      return;
    }
    setReview({
      accountId: Number(accountText),
      sources: files,
      files: staged,
      overflowAccounts,
      storedOverflowAccounts: overflowAccounts,
      assertionSnapshot,
      enteredPayments,
      overflowChoices: [],
      columnChoices: {},
      batch: 1,
    });
    router.push("/imports/review");
  }

  // The action is called by hand rather than through the form's `action`: React
  // would reset the form afterwards and the chosen file would be lost, while the
  // import button must send the very file that was previewed.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(
      event.currentTarget,
      submitter instanceof HTMLElement ? submitter : null,
    );
    const files = formData
      .getAll("file")
      .filter((file): file is File => file instanceof File && file.size > 0);
    const accountText = String(formData.get("accountId") ?? "");
    const importWithMapping = () =>
      startTransition(async () => {
        setState(await importAction(state, formData));
      });
    // Any readable file opens the review; the mapping form takes over once it has columns to ask for.
    const isMappingSubmitted = formData.get("mappingPresent") === "1";
    if (files.length > 0 && accountText !== "" && !isMappingSubmitted) {
      setState(null);
      void stageThenReview(files, accountText, importWithMapping);
      return;
    }
    importWithMapping();
  }

  // A preview describes one file and one account: any change makes it stale.
  const discardPreview = () => setState(null);
  const isDone = state?.status === "done";

  return (
    <form
      onSubmit={handleSubmit}
      className="flex max-w-3xl flex-col gap-6"
      noValidate
    >
      <FormField id="accountId" label={t("accountLabel")}>
        <Select
          id="accountId"
          name="accountId"
          defaultValue={state?.accountId ?? ""}
          onChange={discardPreview}
        >
          <option value="">{t("chooseAccount")}</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id="file" label={t("fileLabel")} hint={t("fileHint")}>
        <FileInput
          id="file"
          name="file"
          multiple
          accept=".csv,.ofx,.qfx,.txt,text/csv,application/x-ofx"
          onChange={discardPreview}
        />
      </FormField>

      {state?.format === "csv" && state.mapping !== null ? (
        <>
          {state.rawRows.length > 0 ? <RawRows rows={state.rawRows} /> : null}
          <MappingFieldset
            key={JSON.stringify(state.mapping)}
            fields={state.mapping}
          />
        </>
      ) : null}

      <div aria-live="polite" className="flex flex-col gap-4">
        {staging === null ? null : (
          <p role="status" className="font-medium">
            {t("staged.reading", { ...staging })}
          </p>
        )}
        {state === null ? null : (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={
              state.status === "error"
                ? "font-medium text-negative"
                : "font-medium"
            }
          >
            {state.status === "error"
              ? common("error", { message: state.message })
              : state.message}
          </p>
        )}
        {state === null ? null : (
          <>
            <MessageList
              id="problems-heading"
              heading={t("problemsHeading")}
              items={state.problems}
            />
            <MessageList
              id="warnings-heading"
              heading={t("warningsHeading")}
              items={state.warnings}
              asNotices
            />
          </>
        )}
        {state !== null && state.sampleRows.length > 0 ? (
          <table className="border-collapse text-left">
            <caption className="pb-2 text-left font-medium">
              {t("sampleHeading")}
            </caption>
            <thead>
              <tr className="border-b border-border-control">
                <th scope="col" className="py-2 pr-4">
                  {t("columns.date")}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t("columns.label")}
                </th>
                <th scope="col" className="py-2 text-right">
                  {t("columns.amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {state.sampleRows.map((row, index) => (
                <tr key={index} className="border-b border-divider">
                  <td className="py-2 pr-4 tabular-nums">{row.date}</td>
                  <th scope="row" className="py-2 pr-4 font-medium">
                    {row.label}
                  </th>
                  <td className="py-2 text-right tabular-nums">
                    {row.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          variant="secondary"
          name="intent"
          value="preview"
          disabled={isDone || staging !== null}
          pending={isPending}
          pendingLabel={t("previewSubmitPending")}
        >
          {t("previewSubmit")}
        </Button>
        {state?.canImport === true && !isDone ? (
          <Button
            type="submit"
            name="intent"
            value="import"
            pending={isPending}
            pendingLabel={t("importSubmitPending")}
          >
            {t("importSubmit")}
          </Button>
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
