"use client";

import { useTranslations } from "next-intl";
import { useActionState, type ReactNode } from "react";

import { Button, type ButtonVariant } from "../../components/button";
import { AmountInput } from "../amount-input";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type { AccountOption } from "./transaction-form";
import { TRANSFER_DECISION } from "./transfer-decision";
import type {
  SurplusChoice,
  TransferFormField,
  TransferFormState,
  TransferFormValues,
} from "./transaction-form-data";
import { Select } from "../../components/select";

interface TransferFormProps {
  action: (
    previous: TransferFormState | null,
    formData: FormData,
  ) => Promise<TransferFormState | null>;
  initialValues: TransferFormValues;
  /** Active accounts only: archived accounts are neither source nor destination. */
  accounts: AccountOption[];
}

// The transaction form sits on the same page and shares field names: the DOM
// ids must stay unique for the labels to point at the right control.
const fieldId = (field: TransferFormField) => `transfer-${field}`;

export function TransferForm({ action, initialValues, accounts }: TransferFormProps) {
  const t = useTranslations("transactions.transferForm");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  const values = state?.values ?? initialValues;
  const choice = state?.status === "notice" ? state.surplusChoice : undefined;

  const errorOf = (field: TransferFormField) =>
    state?.status === "error" && state.field === field ? state.message : undefined;
  const controlProps = (field: TransferFormField, defaultValue: string) => ({
    id: fieldId(field),
    name: field,
    defaultValue,
    className: CONTROL_CLASS,
  });
  const accountOptions = accounts.map((account) => (
    <option key={account.id} value={account.id}>
      {account.name} ({account.currency})
    </option>
  ));

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {state?.status === "notice" ? (
        <p role="status" className="font-medium">
          {state.message}
        </p>
      ) : null}

      <FormField id={fieldId("sourceId")} label={t("from")} error={errorOf("sourceId")}>
        <Select
          key={values.sourceId}
          {...controlProps("sourceId", values.sourceId)}
        >
          {accountOptions}
        </Select>
      </FormField>

      <FormField
        id={fieldId("destinationId")}
        label={t("to")}
        error={errorOf("destinationId")}
      >
        <Select
          key={values.destinationId}
          {...controlProps("destinationId", values.destinationId)}
        >
          {accountOptions}
        </Select>
      </FormField>

      <FormField id={fieldId("date")} label={t("date")} error={errorOf("date")}>
        <input
          {...controlProps("date", values.date)}
          type="date"
          required
        />
      </FormField>

      <FormField id={fieldId("amount")} label={t("amount")} error={errorOf("amount")}>
        <AmountInput {...controlProps("amount", values.amount)} required />
      </FormField>

      <FormField id={fieldId("label")} label={t("label")} error={errorOf("label")}>
        <input
          {...controlProps("label", values.label)}
          type="text"
          required
          autoComplete="off"
        />
      </FormField>

      {choice ? (
        <SurplusChoiceFields
          choice={choice}
          isPending={isPending}
          surplusField={
            <FormField
              id={fieldId("surplusAccountId")}
              label={t("surplusAccount")}
              error={errorOf("surplusAccountId")}
            >
              <Select
                key={choice.suggestedAccountId}
                {...controlProps("surplusAccountId", choice.suggestedAccountId)}
              >
                <option value="">{t("chooseAccount")}</option>
                {accountOptions}
              </Select>
            </FormField>
          }
        />
      ) : (
        <Button
          type="submit"
          pending={isPending}
          pendingLabel={t("submitPending")}
          className="self-start"
        >
          {t("submit")}
        </Button>
      )}
    </form>
  );
}

interface SurplusChoiceFieldsProps {
  choice: SurplusChoice;
  isPending: boolean;
  /** The select of the account that receives the surplus, with its label and error. */
  surplusField: ReactNode;
}

function SurplusChoiceFields({
  choice,
  isPending,
  surplusField,
}: SurplusChoiceFieldsProps) {
  const t = useTranslations("transactions.transferForm");
  // Which of the three was pressed is not known here, so none changes its label while pending.
  const decisionButton = (value: string, label: string, variant: ButtonVariant) => (
    <Button type="submit" name="decision" value={value} variant={variant} pending={isPending}>
      {label}
    </Button>
  );

  return (
    <fieldset className="flex flex-col gap-3 rounded-control border border-border-control p-4">
      <legend className="px-1 font-medium">{t("surplusLegend")}</legend>
      <p>
        {t("surplusIntro", {
          deposited: choice.depositedText,
          surplus: choice.surplusText,
        })}
      </p>
      {surplusField}
      <div className="flex flex-wrap gap-2">
        {decisionButton(
          TRANSFER_DECISION.roomOnly,
          t("roomOnly", { deposited: choice.depositedText }),
          "primary",
        )}
        {decisionButton(
          TRANSFER_DECISION.sendSurplus,
          t("sendSurplus"),
          "secondary",
        )}
        {decisionButton(TRANSFER_DECISION.cancel, t("cancel"), "secondary")}
      </div>
    </fieldset>
  );
}
