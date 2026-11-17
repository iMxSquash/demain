"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "../../components/button";
import { ACCOUNT_KINDS, type AccountField } from "../../domain/account";
import { AmountInput } from "../amount-input";
import { BalanceSideField } from "../balance-side-field";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type {
  AccountFormState,
  AccountFormValues,
} from "./account-form-data";
import { DatePicker } from "../../components/date-picker";
import { Select } from "../../components/select";

export interface OverflowOption {
  id: number;
  name: string;
  currency: string;
}

interface AccountFormProps {
  action: (
    previous: AccountFormState | null,
    formData: FormData,
  ) => Promise<AccountFormState | null>;
  initialValues: AccountFormValues;
  /** Active savings accounts the user may pick as overflow account (never the account itself). */
  overflowOptions: OverflowOption[];
  submitLabel: string;
}

export function AccountForm({
  action,
  initialValues,
  overflowOptions,
  submitLabel,
}: AccountFormProps) {
  const t = useTranslations("accounts");
  const common = useTranslations("common");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  // After a failed submit the typed values come back with the error.
  const values = state?.values ?? initialValues;

  const errorOf = (field: AccountField) =>
    state?.field === field ? state.message : undefined;
  const controlProps = (field: AccountField) => ({
    id: field,
    name: field,
    defaultValue: values[field],
  });
  const fieldProps = (field: AccountField, label: string) => ({
    id: field,
    label,
    error: errorOf(field),
  });

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      <FormField {...fieldProps("name", t("form.name"))}>
        <input {...controlProps("name")} className={CONTROL_CLASS} type="text" required autoComplete="off" />
      </FormField>

      <FormField {...fieldProps("kind", t("form.kind"))}>
        {/* The key remounts the select: after the automatic form reset React
            does not re-apply a changed defaultValue to the options. */}
        <Select key={values.kind} {...controlProps("kind")}>
          {ACCOUNT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField {...fieldProps("currency", t("form.currency"))} hint={t("form.currencyHint")}>
        <input
          {...controlProps("currency")} className={CONTROL_CLASS}
          type="text"
          required
          autoComplete="off"
          maxLength={3}
        />
      </FormField>

      <FormField {...fieldProps("openingDate", t("form.openingDate"))}>
        <DatePicker {...controlProps("openingDate")} required />
      </FormField>

      <FormField {...fieldProps("openingBalance", t("form.openingBalance"))}>
        <AmountInput {...controlProps("openingBalance")} className={CONTROL_CLASS} required />
      </FormField>

      <BalanceSideField
        name="openingBalanceSide"
        value={values.openingBalanceSide}
        error={state?.field === "openingBalanceSide" ? state.message : undefined}
      />

      <FormField
        {...fieldProps("depositCeiling", t("form.depositCeiling"))}
        optional
        hint={t("form.depositCeilingHint")}
      >
        <AmountInput {...controlProps("depositCeiling")} className={CONTROL_CLASS} />
      </FormField>

      <FormField {...fieldProps("overflowAccountId", t("form.overflowAccount"))} optional>
        {/* Same remount trick as the kind select above. */}
        <Select
          key={values.overflowAccountId}
          {...controlProps("overflowAccountId")}
        >
          <option value="">{common("none")}</option>
          {overflowOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} ({option.currency})
            </option>
          ))}
        </Select>
      </FormField>

      <Button
        type="submit"
        pending={isPending}
        pendingLabel={common("pending")}
        className="self-start"
      >
        {submitLabel}
      </Button>
    </form>
  );
}
