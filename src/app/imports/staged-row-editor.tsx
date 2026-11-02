"use client";

import { useTranslations } from "next-intl";
import { memo, useId, type ActionDispatch, type ChangeEvent } from "react";

import type { RowProblem } from "../../domain/import-draft";
import { MOVEMENT_TYPES } from "../../domain/import-columns";
import type { RowDetails } from "../../domain/import-draft";
import { confirmReasons } from "../../domain/import-review";
import { PAYMENT_MODES } from "../../domain/transaction";
import type { ImportCategoryOption } from "./import-form-data";
import { CONTROL_CLASS } from "../form-field";
import { describeConfirmReasons } from "./review-text";
import {
  parseOptionalId,
  type EditableField,
  type ReviewAction,
  type ReviewRow,
} from "./review-state";

type InvalidField = EditableField | "type" | "savingsAccountId";

const FIELD_OF_PROBLEM: Record<RowProblem, InvalidField> = {
  dateInvalid: "date",
  labelRequired: "label",
  amountInvalid: "amount",
  amountZero: "amount",
  typeSignMismatch: "type",
  savingsAccountRequired: "savingsAccountId",
};

// The border is always there, transparent, so that the cell looks like text until it is pointed at or focused.
const CELL_CLASS =
  "min-h-11 w-full rounded border border-transparent bg-transparent px-2 hover:border-neutral-400 focus-visible:border-neutral-900 aria-[invalid=true]:border-2 aria-[invalid=true]:border-red-800";

interface SavingsAccountOption {
  id: number;
  name: string;
}

/** What the selects of every row offer: one stable object, so that the rows stay memoized. */
export interface RowLookups {
  categories: readonly ImportCategoryOption[];
  /** The accounts a savings row may name. */
  savingsAccounts: readonly SavingsAccountOption[];
  /** Name of the savings account of the file, which a savings row that names none uses. */
  defaultSavingsName: string | null;
}

export type ReviewDispatch = ActionDispatch<[ReviewAction]>;

interface RowEditorProps {
  row: ReviewRow;
  fileIndex: number;
  rowIndex: number;
  /** The split of a savings row, already written; null for any other row. */
  splitText: string | null;
  lookups: RowLookups;
  dispatch: ReviewDispatch;
}

// Memoized: typing in one cell re-renders that row only, not the hundreds of others.
export const RowEditor = memo(function RowEditor({
  row,
  fileIndex,
  rowIndex,
  splitText,
  lookups,
  dispatch,
}: RowEditorProps) {
  const t = useTranslations("imports.staged");
  const imports = useTranslations("imports");
  const modes = useTranslations("transactions.paymentModes");
  const problemId = useId();
  const { problem, details } = row;
  const invalidField = problem === null ? null : FIELD_OF_PROBLEM[problem];

  const problemText =
    problem === "dateInvalid" && row.rawDate !== null && row.draft.date === ""
      ? t("problems.dateInvalidRaw", { raw: row.rawDate })
      : problem === null
        ? null
        : t(`problems.${problem}`);

  const control = (field: InvalidField, column: string) => ({
    "aria-label": t("cellLabel", { column, line: row.line }),
    "aria-invalid": invalidField === field,
    "aria-describedby": invalidField === field ? problemId : undefined,
  });
  const textCell = (field: EditableField, column: string) => ({
    ...control(field, column),
    value: row.draft[field],
    className: CELL_CLASS,
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      dispatch({
        type: "edit",
        file: fileIndex,
        row: rowIndex,
        field,
        value: event.currentTarget.value,
      }),
  });

  const setDetails = (patch: Partial<RowDetails>) =>
    dispatch({ type: "setDetails", file: fileIndex, row: rowIndex, details: patch });
  const isSavings = details.type === "savings";
  const sameAsFile =
    lookups.defaultSavingsName === null
      ? t("chooseSavingsAccount")
      : t("sameAsFile", { name: lookups.defaultSavingsName });

  return (
    <tr className="border-b border-neutral-300 align-top">
      <th scope="row" className="py-2 pr-2 text-right font-normal tabular-nums">
        {row.line}
      </th>
      <td className="min-w-40">
        <input type="date" {...textCell("date", imports("columns.date"))} />
      </td>
      <td className="min-w-56">
        <input type="text" {...textCell("label", imports("columns.label"))} />
      </td>
      <td className="min-w-32">
        <input
          type="text"
          inputMode="decimal"
          {...textCell("amount", imports("columns.amount"))}
          className={`${CELL_CLASS} text-right tabular-nums`}
        />
      </td>
      <td className="min-w-36">
        <select
          {...control("type", t("columnType"))}
          value={details.type}
          className={CONTROL_CLASS}
          onChange={(event) => {
            const type = MOVEMENT_TYPES.find(
              (candidate) => candidate === event.currentTarget.value,
            );
            if (type !== undefined) setDetails({ type });
          }}
        >
          {MOVEMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </select>
      </td>
      <td className="min-w-44">
        {isSavings ? (
          t("notApplicable")
        ) : (
          <select
            aria-label={t("cellLabel", {
              column: t("columnCategory"),
              line: row.line,
            })}
            value={details.categoryId ?? ""}
            className={CONTROL_CLASS}
            onChange={(event) =>
              setDetails({ categoryId: parseOptionalId(event.currentTarget.value) })
            }
          >
            <option value="">{t("noCategory")}</option>
            {lookups.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="min-w-40">
        <select
          aria-label={t("cellLabel", {
            column: t("columnPaymentMode"),
            line: row.line,
          })}
          value={details.paymentMode ?? ""}
          className={CONTROL_CLASS}
          onChange={(event) =>
            setDetails({
              paymentMode:
                PAYMENT_MODES.find((mode) => mode === event.currentTarget.value) ??
                null,
            })
          }
        >
          <option value="">{t("noPaymentMode")}</option>
          {PAYMENT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {modes(mode)}
            </option>
          ))}
        </select>
      </td>
      <td className="min-w-48">
        {isSavings ? (
          <select
            {...control("savingsAccountId", t("columnSavingsAccount"))}
            value={details.savingsAccountId ?? ""}
            className={CONTROL_CLASS}
            onChange={(event) =>
              setDetails({
                savingsAccountId: parseOptionalId(event.currentTarget.value),
              })
            }
          >
            <option value="">{sameAsFile}</option>
            {lookups.savingsAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        ) : (
          t("notApplicable")
        )}
      </td>
      <td className="min-w-56 py-2 pl-2">
        {problemText === null ? (
          <p>{row.isDuplicate ? t("stateDuplicate") : t("stateNew")}</p>
        ) : (
          <p id={problemId} className="font-medium">
            {problemText}
          </p>
        )}
        {row.needsConfirmation ? (
          <p>
            {t("toConfirm", {
              reasons: describeConfirmReasons(confirmReasons(row.guess), t),
            })}
          </p>
        ) : null}
        {splitText === null ? null : (
          <p>{t("splitLabel", { parts: splitText })}</p>
        )}
      </td>
    </tr>
  );
});
