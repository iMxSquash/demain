"use client";

import { useTranslations } from "next-intl";
import { useActionState, type ReactNode } from "react";

import { CONTROL_CLASS, FormField } from "../form-field";
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
          <input
            id="password"
            name="password"
            type="password"
            required
            defaultValue=""
            autoComplete="current-password"
            className={CONTROL_CLASS}
          />
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
        <button
          type="submit"
          disabled={isPending}
          className="min-h-11 self-start rounded-pill bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
        >
          {t("enable")}
        </button>
      </form>
    </>
  );
}
