"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

interface EcbPanelProps {
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  fetchRates: () => Promise<void>;
}

const BUTTON_CLASS =
  "min-h-11 self-start rounded-pill border border-border-control px-4 font-medium disabled:opacity-60";

export function EcbPanel({ isEnabled, setEnabled, fetchRates }: EcbPanelProps) {
  const t = useTranslations("currencies");
  // The outcome is a toast: the state only exists to know when the call is pending.
  const [, fetchAction, isPending] = useActionState(async () => {
    await fetchRates();
    return null;
  }, null);

  return (
    <div className="flex flex-col gap-4">
      <p>{isEnabled ? t("ecbEnabled") : t("ecbDisabled")}</p>

      <form action={setEnabled.bind(null, !isEnabled)}>
        <button type="submit" className={BUTTON_CLASS}>
          {isEnabled ? t("ecbDisable") : t("ecbEnable")}
        </button>
      </form>

      {isEnabled ? (
        <form action={fetchAction} className="flex flex-col gap-2">
          <button type="submit" disabled={isPending} className={BUTTON_CLASS}>
            {t("ecbFetch")}
          </button>
        </form>
      ) : null}
    </div>
  );
}
