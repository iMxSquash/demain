"use client";

import { useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from "react";

import { overflowDemands } from "../../domain/import-overflow";
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
  ColumnChoiceFields,
  ImportAccountOption,
  ImportCategoryOption,
  StagedFile,
} from "./import-form-data";
import { BUTTON_CLASS, CONTROL_CLASS } from "../form-field";
import { OverflowPrompt } from "./overflow-prompt";
import { rereadFile } from "./reread-file";
import { initReview, parseOptionalId, reviewReducer } from "./review-state";
import { FileCard } from "./staged-file-card";
import type { RowLookups } from "./staged-row-editor";

interface ReviewBodyProps {
  files: StagedFile[];
  /** Changes with every reading of all the files: the review then follows the new rows. */
  batch: number;
  accountId: number;
  accounts: ImportAccountOption[];
  categories: ImportCategoryOption[];
  /** The balances as they were when the files were read: what the first file is planned from. */
  overflowAccounts: OverflowAccount[];
  isReading: boolean;
  accountSelectRef: RefObject<HTMLSelectElement | null>;
  onAccountChange: (accountId: number) => void;
  /** An overflow account was saved for a savings account: the plan follows it. */
  onOverflowChosen: (
    accountId: number,
    overflowAccountId: number,
    created: OverflowAccount | undefined,
  ) => void;
  /** Reads a file again with the columns the user chose; `sourceIndex` is its place among the files chosen. */
  onRestage: (sourceIndex: number, choices: ColumnChoiceFields) => Promise<StagedFile>;
}

function ReviewBody({
  files,
  batch,
  accountId,
  accounts,
  categories,
  overflowAccounts,
  isReading,
  accountSelectRef,
  onAccountChange,
  onOverflowChosen,
  onRestage,
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
  // All the files were read again (another account): what the user corrected follows its line.
  const [seenBatch, setSeenBatch] = useState(batch);
  if (seenBatch !== batch) {
    setSeenBatch(batch);
    dispatch({
      type: "replaceAll",
      staged: files,
      defaultSavingsAccountId: defaultSavingsAccountId(accounts, receiving),
    });
  }

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
  const demands = useMemo(() => overflowDemands(plans.map(({ shortfalls }) => shortfalls)), [plans]);
  const phases = state.files.map((file) => file.phase);
  // Index of the file being read again with other columns.
  const [restaging, setRestaging] = useState<number | null>(null);
  const isBusy = isReading || restaging !== null || phases.includes("importing");

  // Resolves to false when the file could not be read again: it then keeps its
  // rows, says why, and is not imported until a reading succeeds.
  async function restageFile(
    fileIndex: number,
    choices: ColumnChoiceFields,
  ): Promise<boolean> {
    const file = state.files[fileIndex];
    if (file === undefined) return false;
    setRestaging(fileIndex);
    try {
      return await rereadFile(
        fileIndex,
        () => onRestage(file.sourceIndex, choices),
        dispatch,
      );
    } finally {
      setRestaging(null);
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={accountSelectId}>{t("receivingAccount")}</label>
          <select
            id={accountSelectId}
            ref={accountSelectRef}
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

      <OverflowPrompt
        demands={demands}
        accounts={accounts}
        receivingAccountId={accountId}
        isBusy={isBusy}
        onChosen={onOverflowChosen}
      />

      {state.files.map((file, index) => {
        const waitIndex = nextFileToSettle(phases, index);
        return (
          <FileCard
            key={`${batch}-${index}-${file.fileName}`}
            file={file}
            fileIndex={index}
            plan={plans[index] ?? emptyFilePlan()}
            waitFor={waitIndex === null ? null : (state.files[waitIndex]?.fileName ?? null)}
            accountId={accountId}
            defaultSavingsAccountId={savingsAccountId}
            accountNames={accountNames}
            lookups={lookups}
            isReading={isBusy}
            onChangeColumns={(choices) => restageFile(index, choices)}
            dispatch={dispatch}
          />
        );
      })}
    </>
  );
}

interface StagedImportReviewProps
  extends Omit<ReviewBodyProps, "isReading" | "accountSelectRef"> {
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
  onAccountChange,
  ...body
}: StagedImportReviewProps) {
  const t = useTranslations("imports.staged");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const accountSelectRef = useRef<HTMLSelectElement>(null);
  // The batch shown when the user changed the account; null when no change awaits its reading.
  const accountChangedAtBatch = useRef<number | null>(null);
  const titleId = useId();
  const isReading = readingText !== null;

  useEffect(() => {
    // Rereading disables the select and replaces the body: the focus would fall on
    // the page (WCAG 2.4.3), so it is given back once the new body is ready.
    if (isReading || accountChangedAtBatch.current === null) return;
    if (accountChangedAtBatch.current === batch) return;
    accountChangedAtBatch.current = null;
    accountSelectRef.current?.focus();
  }, [batch, isReading]);

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
          {...body}
          batch={batch}
          isReading={isReading}
          accountSelectRef={accountSelectRef}
          onAccountChange={(accountId) => {
            accountChangedAtBatch.current = batch;
            onAccountChange(accountId);
          }}
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
