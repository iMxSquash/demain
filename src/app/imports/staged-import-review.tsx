"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useReducer, useRef } from "react";

import {
  emptyFilePlan,
  nextFileToSettle,
  planReview,
} from "../../domain/import-review";
import {
  defaultSavingsAccountId,
  isSelectableSavingsAccount,
} from "../../domain/import-savings";
import type { OverflowAccount } from "../../domain/overflow";
import type {
  ImportAccountOption,
  ImportCategoryOption,
  StagedFile,
} from "./import-form-data";
import { BUTTON_CLASS, CONTROL_CLASS } from "../form-field";
import { initReview, parseOptionalId, reviewReducer } from "./review-state";
import { FileCard } from "./staged-file-card";
import type { RowLookups } from "./staged-row-editor";

interface ReviewBodyProps {
  files: StagedFile[];
  accountId: number;
  accounts: ImportAccountOption[];
  categories: ImportCategoryOption[];
  /** The balances as they were when the files were read: what the first file is planned from. */
  overflowAccounts: OverflowAccount[];
  isReading: boolean;
  onAccountChange: (accountId: number) => void;
}

function ReviewBody({
  files,
  accountId,
  accounts,
  categories,
  overflowAccounts,
  isReading,
  onAccountChange,
}: ReviewBodyProps) {
  const t = useTranslations("imports.staged");
  const accountSelectId = useId();
  const accountHintId = useId();
  const savingsSelectId = useId();
  const savingsHintId = useId();

  const currency = accounts.find((account) => account.id === accountId)?.currency ?? "";
  const receiving = useMemo(() => ({ id: accountId, currency }), [accountId, currency]);
  const [state, dispatch] = useReducer(
    reviewReducer,
    files,
    (staged) => initReview(staged, defaultSavingsAccountId(accounts, receiving)),
  );

  const savingsAccounts = useMemo(
    () =>
      accounts
        .filter((account) => isSelectableSavingsAccount(receiving, account))
        .map(({ id, name }) => ({ id, name })),
    [accounts, receiving],
  );
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );
  const { defaultSavingsAccountId: savingsAccountId } = state;
  const lookups = useMemo<RowLookups>(
    () => ({
      categories,
      savingsAccounts,
      defaultSavingsName:
        savingsAccountId === null ? null : (accountNames.get(savingsAccountId) ?? null),
    }),
    [categories, savingsAccounts, accountNames, savingsAccountId],
  );

  const plans = useMemo(
    () =>
      planReview(state.files, {
        currency,
        defaultSavingsAccountId: savingsAccountId,
        accounts: overflowAccounts,
      }),
    [state.files, currency, savingsAccountId, overflowAccounts],
  );
  const phases = state.files.map((file) => file.phase);
  const isBusy = isReading || phases.includes("importing");

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={accountSelectId}>{t("receivingAccount")}</label>
          <select
            id={accountSelectId}
            value={accountId}
            disabled={isBusy}
            aria-describedby={accountHintId}
            onChange={(event) => onAccountChange(Number(event.currentTarget.value))}
            className={CONTROL_CLASS}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <p id={accountHintId} className="text-sm">
            {t("receivingAccountHint")}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={savingsSelectId}>{t("savingsAccount")}</label>
          <select
            id={savingsSelectId}
            value={savingsAccountId ?? ""}
            disabled={isBusy}
            aria-describedby={savingsHintId}
            onChange={(event) =>
              dispatch({
                type: "setDefaultSavings",
                savingsAccountId: parseOptionalId(event.currentTarget.value),
              })
            }
            className={CONTROL_CLASS}
          >
            <option value="">{t("noSavingsAccount")}</option>
            {savingsAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <p id={savingsHintId} className="text-sm">
            {t("savingsAccountHint")}
          </p>
        </div>
      </div>

      {state.files.map((file, index) => {
        const waitIndex = nextFileToSettle(phases, index);
        return (
          <FileCard
            key={`${index}-${file.fileName}`}
            file={file}
            fileIndex={index}
            plan={plans[index] ?? emptyFilePlan()}
            waitFor={waitIndex === null ? null : (state.files[waitIndex]?.fileName ?? null)}
            accountId={accountId}
            defaultSavingsAccountId={savingsAccountId}
            accountNames={accountNames}
            lookups={lookups}
            isReading={isReading}
            dispatch={dispatch}
          />
        );
      })}
    </>
  );
}

interface StagedImportReviewProps extends Omit<ReviewBodyProps, "isReading"> {
  /** Changes with every reading of the files: what the user edited belongs to one reading. */
  batch: number;
  /** Translated progress while the files are read again; null otherwise. */
  readingText: string | null;
  onClose: () => void;
}

/**
 * The files of an import, one card each, in a native dialog (focus trap,
 * Escape, focus given back). Nothing is recorded until a card's file is
 * imported; closing the dialog drops what was not.
 */
export function StagedImportReview({
  batch,
  readingText,
  onClose,
  ...body
}: StagedImportReviewProps) {
  const t = useTranslations("imports.staged");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;
    dialog.showModal();
    // A screen reader starts on the title, not in the middle of the first table.
    titleRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto max-h-[90vh] w-[min(80rem,95vw)] overflow-y-auto rounded border border-neutral-500 bg-white p-6 text-neutral-900 backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4">
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="text-xl font-semibold"
        >
          {t("title")}
        </h2>
        <p>{t("intro")}</p>
        <div role="status">
          {readingText === null ? null : <p className="font-medium">{readingText}</p>}
        </div>
        <ReviewBody
          key={batch}
          {...body}
          isReading={readingText !== null}
        />
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className={`${BUTTON_CLASS} self-start`}
        >
          {t("close")}
        </button>
      </div>
    </dialog>
  );
}
