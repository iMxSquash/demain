"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useReducer, useRef, useState, type RefObject } from "react";

import { Button } from "../../components/button";
import { linkReviewAssertions, type AssertionLinkSnapshot } from "../../domain/import-assertions";
import {
  choicesForShortfalls,
  overflowDemands,
  type OverflowTarget,
  type PendingOverflow,
} from "../../domain/import-overflow";
import {
  emptyFilePlan,
  nextFileToSettle,
  planReview,
  processingOrder,
} from "../../domain/import-review";
import {
  defaultSavingsAccountId,
  firstMovementDate,
  isSelectableSavingsAccount,
  lastMovementDate,
} from "../../domain/import-savings";
import type { AccountRef, OverflowAccount } from "../../domain/overflow";
import type {
  ColumnChoiceFields,
  ImportAccountOption,
  ImportCategoryOption,
  StagedFile,
} from "./import-form-data";
import type { EnteredPaymentEntry } from "../../ledger/planned-matching";
import {
  choiceKey,
  enteredMatchesOf,
  NO_ENTERED_CHOICES,
  replacedMovementsByFile,
  settleEnteredChoices,
  type EnteredChoices,
  type EnteredMatch,
} from "./entered-payments";
import { OverflowPrompt } from "./overflow-prompt";
import { rereadFile } from "./reread-file";
import { initReview, parseOptionalId, reviewReducer } from "./review-state";
import { FileCard } from "./staged-file-card";
import type { RowLookups } from "./staged-row-editor";
import { Select, type SelectHandle } from "../../components/select";

interface ReviewBodyProps {
  files: StagedFile[];
  /** Changes with every reading of all the files: the review then follows the new rows. */
  batch: number;
  accountId: number;
  accounts: ImportAccountOption[];
  categories: ImportCategoryOption[];
  /** The balances as they were when the files were read: what the first file is planned from. */
  overflowAccounts: OverflowAccount<AccountRef>[];
  /** The balances as stored: what each file needs is read from them, not from the choices made. */
  storedOverflowAccounts: OverflowAccount<AccountRef>[];
  /** The assertions and movements as they were when the files were read: what each file is compared with. */
  assertionSnapshot: AssertionLinkSnapshot;
  /** The entries marked as paid when the files were read: a bank row may replace one. */
  enteredPayments: readonly EnteredPaymentEntry[];
  isReading: boolean;
  accountSelectRef: RefObject<SelectHandle | null>;
  onAccountChange: (accountId: number) => void;
  /** What the user chose for the accounts whose surplus has nowhere to go: kept until a file is imported. */
  overflowChoices: readonly PendingOverflow[];
  /** An overflow account was chosen for a savings account: the plan follows it, nothing is saved yet. */
  onOverflowChosen: (accountId: number, target: OverflowTarget) => void;
  /** Reads a file again with the columns the user chose; `sourceIndex` is its place among the files chosen. */
  onRestage: (sourceIndex: number, choices: ColumnChoiceFields) => Promise<StagedFile>;
  /** Leaves the review: what was not imported is dropped. */
  onLeave: () => void;
}

function ReviewBody({
  files,
  batch,
  accountId,
  accounts,
  categories,
  overflowAccounts,
  storedOverflowAccounts,
  assertionSnapshot,
  enteredPayments,
  isReading,
  accountSelectRef,
  onAccountChange,
  overflowChoices,
  onOverflowChosen,
  onRestage,
  onLeave,
}: ReviewBodyProps) {
  const t = useTranslations("imports.staged");
  const accountSelectId = useId();
  const accountHintId = useId();
  const savingsSelectId = useId();
  const savingsHintId = useId();
  const orderHeadingId = useId();

  const currency = accounts.find((account) => account.id === accountId)?.currency ?? "";
  const receiving = useMemo(() => ({ id: accountId, currency }), [accountId, currency]);
  const [state, dispatch] = useReducer(reviewReducer, files, (staged) =>
    initReview(staged, defaultSavingsAccountId(accounts, receiving)),
  );
  // All the files were read again (another account): what the user corrected follows its line.
  const [seenBatch, setSeenBatch] = useState(batch);
  // The replacement choices of each file, by its position, and the entries each recorded file
  // replaced: the snapshot still holds them until the files are read again.
  const [enteredChoices, setEnteredChoices] = useState<ReadonlyMap<number, EnteredChoices>>(
    new Map(),
  );
  const [replacedByFile, setReplacedByFile] = useState<ReadonlyMap<number, readonly number[]>>(
    new Map(),
  );
  if (seenBatch !== batch) {
    setSeenBatch(batch);
    setEnteredChoices(new Map());
    setReplacedByFile(new Map());
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
    () => new Map(accounts.map((account): [number, string] => [account.id, account.name])),
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

  // A file never offers an entry another file of the review replaced; its own stay, so that a
  // recorded file keeps counting them out of the balances.
  const enteredMatches = useMemo(
    () =>
      state.files.map((file, index) => {
        const replacedElsewhere = new Set(
          [...replacedByFile].flatMap(([position, ids]) => (position === index ? [] : ids)),
        );
        return enteredMatchesOf(
          file.rows,
          { accountId, currency, defaultSavingsAccountId: savingsAccountId },
          enteredPayments,
          replacedElsewhere,
        );
      }),
    [state.files, accountId, currency, savingsAccountId, enteredPayments, replacedByFile],
  );
  const settledEntered = useMemo(
    () =>
      state.files.map((file, index) =>
        settleEnteredChoices(
          enteredMatches[index] ?? [],
          enteredChoices.get(index) ?? new Map(),
          (rowId) => file.rows[rowId]?.line ?? -1,
        ),
      ),
    [state.files, enteredMatches, enteredChoices],
  );
  function chooseEntered(fileIndex: number, match: EnteredMatch, entryId: number | null) {
    const line = state.files[fileIndex]?.rows[match.rowId]?.line ?? -1;
    setEnteredChoices((previous) =>
      new Map(previous).set(
        fileIndex,
        new Map(previous.get(fileIndex)).set(choiceKey(line, match), entryId),
      ),
    );
  }
  const replacedByEachFile = useMemo(
    () => replacedMovementsByFile(settledEntered, enteredPayments),
    [settledEntered, enteredPayments],
  );
  const plans = useMemo(
    () =>
      planReview(
        state.files,
        { currency, defaultSavingsAccountId: savingsAccountId, accounts: overflowAccounts },
        replacedByEachFile,
      ),
    [state.files, currency, savingsAccountId, overflowAccounts, replacedByEachFile],
  );
  // Computed from the plans of the review, so that the figures agree with what the import records.
  const assertionLinks = useMemo(
    () =>
      linkReviewAssertions(
        state.files,
        plans,
        assertionSnapshot,
        { accountId, currency },
        replacedByEachFile,
      ),
    [state.files, plans, assertionSnapshot, accountId, currency, replacedByEachFile],
  );
  const demands = useMemo(
    () => overflowDemands(plans.map(({ shortfalls }) => shortfalls)),
    [plans],
  );
  // Read on the stored balances: a choice already made would hide the need it answers.
  // Without a choice the stored balances are the shown ones, so the plan is reused.
  const storedPlans = useMemo(
    () =>
      overflowChoices.length === 0
        ? plans
        : planReview(
            state.files,
            {
              currency,
              defaultSavingsAccountId: savingsAccountId,
              accounts: storedOverflowAccounts,
            },
            replacedByEachFile,
          ),
    [
      plans,
      overflowChoices.length,
      state.files,
      currency,
      savingsAccountId,
      storedOverflowAccounts,
      replacedByEachFile,
    ],
  );
  const phases = state.files.map((file) => file.phase);
  const order = useMemo(
    () =>
      processingOrder(
        state.files.map(({ sourceIndex, rows }) => {
          const dates = rows.map((row) => row.draft.date);
          return {
            sourceIndex,
            firstDate: firstMovementDate(dates),
            lastDate: lastMovementDate(dates),
          };
        }),
      ),
    [state.files],
  );
  // Index of the file being read again with other columns.
  const [restaging, setRestaging] = useState<number | null>(null);
  const isBusy = isReading || restaging !== null || phases.includes("importing");

  // Resolves to false when the file could not be read again: it then keeps its
  // rows, says why, and is not imported until a reading succeeds.
  async function restageFile(fileIndex: number, choices: ColumnChoiceFields): Promise<boolean> {
    const file = state.files[fileIndex];
    if (file === undefined) return false;
    setRestaging(fileIndex);
    try {
      return await rereadFile(fileIndex, () => onRestage(file.sourceIndex, choices), dispatch);
    } finally {
      setRestaging(null);
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={accountSelectId}>{t("receivingAccount")}</label>
          <Select
            id={accountSelectId}
            ref={accountSelectRef}
            value={accountId}
            disabled={isBusy}
            aria-describedby={accountHintId}
            onChange={(event) => onAccountChange(Number(event.currentTarget.value))}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
          <p id={accountHintId} className="text-caption">
            {t("receivingAccountHint")}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={savingsSelectId}>{t("savingsAccount")}</label>
          <Select
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
          >
            <option value="">{t("noSavingsAccount")}</option>
            {savingsAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
          <p id={savingsHintId} className="text-caption">
            {t("savingsAccountHint")}
          </p>
        </div>
      </div>

      {state.files.length < 2 ? null : (
        <section aria-labelledby={orderHeadingId} className="flex flex-col gap-1">
          <h2 id={orderHeadingId} className="font-medium">
            {t("order.heading")}
          </h2>
          <p>
            {t("order.intro")}
            {order.isReordered ? ` ${t("order.reordered")}` : ""}
          </p>
          <ol className="list-decimal pl-6">
            {state.files.map((file) => (
              <li key={`${file.sourceIndex}-${file.fileName}`}>{file.fileName}</li>
            ))}
          </ol>
          {order.overlapping.length === 0 ? null : (
            <p>
              {t("order.overlap", {
                names: order.overlapping
                  .map((position) => state.files[position]?.fileName ?? "")
                  .join(", "),
              })}
            </p>
          )}
        </section>
      )}

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
            assertionLinks={assertionLinks[index] ?? null}
            waitFor={waitIndex === null ? null : (state.files[waitIndex]?.fileName ?? null)}
            accountId={accountId}
            defaultSavingsAccountId={savingsAccountId}
            accountNames={accountNames}
            overflowChoices={choicesForShortfalls(
              overflowChoices,
              storedPlans[index]?.shortfalls ?? [],
            )}
            enteredMatches={enteredMatches[index] ?? []}
            enteredSettled={settledEntered[index] ?? NO_ENTERED_CHOICES}
            onChooseEntered={(match, entryId) => chooseEntered(index, match, entryId)}
            onEntriesReplaced={(entryIds) =>
              setReplacedByFile((previous) => new Map(previous).set(index, entryIds))
            }
            lookups={lookups}
            isReading={isBusy}
            onChangeColumns={(choices) => restageFile(index, choices)}
            dispatch={dispatch}
          />
        );
      })}

      <Button type="button" variant="secondary" onClick={onLeave} className="self-start">
        {phases.every((phase) => phase === "done" || phase === "cancelled")
          ? t("backToImport")
          : t("cancel")}
      </Button>
    </>
  );
}

interface StagedImportReviewProps extends Omit<ReviewBodyProps, "isReading" | "accountSelectRef"> {
  /** Translated progress while the files are read again; null otherwise. */
  readingText: string | null;
}

/**
 * The files of an import, one card each, on a page of their own. Nothing is
 * recorded until a card's file is imported, the overflow accounts chosen here
 * included; leaving the page drops what was not.
 */
export function StagedImportReview({
  batch,
  readingText,
  onAccountChange,
  ...body
}: StagedImportReviewProps) {
  const t = useTranslations("imports.staged");
  const accountSelectRef = useRef<SelectHandle>(null);
  // The batch shown when the user changed the account; null when no change awaits its reading.
  const accountChangedAtBatch = useRef<number | null>(null);
  const isReading = readingText !== null;

  useEffect(() => {
    // Rereading disables the select and replaces the body: the focus would fall on
    // the page (WCAG 2.4.3), so it is given back once the new body is ready.
    if (isReading || accountChangedAtBatch.current === null) return;
    if (accountChangedAtBatch.current === batch) return;
    accountChangedAtBatch.current = null;
    accountSelectRef.current?.focus();
  }, [batch, isReading]);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose">{t("intro")}</p>
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
    </div>
  );
}
