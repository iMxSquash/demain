"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  memo,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ActionDispatch,
  type ChangeEvent,
} from "react";

import { readImportDraft, type DraftProblem } from "../../domain/import-draft";
import { commitStagedFileAction } from "./stage-actions";
import type { StagedFile, StagedRowView } from "./import-form-data";

type EditableField = "date" | "label" | "amount";

type RowEdit = { index: number; field: EditableField; value: string };

const BUTTON_CLASS =
  "min-h-11 rounded border border-neutral-900 px-4 font-medium disabled:opacity-60";
// The border is always there, transparent, so that the cell looks like text until it is pointed at or focused.
const CELL_CLASS =
  "min-h-11 w-full rounded border border-transparent bg-transparent px-2 hover:border-neutral-400 focus-visible:border-neutral-900 aria-[invalid=true]:border-2 aria-[invalid=true]:border-red-800";

const FIELD_OF_PROBLEM: Record<DraftProblem, EditableField> = {
  dateInvalid: "date",
  labelRequired: "label",
  amountInvalid: "amount",
  amountZero: "amount",
};

/** A row with what is wrong with it, kept up to date as the cell is edited: the others are not read again. */
interface EditableRow extends StagedRowView {
  problem: DraftProblem | null;
}

function problemOf(
  draft: StagedRowView["draft"],
  currency: string,
): DraftProblem | null {
  const reading = readImportDraft(draft, currency);
  return reading.ok ? null : reading.problem;
}

function initRows(file: StagedFile): EditableRow[] {
  return file.rows.map((row) => ({
    ...row,
    problem: problemOf(row.draft, file.currency),
  }));
}

function editRow(
  rows: EditableRow[],
  edit: RowEdit,
  currency: string,
): EditableRow[] {
  return rows.map((row, index) => {
    if (index !== edit.index) return row;
    const draft = { ...row.draft, [edit.field]: edit.value };
    return { ...row, draft, problem: problemOf(draft, currency) };
  });
}

interface RowEditorProps {
  row: EditableRow;
  index: number;
  stateId: string;
  dispatch: ActionDispatch<[RowEdit]>;
}

// Memoized: typing in one cell re-renders that row only, not the hundreds of others.
const RowEditor = memo(function RowEditor({
  row,
  index,
  stateId,
  dispatch,
}: RowEditorProps) {
  const t = useTranslations("imports.staged");
  const imports = useTranslations("imports");
  const { problem } = row;
  const invalidField = problem === null ? null : FIELD_OF_PROBLEM[problem];

  const problemText =
    problem === "dateInvalid" && row.rawDate !== null && row.draft.date === ""
      ? t("problems.dateInvalidRaw", { raw: row.rawDate })
      : problem === null
        ? null
        : t(`problems.${problem}`);
  const stateText =
    problemText ?? (row.isDuplicate ? t("stateDuplicate") : t("stateNew"));

  const cell = (field: EditableField, column: string) => ({
    "aria-label": t("cellLabel", { column, line: row.line }),
    "aria-invalid": invalidField === field,
    "aria-describedby": invalidField === field ? stateId : undefined,
    value: row.draft[field],
    className: CELL_CLASS,
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      dispatch({ index, field, value: event.currentTarget.value }),
  });

  return (
    <tr className="border-b border-neutral-300 align-top">
      <th scope="row" className="py-2 pr-2 text-right font-normal tabular-nums">
        {row.line}
      </th>
      <td className="min-w-40">
        <input type="date" {...cell("date", imports("columns.date"))} />
      </td>
      <td className="min-w-56">
        <input type="text" {...cell("label", imports("columns.label"))} />
      </td>
      <td className="min-w-32">
        <input
          type="text"
          inputMode="decimal"
          {...cell("amount", imports("columns.amount"))}
          className={`${CELL_CLASS} text-right tabular-nums`}
        />
      </td>
      <td id={stateId} className="py-2 pl-2">
        {stateText}
      </td>
    </tr>
  );
});

function RowsTable({
  fileName,
  rows,
  dispatch,
}: {
  fileName: string;
  rows: EditableRow[];
  dispatch: ActionDispatch<[RowEdit]>;
}) {
  const t = useTranslations("imports.staged");
  const imports = useTranslations("imports");
  const stateIdPrefix = useId();

  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          {t("tableCaption", { name: fileName })}
        </caption>
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
            <th scope="col" className="pl-2">
              {t("columnState")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <RowEditor
              key={row.line}
              row={row}
              index={index}
              stateId={`${stateIdPrefix}-${index}`}
              dispatch={dispatch}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Phase = "reviewing" | "importing" | "done" | "cancelled";

interface Outcome {
  message: string;
  warnings: string[];
}

function FileCard({
  file,
  accountId,
}: {
  file: StagedFile;
  accountId: number;
}) {
  const t = useTranslations("imports.staged");
  const headingId = useId();
  const hintId = useId();
  const [rows, dispatch] = useReducer(
    (current: EditableRow[], edit: RowEdit) =>
      editRow(current, edit, file.currency),
    file,
    initRows,
  );
  const [phase, setPhase] = useState<Phase>("reviewing");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const problemCount = rows.filter((row) => row.problem !== null).length;
  const duplicateCount = rows.filter(
    (row) => row.problem === null && row.isDuplicate,
  ).length;

  async function importFile() {
    setPhase("importing");
    setOutcome(null);
    try {
      const result = await commitStagedFileAction({
        accountId,
        fileName: file.fileName,
        format: file.format ?? "csv",
        mapping: file.mapping,
        drafts: rows.map((row) => row.draft),
      });
      setOutcome({ message: result.message, warnings: result.warnings });
      setPhase(result.status === "done" ? "done" : "reviewing");
    } catch (error) {
      console.error("Staged import failed", error);
      setOutcome({ message: t("importFailed"), warnings: [] });
      setPhase("reviewing");
    }
  }

  const isReviewing = phase === "reviewing" || phase === "importing";

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
          <RowsTable fileName={file.fileName} rows={rows} dispatch={dispatch} />
          {problemCount > 0 ? <p id={hintId}>{t("fixFirst")}</p> : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={importFile}
              disabled={phase === "importing" || problemCount > 0}
              aria-describedby={problemCount > 0 ? hintId : undefined}
              className={BUTTON_CLASS}
            >
              {t("importFile")}
            </button>
            <button
              type="button"
              onClick={() => setPhase("cancelled")}
              disabled={phase === "importing"}
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

/**
 * The files of a multi-file import, one card each, in a native dialog (focus
 * trap, Escape, focus given back). Nothing is recorded until a card's file is
 * imported; closing the dialog drops what was not.
 */
export function StagedImportReview({
  files,
  accountId,
  onClose,
}: {
  files: StagedFile[];
  accountId: number;
  onClose: () => void;
}) {
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
      className="m-auto max-h-[90vh] w-[min(64rem,95vw)] overflow-y-auto rounded border border-neutral-500 bg-white p-6 text-neutral-900 backdrop:bg-black/40"
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
        {files.map((file, index) => (
          <FileCard
            key={`${index}-${file.fileName}`}
            file={file}
            accountId={accountId}
          />
        ))}
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
