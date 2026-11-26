"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";

import { readImportDraft } from "../../domain/import-draft";
import { formatAmount } from "../../domain/money";
import { formatCalendarDate } from "../../i18n/dates";
import type { EnteredPaymentEntry } from "../../ledger/planned-matching";
import type { EnteredMatch, SettledEnteredChoices } from "./entered-payments";
import type { ReviewRow } from "./review-state";

const KEEP_BOTH = "keep";

function isTransfer(entry: EnteredPaymentEntry): boolean {
  return entry.kind === "transfer";
}

const RADIO_LABEL_CLASS = "flex min-h-11 cursor-pointer items-start gap-3";
const RADIO_CLASS = "mt-3 size-5 shrink-0 accent-primary";

interface EnteredRowProps {
  match: EnteredMatch;
  row: ReviewRow;
  currency: string;
  chosen: number | null | undefined;
  isBusy: boolean;
  onChoose: (match: EnteredMatch, entryId: number | null) => void;
  /** The notes of the panel, read with the choice. */
  noteIds: string;
}

/** One flagged row: native radios, the owner's choice is only sent when the file is imported. */
function EnteredRow({ match, row, currency, chosen, isBusy, onChoose, noteIds }: EnteredRowProps) {
  const t = useTranslations("imports.staged.entered");
  const locale = useLocale();
  const radioName = useId();
  const textId = useId();
  const date = (value: string) => formatCalendarDate(value, locale);
  const amount = (value: number) => formatAmount(value, currency, locale);
  const reading = readImportDraft(row.draft, currency);
  const single = match.candidates.length === 1 ? match.candidates[0] : undefined;
  // A transfer is shown by what it moves: its outgoing legs are negative, even for a withdrawal.
  const describe = (entry: EnteredPaymentEntry) => ({
    name: entry.plannedItemName,
    nominalDate: date(entry.nominalDate),
    date: date(entry.date),
    amount: amount(isTransfer(entry) ? Math.abs(entry.amount) : entry.amount),
  });

  const option = (value: string, label: string, entryId: number | null) => (
    <label key={value} className={RADIO_LABEL_CLASS}>
      <input
        type="radio"
        name={radioName}
        value={value}
        checked={chosen === entryId}
        disabled={isBusy}
        onChange={() => onChoose(match, entryId)}
        className={RADIO_CLASS}
      />
      <span className="py-2.5">{label}</span>
    </label>
  );

  return (
    <fieldset aria-describedby={`${textId} ${noteIds}`} className="flex flex-col gap-1">
      <legend className="font-medium">
        {t("legend", {
          line: row.line,
          label: row.draft.label,
          date: reading.ok ? date(reading.row.date) : row.draft.date,
          amount: reading.ok ? amount(reading.row.amount) : row.draft.amount,
        })}
      </legend>
      <p id={textId}>
        {single !== undefined
          ? t(isTransfer(single) ? "oneTransfer" : "one", describe(single))
          : t(match.candidates.some(isTransfer) ? "severalTransfer" : "several", { count: match.candidates.length })}
      </p>
      {single !== undefined
        ? option(String(single.id), t("replace"), single.id)
        : match.candidates.map((entry) => {
            const label = t(isTransfer(entry) ? "replaceThisTransfer" : "replaceThis", describe(entry));
            return option(String(entry.id), label, entry.id);
          })}
      {option(KEEP_BOTH, t("keepBoth"), null)}
    </fieldset>
  );
}

/**
 * The rows of a file that may be payments already marked as paid (DOMAIN, "Importing files"):
 * replace the entry with the bank row, or keep both. Nothing is written before the file is imported.
 */
export function EnteredPaymentsPanel({
  matches,
  rows,
  currency,
  settled,
  isBusy,
  onChoose,
  undoNoteId,
}: {
  matches: readonly EnteredMatch[];
  rows: readonly ReviewRow[];
  currency: string;
  settled: SettledEnteredChoices;
  isBusy: boolean;
  onChoose: (match: EnteredMatch, entryId: number | null) => void;
  /** The note on the undo, which the import button also points at while a replacement is chosen. */
  undoNoteId: string;
}) {
  const t = useTranslations("imports.staged.entered");
  const headingId = useId();
  const takesId = useId();
  const noteIds = settled.replacements.length > 0 ? `${takesId} ${undoNoteId}` : takesId;
  const offered = matches.flatMap(({ candidates }) => candidates);
  const hasTransfer = offered.some(isTransfer);
  const hasPayment = offered.some((entry) => !isTransfer(entry));

  return (
    <section aria-labelledby={headingId} className="flex flex-col items-start gap-3 border-t border-border-control pt-3">
      <h3 id={headingId} className="font-medium">
        {t(hasTransfer ? "headingWithTransfers" : "heading")}
      </h3>
      <p className="max-w-prose">{t(hasTransfer ? "introWithTransfers" : "intro")}</p>
      {matches.map((match) => {
        const row = rows[match.rowId];
        if (row === undefined) return null;
        return (
          <EnteredRow
            key={row.line}
            match={match}
            row={row}
            currency={currency}
            chosen={settled.chosen.get(match.rowId)}
            isBusy={isBusy}
            onChoose={onChoose}
            noteIds={noteIds}
          />
        );
      })}
      <p id={takesId} className="max-w-prose">
        {[hasPayment ? t("takes") : null, hasTransfer ? t("takesTransfer") : null].filter(Boolean).join(" ")}
      </p>
      {settled.replacements.length > 0 ? (
        <p id={undoNoteId} className="max-w-prose">
          {t("undoNote")}
        </p>
      ) : null}
    </section>
  );
}
