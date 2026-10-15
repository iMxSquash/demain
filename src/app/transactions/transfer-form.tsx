"use client";

import { useActionState, type ReactNode } from "react";

import { CONTROL_CLASS, FormField } from "../form-field";
import type { AccountOption } from "./transaction-form";
import { TRANSFER_DECISION } from "./transfer-decision";
import type {
  SurplusChoice,
  TransferFormField,
  TransferFormState,
  TransferFormValues,
} from "./transaction-form-data";

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

const BUTTON_CLASS =
  "min-h-11 rounded border border-blue-800 px-4 font-medium text-blue-900 disabled:opacity-60";

export function TransferForm({ action, initialValues, accounts }: TransferFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const values = state?.values ?? initialValues;
  const choice = state?.surplusChoice;

  const errorOf = (field: TransferFormField) =>
    state?.status === "error" && state.field === field ? state.message : undefined;
  const controlProps = (field: TransferFormField, defaultValue: string) => {
    const hasError = errorOf(field) !== undefined;
    return {
      id: fieldId(field),
      name: field,
      defaultValue,
      className: CONTROL_CLASS,
      "aria-invalid": hasError ? true : undefined,
      "aria-describedby": hasError ? `${fieldId(field)}-error` : undefined,
    };
  };
  const accountOptions = accounts.map((account) => (
    <option key={account.id} value={account.id}>
      {account.name} ({account.currency})
    </option>
  ));

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {state?.status === "error" && !state.field ? (
        <p role="alert" className="font-medium text-red-800">
          Error: {state.message}
        </p>
      ) : null}
      {state?.status === "notice" ? (
        <p role="status" className="font-medium">
          {state.message}
        </p>
      ) : null}

      <FormField id={fieldId("sourceId")} label="From account" error={errorOf("sourceId")}>
        <select
          key={values.sourceId}
          {...controlProps("sourceId", values.sourceId)}
        >
          {accountOptions}
        </select>
      </FormField>

      <FormField
        id={fieldId("destinationId")}
        label="To account"
        error={errorOf("destinationId")}
      >
        <select
          key={values.destinationId}
          {...controlProps("destinationId", values.destinationId)}
        >
          {accountOptions}
        </select>
      </FormField>

      <FormField id={fieldId("date")} label="Date" error={errorOf("date")}>
        <input
          {...controlProps("date", values.date)}
          type="date"
          required
        />
      </FormField>

      <FormField id={fieldId("amount")} label="Amount" error={errorOf("amount")}>
        <input
          {...controlProps("amount", values.amount)}
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
        />
      </FormField>

      <FormField id={fieldId("label")} label="Label" error={errorOf("label")}>
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
              label="Account that receives the surplus"
              error={errorOf("surplusAccountId")}
            >
              <select
                key={choice.suggestedAccountId}
                {...controlProps("surplusAccountId", choice.suggestedAccountId)}
              >
                <option value="">Choose an account</option>
                {accountOptions}
              </select>
            </FormField>
          }
        />
      ) : (
        <button
          type="submit"
          disabled={isPending}
          className="min-h-11 self-start rounded bg-blue-800 px-4 font-medium text-white disabled:opacity-60"
        >
          Record transfer
        </button>
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
  const decisionButton = (value: string, label: string) => (
    <button
      type="submit"
      name="decision"
      value={value}
      disabled={isPending}
      className={BUTTON_CLASS}
    >
      {label}
    </button>
  );

  return (
    <fieldset className="flex flex-col gap-3 rounded border border-neutral-500 p-4">
      <legend className="px-1 font-medium">Amount above the ceiling</legend>
      <p>
        {choice.depositedText} fits under the ceiling of the destination
        account, {choice.surplusText} does not. Choose what to do with the
        surplus.
      </p>
      {surplusField}
      <div className="flex flex-wrap gap-2">
        {decisionButton(
          TRANSFER_DECISION.roomOnly,
          `Deposit only ${choice.depositedText}`,
        )}
        {decisionButton(
          TRANSFER_DECISION.sendSurplus,
          "Send the surplus to the chosen account",
        )}
        {decisionButton(TRANSFER_DECISION.cancel, "Cancel the transfer")}
      </div>
    </fieldset>
  );
}
