"use client";

import { Tray } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";

import { CHIP_DISC_CLASS } from "../../components/chip";
import { ChoiceChips, type ChipOption } from "../../components/choice-chips";
import { Icon } from "../../components/icon";
import { CONTROL_CLASS, FormField } from "../form-field";
import { AmountDisplayInput, SIGN, SIGN_TONE } from "./amount-display-input";
import { WIDE_HIDDEN_CLASS } from "./add-transaction-layout";
import { RecapRow } from "./add-transaction-recap-row";
import { KIND_ICON, KIND_TONE, KindSegments } from "./kind-segments";
import type { Recap } from "./add-transaction-steps";

type Kind = keyof typeof KIND_ICON;

interface AddTransactionRecapProps {
  recap: Recap;
  kind: Kind;
  kindOptions: readonly Kind[];
  kindLabel: (kind: Kind) => string;
  amount: string;
  label: string;
  categoryId: string;
  currency: string;
  categoryOptions: readonly ChipOption[];
  /** Changes with each result: remounts the radios that the automatic form reset sent back. */
  resultCount: number;
  onChange: (changes: { kind?: Kind; amount?: string; label?: string; categoryId?: string }) => void;
}

/**
 * The two recap rows of step 3 (DESIGN section 10). Their editors hold copies of the step 1 and
 * step 2 controls, named `recapKind` and `recapCategoryId` (the amount and the label editors are
 * unnamed). They post with the form while open, and the server ignores keys it does not know;
 * the values it reads come from the real fields.
 */
export function AddTransactionRecap({
  recap,
  kind,
  kindOptions,
  kindLabel,
  amount,
  label,
  categoryId,
  currency,
  categoryOptions,
  resultCount,
  onChange,
}: AddTransactionRecapProps) {
  const add = useTranslations("transactions.add");
  const form = useTranslations("transactions.form");
  const category = categoryOptions.find((option) => option.value === recap.label.categoryId?.toString());

  return (
    <div className={`divide-y divide-divider border-y border-divider ${WIDE_HIDDEN_CLASS}`}>
      <RecapRow
        key={`amount-${resultCount}`}
        editLabel={add("editAmount")}
        summary={
          <>
            <span className={`${CHIP_DISC_CLASS} ${KIND_TONE[kind]}`}>
              <Icon icon={KIND_ICON[kind]} />
            </span>
            <span className="min-w-0">
              <span className={`block font-medium tabular-nums ${SIGN_TONE[recap.amount.sign]}`}>
                {SIGN[recap.amount.sign]}
                {recap.amount.formatted}
              </span>
              <span className="block text-caption text-text-muted">{kindLabel(kind)}</span>
            </span>
          </>
        }
      >
        <KindSegments
          name="recapKind"
          legend={form("type")}
          options={kindOptions}
          value={kind}
          onChange={(next) => onChange({ kind: next })}
          labelOf={kindLabel}
        />
        <FormField id="recapAmount" label={form("amount")} hideLabel>
          <AmountDisplayInput
            id="recapAmount"
            value={amount}
            onChange={(event) => onChange({ amount: event.target.value })}
            direction={recap.amount.sign}
            currency={currency}
          />
        </FormField>
      </RecapRow>
      <RecapRow
        key={`label-${resultCount}`}
        editLabel={add("editLabel")}
        summary={
          <>
            <span className={CHIP_DISC_CLASS}>
              <Icon icon={category?.icon ?? Tray} />
            </span>
            <span className="min-w-0">
              <span className="block break-words font-medium">{recap.label.text}</span>
              {kind === "transfer" ? null : (
                <span className="block text-caption text-text-muted">
                  {category?.label ?? add("later")}
                </span>
              )}
            </span>
          </>
        }
      >
        <FormField id="recapLabel" label={add("whatWasIt")}>
          <input
            id="recapLabel"
            value={label}
            onChange={(event) => onChange({ label: event.target.value })}
            className={CONTROL_CLASS}
            type="text"
            autoComplete="off"
          />
        </FormField>
        {kind === "transfer" ? null : (
          <ChoiceChips
            id="recapCategoryId"
            legend={form("category")}
            name="recapCategoryId"
            value={categoryId}
            onChange={(next) => onChange({ categoryId: next })}
            options={categoryOptions}
            layout="tiles"
          />
        )}
      </RecapRow>
    </div>
  );
}
