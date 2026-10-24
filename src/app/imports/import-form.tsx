"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";

import { CSV_DATE_FORMATS, CSV_DELIMITERS } from "../../domain/import-csv";
import { CONTROL_CLASS, FormField } from "../form-field";
import { importAction } from "./actions";
import {
  AMOUNT_KINDS,
  type ImportFormState,
  type MappingFields,
} from "./import-form-data";

export interface AccountOption {
  id: number;
  name: string;
}

const DELIMITER_KEY = { ";": "semicolon", ",": "comma", "\t": "tab" } as const;
const BUTTON_CLASS =
  "min-h-11 rounded border border-neutral-900 px-4 font-medium disabled:opacity-60";

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
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className={CONTROL_CLASS}
      >
        {values.map((value) => (
          <option key={value} value={value}>
            {optionLabel(value)}
          </option>
        ))}
      </select>
    </FormField>
  );
}

function MappingFieldset({ fields }: { fields: MappingFields }) {
  const t = useTranslations("imports");

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-lg font-semibold">{t("mappingHeading")}</legend>
      <p>{t("mappingHint")}</p>
      <input type="hidden" name="mappingPresent" value="1" />
      <ChoiceSelect
        name="delimiter"
        values={CSV_DELIMITERS}
        defaultValue={fields.delimiter}
        optionLabel={(value) => t(`delimiters.${DELIMITER_KEY[value]}`)}
      />
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          name="hasHeader"
          defaultChecked={fields.hasHeader}
          className="size-5"
        />
        {t("hasHeader")}
      </label>
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
        {items.map((item) => (
          <li key={item}>{item}</li>
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
        <caption className="pb-2 text-left font-semibold">
          {t("rawHeading")}
        </caption>
        <thead>
          <tr className="border-b border-neutral-500">
            {Array.from({ length: width }, (_, index) => (
              <th key={index} scope="col" className="py-2 pr-4">
                {t("rawColumn", { number: index + 1 })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-neutral-300">
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

export function ImportForm({ accounts }: { accounts: AccountOption[] }) {
  const t = useTranslations("imports");
  const common = useTranslations("common");
  const [state, setState] = useState<ImportFormState | null>(null);
  const [isPending, startTransition] = useTransition();

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
    startTransition(async () => {
      setState(await importAction(state, formData));
    });
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
        <select
          id="accountId"
          name="accountId"
          defaultValue={state?.accountId ?? ""}
          onChange={discardPreview}
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
      <FormField id="file" label={t("fileLabel")}>
        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,.ofx,.qfx,.txt,text/csv,application/x-ofx"
          onChange={discardPreview}
          className={CONTROL_CLASS}
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
        {state === null ? null : (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={
              state.status === "error"
                ? "font-medium text-red-800"
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
            />
          </>
        )}
        {state !== null && state.sampleRows.length > 0 ? (
          <table className="border-collapse text-left">
            <caption className="pb-2 text-left font-semibold">
              {t("sampleHeading")}
            </caption>
            <thead>
              <tr className="border-b border-neutral-500">
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
                <tr key={index} className="border-b border-neutral-300">
                  <td className="py-2 pr-4 tabular-nums">{row.date}</td>
                  <th scope="row" className="py-2 pr-4 font-medium">
                    {row.label}
                  </th>
                  <td className="py-2 text-right tabular-nums">{row.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

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
        {state?.canImport === true && !isDone ? (
          <button
            type="submit"
            name="intent"
            value="import"
            disabled={isPending}
            className={BUTTON_CLASS}
          >
            {t("importSubmit")}
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
