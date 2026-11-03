"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { RefObject } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { RowDetails } from "../../domain/import-draft";
import type { FilePlan } from "../../domain/import-review";
import { BUTTON_CLASS } from "../form-field";
import type { ColumnChoiceFields, StagedColumns } from "./import-form-data";
import { columnChoicesOf } from "./reread-file";
import { describeSplit } from "./review-text";
import { commitStagedFileAction } from "./stage-actions";
import {
  RowEditor,
  type ReviewDispatch,
  type RowLookups,
} from "./staged-row-editor";
import {
  canImportFile,
  countRowsToConfirm,
  visibleRowIndexes,
  type ReviewFile,
} from "./review-state";
import { BulkEdit, ColumnRoles } from "./staged-file-tools";

function RowsTable({
  file,
  fileIndex,
  visible,
  selected,
  onSelect,
  onSelectAllShown,
  splitTexts,
  lookups,
  dispatch,
  regionRef,
}: {
  file: ReviewFile;
  fileIndex: number;
  /** Positions of the rows shown. */
  visible: readonly number[];
  selected: ReadonlySet<number>;
  onSelect: (rowIndex: number, isSelected: boolean) => void;
  onSelectAllShown: (isSelected: boolean) => void;
  splitTexts: ReadonlyMap<number, string>;
  lookups: RowLookups;
  dispatch: ReviewDispatch;
  regionRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations("imports.staged");
  const imports = useTranslations("imports");
  const caption = t("tableCaption", { name: file.fileName });
  const allRef = useRef<HTMLInputElement>(null);
  const selectedShown = visible.filter((index) => selected.has(index)).length;
  const areAllSelected = visible.length > 0 && selectedShown === visible.length;

  useEffect(() => {
    if (allRef.current !== null) {
      allRef.current.indeterminate = selectedShown > 0 && !areAllSelected;
    }
  }, [selectedShown, areAllSelected]);

  return (
    // A wide table scrolls: the region takes the focus so that the keyboard can scroll it too.
    <div
      ref={regionRef}
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="max-h-96 overflow-auto"
    >
      {visible.length === 0 ? (
        <p className="p-2">{t("noRowToConfirm")}</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-neutral-500">
              <th scope="col">
                <label className="flex min-h-11 min-w-11 items-center justify-center">
                  <input
                    ref={allRef}
                    type="checkbox"
                    checked={areAllSelected}
                    aria-label={t("selectAllShown", { name: file.fileName })}
                    onChange={(event) => onSelectAllShown(event.currentTarget.checked)}
                    className="size-6"
                  />
                </label>
              </th>
              <th scope="col" className="py-2 pr-2 text-right">
                {t("row")}
              </th>
              <th scope="col">{imports("columns.date")}</th>
              <th scope="col">{imports("columns.label")}</th>
              <th scope="col" className="text-right">
                {imports("columns.amount")}
              </th>
              <th scope="col">{t("columnType")}</th>
              <th scope="col">{t("columnCategory")}</th>
              <th scope="col">{t("columnPaymentMode")}</th>
              <th scope="col">{t("columnSavingsAccount")}</th>
              <th scope="col" className="pl-2">
                {t("columnState")}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((rowIndex) => {
              const row = file.rows[rowIndex];
              if (row === undefined) return null;
              return (
                <RowEditor
                  key={row.line}
                  row={row}
                  fileIndex={fileIndex}
                  rowIndex={rowIndex}
                  splitText={splitTexts.get(rowIndex) ?? null}
                  isSelected={selected.has(rowIndex)}
                  onSelect={onSelect}
                  lookups={lookups}
                  dispatch={dispatch}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface FileCardProps {
  file: ReviewFile;
  fileIndex: number;
  plan: FilePlan;
  /** Name of the earlier file to import or cancel first; null when this one may go. */
  waitFor: string | null;
  accountId: number;
  defaultSavingsAccountId: number | null;
  /** Names of the accounts, to write where a savings row goes. */
  accountNames: ReadonlyMap<number, string>;
  lookups: RowLookups;
  isReading: boolean;
  /** Reads the file again with other columns; resolves to whether the new rows are in. */
  onChangeColumns: (choices: ColumnChoiceFields) => Promise<boolean>;
  dispatch: ReviewDispatch;
}

export function FileCard({
  file,
  fileIndex,
  plan,
  waitFor,
  accountId,
  defaultSavingsAccountId,
  accountNames,
  lookups,
  isReading,
  onChangeColumns,
  dispatch,
}: FileCardProps) {
  const t = useTranslations("imports.staged");
  const locale = useLocale();
  const headingId = useId();
  const hintId = useId();
  const waitId = useId();
  const rereadErrorId = useId();
  const { phase, outcome, rows, columns } = file;

  const problemCount = rows.filter((row) => row.problem !== null).length;
  const duplicateCount = rows.filter(
    (row) => row.problem === null && row.isDuplicate,
  ).length;
  const confirmCount = countRowsToConfirm(rows);
  const isLocked = isReading || phase === "importing";

  const [onlyToConfirm, setOnlyToConfirm] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(
    () => visibleRowIndexes(rows, onlyToConfirm),
    [rows, onlyToConfirm],
  );
  // A row hidden by the filter is not reached by a change made to the selection.
  const selectedShown = useMemo(
    () => visible.filter((index) => selected.has(index)),
    [visible, selected],
  );

  const selectRow = useCallback((rowIndex: number, isSelected: boolean) => {
    setBulkMessage(null);
    setSelected((previous) => {
      const next = new Set(previous);
      if (isSelected) next.add(rowIndex);
      else next.delete(rowIndex);
      return next;
    });
  }, []);
  const selectAllShown = (isSelected: boolean) => {
    setBulkMessage(null);
    setSelected((previous) => {
      const next = new Set(previous);
      for (const index of visible) {
        if (isSelected) next.add(index);
        else next.delete(index);
      }
      return next;
    });
  };
  const applyToSelection = (details: Partial<RowDetails>) => {
    dispatch({ type: "setDetailsMany", file: fileIndex, rows: selectedShown, details });
    setBulkMessage(t("bulkApplied", { count: selectedShown.length }));
  };

  // A row that leaves the filter while it has the focus would drop the focus on the page.
  useEffect(() => {
    if (onlyToConfirm && document.activeElement === document.body) {
      regionRef.current?.focus();
    }
  }, [onlyToConfirm, visible.length]);

  async function changeColumns(choices: ColumnChoiceFields) {
    const isRead = await onChangeColumns(choices);
    if (isRead) setSelected(new Set());
  }

  // The button is disabled while the file is read, which drops the focus: it is
  // given back once the reading is over, to the button if the error stays, or to
  // the title of the card when the button is gone.
  const rereadButtonRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isFocusDue = useRef(false);
  useEffect(() => {
    if (isLocked || !isFocusDue.current) return;
    isFocusDue.current = false;
    (rereadButtonRef.current ?? titleRef.current)?.focus();
  }, [isLocked, file.rereadError]);
  const rereadFileAgain = (columns: StagedColumns) => {
    isFocusDue.current = true;
    void changeColumns(columnChoicesOf(columns));
  };

  // The text of a split comes from the plan of the domain, not from a sum made here.
  const splitTexts = useMemo(() => {
    const say = {
      t,
      currency: file.currency,
      locale,
      nameOf: (id: number) => accountNames.get(id) ?? t("unknownAccount"),
    };
    return new Map(
      [...plan.splits].map(([rowIndex, segments]) => [
        rowIndex,
        describeSplit(segments, say),
      ]),
    );
  }, [plan, accountNames, file.currency, locale, t]);
  const hasUnplaced = [...plan.splits.values()].some((segments) =>
    segments.some(({ direction }) => direction === "unplaced"),
  );

  async function importFile() {
    if (!canImport) return;
    dispatch({ type: "setPhase", file: fileIndex, phase: "importing" });
    try {
      const result = await commitStagedFileAction({
        accountId,
        fileName: file.fileName,
        format: file.format ?? "csv",
        mapping: file.mapping,
        savingsAccountId: defaultSavingsAccountId,
        drafts: rows.map((row) => ({ ...row.draft, details: row.details })),
      });
      dispatch({
        type: "setPhase",
        file: fileIndex,
        phase: result.status === "done" ? "done" : "reviewing",
        outcome: {
          message: result.message,
          warnings: result.warnings,
          issues: result.issues,
        },
      });
    } catch (error) {
      console.error("Staged import failed", error);
      dispatch({
        type: "setPhase",
        file: fileIndex,
        phase: "reviewing",
        outcome: { message: t("importFailed"), warnings: [], issues: [] },
      });
    }
  }

  const canImport = canImportFile(file, { isReading, waitFor });
  const isReviewing = phase === "reviewing" || phase === "importing";
  const describedBy =
    [
      problemCount > 0 ? hintId : null,
      waitFor === null ? null : waitId,
      file.rereadError === null ? null : rereadErrorId,
    ]
      .filter((id) => id !== null)
      .join(" ") || undefined;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded border border-neutral-500 p-4"
    >
      <h3 id={headingId} ref={titleRef} tabIndex={-1} className="text-lg font-semibold break-all">
        {file.fileName}
      </h3>

      {file.status === "failed" ? (
        <p role="alert" className="font-medium text-red-800">
          {file.message}
        </p>
      ) : null}

      {file.status === "ready" && isReviewing ? (
        <>
          <p>
            {t("summary", {
              rows: rows.length,
              newCount: rows.length - duplicateCount - problemCount,
              duplicateCount,
              problemCount,
            })}
          </p>
          {confirmCount > 0 ? (
            <p>{t("toConfirmCount", { count: confirmCount })}</p>
          ) : null}
          {columns === null ? null : (
            <ColumnRoles
              columns={columns}
              isBusy={isLocked}
              onChange={changeColumns}
            />
          )}
          {file.rereadError === null ? null : (
            <div className="flex flex-col items-start gap-2">
              <p id={rereadErrorId} role="alert" className="font-medium text-red-800">
                {t("rereadFailed", { name: file.fileName, message: file.rereadError })}
              </p>
              {columns === null ? null : (
                <button
                  ref={rereadButtonRef}
                  type="button"
                  disabled={isLocked}
                  aria-describedby={rereadErrorId}
                  onClick={() => rereadFileAgain(columns)}
                  className={BUTTON_CLASS}
                >
                  {t("rereadFile")}
                </button>
              )}
            </div>
          )}
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={onlyToConfirm}
              onChange={(event) => setOnlyToConfirm(event.currentTarget.checked)}
              className="size-6"
            />
            {t("filterToConfirm", { count: confirmCount })}
          </label>
          <BulkEdit
            lookups={lookups}
            selectedCount={selectedShown.length}
            isBusy={isLocked}
            onApply={applyToSelection}
          />
          <div role="status" className="flex flex-col gap-1">
            <p>{t("selectedCount", { count: selectedShown.length })}</p>
            <p>{t("showing", { shown: visible.length, total: rows.length })}</p>
            {bulkMessage === null ? null : <p className="font-medium">{bulkMessage}</p>}
            {file.lastReread === null ? null : (
              <p>{t("rereadDone", { ...file.lastReread })}</p>
            )}
          </div>
          {plan.isChainLooping ? <p>{t("issues.overflowChainCycle")}</p> : null}
          {hasUnplaced ? <p>{t("unplacedNote")}</p> : null}
          <RowsTable
            file={file}
            fileIndex={fileIndex}
            visible={visible}
            selected={selected}
            onSelect={selectRow}
            onSelectAllShown={selectAllShown}
            splitTexts={splitTexts}
            lookups={lookups}
            dispatch={dispatch}
            regionRef={regionRef}
          />
          {problemCount > 0 ? <p id={hintId}>{t("fixFirst")}</p> : null}
          {waitFor === null ? null : (
            <p id={waitId}>{t("importAfter", { name: waitFor })}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={importFile}
              disabled={!canImport}
              aria-describedby={describedBy}
              className={BUTTON_CLASS}
            >
              {t("importFile")}
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: "setPhase", file: fileIndex, phase: "cancelled" })
              }
              disabled={phase === "importing" || isReading}
              className={BUTTON_CLASS}
            >
              {t("cancelFile")}
            </button>
          </div>
        </>
      ) : null}

      <div role="status" className="flex flex-col gap-2">
        {phase === "cancelled" ? <p>{t("cancelled")}</p> : null}
        {outcome === null ? null : (
          <>
            <p className="font-medium">{outcome.message}</p>
            {outcome.issues.length > 0 ? (
              <ul className="list-disc pl-6">
                {outcome.issues.map((issue, position) => (
                  <li key={position}>{issue.message}</li>
                ))}
              </ul>
            ) : null}
            {outcome.warnings.length > 0 ? (
              <ul className="list-disc pl-6">
                {outcome.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
        {phase === "done" ? (
          <Link href="/categories" className="self-start underline">
            {t("toCategorize")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
