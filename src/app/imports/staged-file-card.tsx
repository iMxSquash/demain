"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useMemo } from "react";

import type { FilePlan } from "../../domain/import-review";
import { BUTTON_CLASS } from "../form-field";
import { describeSplit } from "./review-text";
import { commitStagedFileAction } from "./stage-actions";
import {
  RowEditor,
  type ReviewDispatch,
  type RowLookups,
} from "./staged-row-editor";
import type { ReviewFile } from "./review-state";

function RowsTable({
  file,
  fileIndex,
  splitTexts,
  lookups,
  dispatch,
}: {
  file: ReviewFile;
  fileIndex: number;
  splitTexts: ReadonlyMap<number, string>;
  lookups: RowLookups;
  dispatch: ReviewDispatch;
}) {
  const t = useTranslations("imports.staged");
  const imports = useTranslations("imports");
  const caption = t("tableCaption", { name: file.fileName });

  return (
    // A wide table scrolls: the region takes the focus so that the keyboard can scroll it too.
    <div role="region" aria-label={caption} tabIndex={0} className="max-h-96 overflow-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-neutral-500">
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
          {file.rows.map((row, rowIndex) => (
            <RowEditor
              key={row.line}
              row={row}
              fileIndex={fileIndex}
              rowIndex={rowIndex}
              splitText={splitTexts.get(rowIndex) ?? null}
              lookups={lookups}
              dispatch={dispatch}
            />
          ))}
        </tbody>
      </table>
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
  dispatch,
}: FileCardProps) {
  const t = useTranslations("imports.staged");
  const locale = useLocale();
  const headingId = useId();
  const hintId = useId();
  const waitId = useId();
  const { phase, outcome, rows } = file;

  const problemCount = rows.filter((row) => row.problem !== null).length;
  const duplicateCount = rows.filter(
    (row) => row.problem === null && row.isDuplicate,
  ).length;
  const confirmCount = rows.filter((row) => row.needsConfirmation).length;

  // The text of a split comes from the plan of the domain, not from a sum made here.
  const splitTexts = useMemo(() => {
    const say = {
      t,
      currency: file.currency,
      locale,
      nameOf: (id: number) => accountNames.get(id) ?? `#${id}`,
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

  const isReviewing = phase === "reviewing" || phase === "importing";
  const describedBy =
    [problemCount > 0 ? hintId : null, waitFor === null ? null : waitId]
      .filter((id) => id !== null)
      .join(" ") || undefined;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded border border-neutral-500 p-4"
    >
      <h3 id={headingId} className="text-lg font-semibold break-all">
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
          {plan.isChainLooping ? <p>{t("issues.overflowChainCycle")}</p> : null}
          {hasUnplaced ? <p>{t("unplacedNote")}</p> : null}
          <RowsTable
            file={file}
            fileIndex={fileIndex}
            splitTexts={splitTexts}
            lookups={lookups}
            dispatch={dispatch}
          />
          {problemCount > 0 ? <p id={hintId}>{t("fixFirst")}</p> : null}
          {waitFor === null ? null : (
            <p id={waitId}>{t("importAfter", { name: waitFor })}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={importFile}
              disabled={
                phase === "importing" ||
                isReading ||
                problemCount > 0 ||
                waitFor !== null
              }
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
