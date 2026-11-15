"use client";

import { useTranslations } from "next-intl";
import { useActionState, type ReactNode } from "react";

import { Button } from "../../components/button";
import { CONTROL_CLASS, FormField } from "../form-field";
import { PasswordInput } from "../password-input";
import { enableTotpAction } from "./actions";

interface EnrollTotpFormProps {
  secret: string;
  /** The enrollment instructions, rendered by the server and hidden once the codes are shown. */
  children: ReactNode;
}

export function EnrollTotpForm({ secret, children }: EnrollTotpFormProps) {
  const t = useTranslations("auth.securityPage");
  const [state, formAction, isPending] = useActionState(enableTotpAction, null);

  if (state) {
    return (
      <section aria-labelledby="backup-heading" className="max-w-md">
        <p className="mb-4">{t("totpOn")}</p>
        <h3 id="backup-heading" className="text-title font-medium">
          {t("backupHeading")}
        </h3>
        <p className="my-2">{t("backupIntro")}</p>
        <ul className="grid grid-cols-2 gap-2 font-mono">
          {state.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <>
      {children}
      <form action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
        <input type="hidden" name="secret" value={secret} />
        <FormField id="password" label={t("password")}>
          <PasswordInput id="password" name="password" required autoComplete="current-password" />
        </FormField>
        <FormField id="code" label={t("code")}>
          <input
            id="code"
            name="code"
            type="text"
            required
            defaultValue=""
            autoComplete="one-time-code"
            inputMode="numeric"
            className={CONTROL_CLASS}
          />
        </FormField>
        <Button
          type="submit"
          pending={isPending}
          pendingLabel={t("enablePending")}
          className="self-start"
        >
          {t("enable")}
        </Button>
      </form>
    </>
  );
}
