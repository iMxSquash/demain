"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";

import { ConfirmActionButton } from "../confirm-action-button";
import { FileInput } from "../../components/file-input";
import { CONTROL_CLASS, FormField } from "../form-field";
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
        <input
          id="snapshotPassword"
          name="snapshotPassword"
          type="password"
          required
          defaultValue=""
          autoComplete="off"
          spellCheck={false}
          className={CONTROL_CLASS}
        />
      </FormField>
      <FormField id="password" label={t("accountPassword")}>
        <input
          id="password"
          name="password"
          type="password"
          required
          defaultValue=""
          autoComplete="current-password"
          spellCheck={false}
          className={CONTROL_CLASS}
        />
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
