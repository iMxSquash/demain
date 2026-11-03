"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { MOVEMENT_TYPES } from "../../domain/import-columns";
import { BUTTON_CLASS, CONTROL_CLASS } from "../form-field";
import {
  bulkPatch,
  DEFAULT_SAVINGS_CHOICE,
  NO_CATEGORY_CHOICE,
  type BulkChoice,
} from "./review-state";
import {
  NO_COLUMN_CHOICE,
  type ColumnChoiceFields,
  type StagedColumns,
} from "./import-form-data";
import { columnChoicesOf } from "./reread-file";
import type { RowLookups } from "./staged-row-editor";
import type { RowDetails } from "../../domain/import-draft";

const COLUMN_ROLES = [
  { role: "typeColumn", label: "columnRoleType" },
  { role: "paymentModeColumn", label: "columnRolePaymentMode" },
  { role: "categoryColumn", label: "columnRoleCategory" },
  { role: "descriptionColumn", label: "columnRoleDescription" },
] as const;

type RoleField = (typeof COLUMN_ROLES)[number]["role"];

interface ColumnRolesProps {
  columns: StagedColumns;
  /** The file is being read again: the choices wait. */
  isBusy: boolean;
  /** Fields to send to read the file again: every role, so that the others do not move. */
  onChange: (choices: ColumnChoiceFields) => void;
}

/**
 * Which column of the file holds the type, the payment mode, the category and
 * the description. A column is offered to one role at a time: to move it, the
 * role that holds it is set to "No column" first.
 */
export function ColumnRoles({ columns, isBusy, onChange }: ColumnRolesProps) {
  const t = useTranslations("imports.staged");
  const hintId = useId();
  const refs = useRef(new Map<RoleField, HTMLSelectElement>());
  // Reading again disables the selects, which drops the focus: it is given back afterwards.
  const focusRole = useRef<RoleField | null>(null);

  useEffect(() => {
    if (isBusy || focusRole.current === null) return;
    refs.current.get(focusRole.current)?.focus();
    focusRole.current = null;
  }, [isBusy]);

  const current = (role: RoleField): string => {
    const column = columns.roles[role];
    return column === null ? NO_COLUMN_CHOICE : String(column);
  };

  return (
    <details className="rounded border border-neutral-400 p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">
        {t("columnsHeading")}
      </summary>
      <p id={hintId} className="pb-3">
        {t("columnsHint")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {COLUMN_ROLES.map(({ role, label }) => {
          const takenByOthers = COLUMN_ROLES.filter((other) => other.role !== role).map(
            (other) => columns.roles[other.role],
          );
          const id = `${hintId}-${role}`;
          return (
            <div key={role} className="flex flex-col gap-1">
              <label htmlFor={id}>{t(label)}</label>
              <select
                id={id}
                ref={(node) => {
                  if (node === null) refs.current.delete(role);
                  else refs.current.set(role, node);
                }}
                value={current(role)}
                disabled={isBusy}
                aria-describedby={hintId}
                className={CONTROL_CLASS}
                onChange={(event) => {
                  focusRole.current = role;
                  onChange({
                    ...columnChoicesOf(columns),
                    [role]: event.currentTarget.value,
                  });
                }}
              >
                <option value={NO_COLUMN_CHOICE}>{t("noColumn")}</option>
                {columns.available
                  .filter(({ column }) => !takenByOthers.includes(column))
                  .map(({ column, header }) => (
                    <option key={column} value={column}>
                      {header === ""
                        ? t("columnOptionNoHeader", { number: column + 1 })
                        : t("columnOption", { number: column + 1, header })}
                    </option>
                  ))}
              </select>
            </div>
          );
        })}
      </div>
    </details>
  );
}

const KEEP = "";
const NO_CHOICE: BulkChoice = { type: KEEP, category: KEEP, savingsAccount: KEEP };

interface BulkEditProps {
  lookups: RowLookups;
  /** Rows the change would reach: selected and shown. */
  selectedCount: number;
  isBusy: boolean;
  onApply: (patch: Partial<RowDetails>) => void;
}

/** Changes the type, the category or the savings account of the selected rows in one go. */
export function BulkEdit({ lookups, selectedCount, isBusy, onApply }: BulkEditProps) {
  const t = useTranslations("imports.staged");
  const id = useId();
  const hintId = `${id}-hint`;
  const firstSelectRef = useRef<HTMLSelectElement>(null);
  const [choice, setChoice] = useState<BulkChoice>(NO_CHOICE);
  const patch = bulkPatch(choice);
  const isChosen = Object.keys(patch).length > 0;
  const canApply = selectedCount > 0 && isChosen && !isBusy;
  const set = (field: keyof BulkChoice) => (value: string) =>
    setChoice((previous) => ({ ...previous, [field]: value }));

  return (
    <fieldset className="flex flex-col gap-3 rounded border border-neutral-400 p-3">
      <legend className="px-1 font-medium">{t("bulkHeading")}</legend>
      <p id={hintId}>{t("bulkHint")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-type`}>{t("columnType")}</label>
          <select
            id={`${id}-type`}
            ref={firstSelectRef}
            value={choice.type}
            aria-describedby={hintId}
            className={CONTROL_CLASS}
            onChange={(event) => set("type")(event.currentTarget.value)}
          >
            <option value={KEEP}>{t("keepAsIs")}</option>
            {MOVEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-category`}>{t("columnCategory")}</label>
          <select
            id={`${id}-category`}
            value={choice.category}
            aria-describedby={hintId}
            className={CONTROL_CLASS}
            onChange={(event) => set("category")(event.currentTarget.value)}
          >
            <option value={KEEP}>{t("keepAsIs")}</option>
            <option value={NO_CATEGORY_CHOICE}>{t("noCategory")}</option>
            {lookups.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-savings`}>{t("columnSavingsAccount")}</label>
          <select
            id={`${id}-savings`}
            value={choice.savingsAccount}
            aria-describedby={hintId}
            className={CONTROL_CLASS}
            onChange={(event) => set("savingsAccount")(event.currentTarget.value)}
          >
            <option value={KEEP}>{t("keepAsIs")}</option>
            <option value={DEFAULT_SAVINGS_CHOICE}>
              {lookups.defaultSavingsName === null
                ? t("chooseSavingsAccount")
                : t("sameAsFile", { name: lookups.defaultSavingsName })}
            </option>
            {lookups.savingsAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="button"
        disabled={!canApply}
        className={`${BUTTON_CLASS} self-start`}
        onClick={() => {
          onApply(patch);
          setChoice(NO_CHOICE);
          // The button is disabled once the form is cleared: the focus must not fall with it.
          firstSelectRef.current?.focus();
        }}
      >
        {t("bulkApply")}
      </button>
    </fieldset>
  );
}
