"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";

import { ConfirmActionButton } from "../confirm-action-button";
import { FileInput } from "../../components/file-input";
import { FormField } from "../form-field";
import { PasswordInput } from "../password-input";
import { restoreSnapshotAction } from "./actions";

export function RestoreForm() {
  const t = useTranslations("backup");
  const [, formAction] = useActionState(restoreSnapshotAction, null);
  const formId = useId();

  return (
    <form id={formId} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      <FormField id="snapshot" label={t("snapshotFile")} hint={t("snapshotFileHint")}>
        <FileInput id="snapshot" name="snapshot" required />
      </FormField>
      <FormField id="snapshotPassword" label={t("snapshotPassword")}>
        <PasswordInput id="snapshotPassword" name="snapshotPassword" required autoComplete="off" />
      </FormField>
      <FormField id="password" label={t("accountPassword")}>
        <PasswordInput id="password" name="password" required autoComplete="current-password" />
      </FormField>
      {/* The confirm button of the dialog submits this form through its `form` attribute. */}
      <ConfirmActionButton
        formId={formId}
        label={t("restoreSubmit")}
        subject={t("restoreSubject")}
        title={t("restoreConfirmTitle")}
        message={t("restoreConfirmMessage")}
        confirmLabel={t("restoreConfirm")}
        variant="primary"
        className="self-start"
      />
    </form>
  );
}
