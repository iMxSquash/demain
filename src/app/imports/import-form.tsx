"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";

import type { AssertionLinkSnapshot } from "../../domain/import-assertions";
import { CSV_DATE_FORMATS, CSV_DELIMITERS } from "../../domain/import-csv";
import {
  withOverflowChoice,
  type OverflowTarget,
  type PendingOverflow,
} from "../../domain/import-overflow";
import type { AccountRef, OverflowAccount } from "../../domain/overflow";
import { BUTTON_CLASS, CONTROL_CLASS, FormField } from "../form-field";
import { importAction } from "./actions";
import {
  AMOUNT_KINDS,
  type ImportFormState,
  type ImportView,
  type MappingFields,
  failedStagedFile,
  type ColumnChoiceFields,
  type StagedFile,
} from "./import-form-data";
import { stageFileAction } from "./stage-actions";
import { StagedImportReview } from "./staged-import-review";
import { stageSources, type ColumnChoicesBySource } from "./stage-sources";

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

interface Staging {
  current: number;
  total: number;
  name: string;
}

interface Review {
  accountId: number;
  /** The files as chosen, kept to read them again when the account changes. */
  sources: File[];
  files: StagedFile[];
  /** The balances when the files were read: the page refreshes after each import, the plan must not. */
  overflowAccounts: OverflowAccount<AccountRef>[];
  /** The same balances without the choices made so far: what a file needs is read from them. */
  storedOverflowAccounts: OverflowAccount<AccountRef>[];
  /** The balance assertions and the movements when the files were read: the page refreshes after each import, the comparison must not. */
  assertionSnapshot: AssertionLinkSnapshot;
  /** The overflow accounts chosen so far: written with the first file imported, never before. */
  overflowChoices: PendingOverflow[];
  /** The columns chosen by hand, by position in `sources`: a file is read again with its own. */
  columnChoices: ColumnChoicesBySource;
  /** Counts the readings of the files: what was edited belongs to one of them. */
  batch: number;
}

export function ImportForm({
  accounts,
  categories,
  overflowAccounts,
  assertionSnapshot,
}: ImportView & { assertionSnapshot: AssertionLinkSnapshot }) {
  const t = useTranslations("imports");
  const common = useTranslations("common");
  const [state, setState] = useState<ImportFormState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [staging, setStaging] = useState<Staging | null>(null);
  const [review, setReview] = useState<Review | null>(null);

  async function stageOne(
    file: File,
    accountText: string,
    columns: ColumnChoiceFields | undefined,
  ): Promise<StagedFile> {
    const formData = new FormData();
    formData.set("accountId", accountText);
    formData.set("file", file);
    for (const [name, value] of Object.entries(columns ?? {})) formData.set(name, value);
    try {
      return await stageFileAction(formData);
    } catch (error) {
      // A file that fails must not stop the next ones: it gets a card that says so.
      console.error("Import staging failed", error);
      return failedStagedFile(file.name, t("staged.readFailed"));
    }
  }

  // One file after the other, as if each had been sent alone: nothing is recorded here.
  async function stageFiles(
    files: File[],
    accountText: string,
    choices: ColumnChoicesBySource,
  ) {
    const staged = await stageSources(
      files,
      choices,
      (file, columns) => stageOne(file, accountText, columns),
      (current, file) =>
        setStaging({ current, total: files.length, name: file.name }),
    );
    setStaging(null);
    return staged;
  }

  // The duplicates and the currency depend on the account: the files are read again for the new one.
  async function changeReviewAccount(accountId: number) {
    if (review === null) return;
    const { sources, columnChoices } = review;
    setReview({ ...review, accountId });
    const files = await stageFiles(sources, String(accountId), columnChoices);
    // Closed while the files were read: it stays closed.
    setReview((current) =>
      current === null
        ? null
        : {
            ...current,
            files,
            overflowAccounts,
            storedOverflowAccounts: overflowAccounts,
            assertionSnapshot,
            // The balances are back to the stored ones: the choices go with them.
            overflowChoices: [],
            batch: current.batch + 1,
          },
    );
  }

  // The choice is only remembered: the plan of the review follows it, and it is
  // saved with the first file imported (an account to create is referred to by its name).
  function chooseOverflow(accountId: number, target: OverflowTarget) {
    setReview((current) => {
      if (current === null) return null;
      const choice = { accountId, target };
      return {
        ...current,
        overflowAccounts: withOverflowChoice(current.overflowAccounts, choice),
        overflowChoices: [...current.overflowChoices, choice],
      };
    });
  }

  // One file again, with the columns the user chose: the others are left as they are.
  async function restageSource(sourceIndex: number, choices: ColumnChoiceFields) {
    const source = review?.sources[sourceIndex];
    if (review === null || source === undefined) {
      return failedStagedFile("", t("staged.readFailed"));
    }
    const staged = await stageOne(source, String(review.accountId), choices);
    // Remembered only when the reading worked: a failed one leaves the earlier choices in force.
    if (staged.status !== "failed") {
      setReview((current) =>
        current === null
          ? null
          : { ...current, columnChoices: { ...current.columnChoices, [sourceIndex]: choices } },
      );
    }
    return staged;
  }

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
      overflowChoices: [],
      columnChoices: {},
      batch: 1,
    });
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
    <>
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
            multiple
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
          {staging === null || review !== null ? null : (
            <p role="status" className="font-medium">
              {t("staged.reading", { ...staging })}
            </p>
          )}
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
          <button
            type="submit"
            name="intent"
            value="preview"
            disabled={isPending || isDone || staging !== null}
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
      {/* Outside the form: Enter in a cell of the review must not submit it. */}
      {review === null ? null : (
        <StagedImportReview
          batch={review.batch}
          files={review.files}
          accountId={review.accountId}
          accounts={accounts}
          categories={categories}
          overflowAccounts={review.overflowAccounts}
          storedOverflowAccounts={review.storedOverflowAccounts}
          assertionSnapshot={review.assertionSnapshot}
          overflowChoices={review.overflowChoices}
          readingText={
            staging === null ? null : t("staged.reading", { ...staging })
          }
          onAccountChange={changeReviewAccount}
          onOverflowChosen={chooseOverflow}
          onRestage={restageSource}
          onClose={() => setReview(null)}
        />
      )}
    </>
  );
}
