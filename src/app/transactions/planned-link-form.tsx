"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "../../components/button";
import { Select } from "../../components/select";
import { FormField } from "../form-field";
import { OCCURRENCE_FIELD, PLANNED_LINK_HEADING_ID } from "./planned-link-data";

// The button that was activated is unmounted once the section shows its new state, which would
// drop the focus on the body (WCAG 2.4.3): it moves to the heading of the section instead.
function focusSectionHeading(): void {
  document.getElementById(PLANNED_LINK_HEADING_ID)?.focus();
}

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
    focusSectionHeading();
    return null;
  }, null);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
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

export function UnlinkForm({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={async () => {
        await action();
        focusSectionHeading();
      }}
    >
      <UnlinkButton />
    </form>
  );
}

function UnlinkButton() {
  const t = useTranslations("transactions.plannedLink");
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" pending={pending} pendingLabel={t("unlinkPending")}>
      {t("unlink")}
    </Button>
  );
}
