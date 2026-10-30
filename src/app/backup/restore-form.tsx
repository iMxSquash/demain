"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";

import { ConfirmActionButton } from "../confirm-action-button";
import { CONTROL_CLASS, FormField } from "../form-field";
import { restoreSnapshotAction } from "./actions";

const RESTORE_BUTTON_CLASS =
  "min-h-11 self-start rounded bg-red-800 px-4 font-medium text-white";

export function RestoreForm() {
  const t = useTranslations("backup");
  const common = useTranslations("common");
  const [state, formAction] = useActionState(restoreSnapshotAction, null);
  const formId = useId();

  return (
    <form id={formId} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      {state ? (
        <p role="alert" className="font-medium text-red-800">
          {common("error", { message: state.message })}
        </p>
      ) : null}
      <FormField id="snapshot" label={t("snapshotFile")}>
        <input id="snapshot" name="snapshot" type="file" required className={CONTROL_CLASS} />
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
        buttonClassName={RESTORE_BUTTON_CLASS}
      />
    </form>
  );
}
