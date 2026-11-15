"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "../../components/button";

interface EcbPanelProps {
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  fetchRates: () => Promise<void>;
}

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
        <Button type="submit" variant="secondary" className="self-start">
          {isEnabled ? t("ecbDisable") : t("ecbEnable")}
        </Button>
      </form>

      {isEnabled ? (
        <form action={fetchAction} className="flex flex-col gap-2">
          <Button
            type="submit"
            variant="secondary"
            pending={isPending}
            pendingLabel={t("ecbFetchPending")}
            className="self-start"
          >
            {t("ecbFetch")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
