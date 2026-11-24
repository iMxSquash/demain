"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "../../components/button";
import { Select } from "../../components/select";
import { FormField } from "../form-field";
import { OCCURRENCE_FIELD } from "./planned-link-data";

interface PlannedLinkFormProps {
  action: (formData: FormData) => Promise<void>;
  /** Text already built on the server: name, date, amount and status of each occurrence. */
  options: readonly { key: string; text: string }[];
}

export function PlannedLinkForm({ action, options }: PlannedLinkFormProps) {
  const t = useTranslations("transactions.plannedLink");
  // The outcome is a toast: the state only exists to know when the call is pending.
  const [, formAction, isPending] = useActionState(async (_previous: null, formData: FormData) => {
    await action(formData);
    return null;
  }, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField id="planned-link-occurrence" label={t("selectLabel")} hint={t("selectHint")}>
        <Select id="planned-link-occurrence" name={OCCURRENCE_FIELD} defaultValue={options[0]?.key}>
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.text}
            </option>
          ))}
        </Select>
      </FormField>
      <Button
        type="submit"
        pending={isPending}
        pendingLabel={t("linkPending")}
        className="self-start"
      >
        {t("link")}
      </Button>
    </form>
  );
}

/** The submit button of the unlink form, which the server page renders. */
export function UnlinkButton() {
  const t = useTranslations("transactions.plannedLink");
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" pending={pending} pendingLabel={t("unlinkPending")}>
      {t("unlink")}
    </Button>
  );
}
