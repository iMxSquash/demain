"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import type { EcbFetchState } from "./currency-form-data";

interface EcbPanelProps {
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  fetchRates: () => Promise<EcbFetchState>;
}

const BUTTON_CLASS =
  "min-h-11 self-start rounded border border-neutral-500 px-4 font-medium disabled:opacity-60";

export function EcbPanel({ isEnabled, setEnabled, fetchRates }: EcbPanelProps) {
  const t = useTranslations("currencies");
  const common = useTranslations("common");
  const [state, fetchAction, isPending] = useActionState(fetchRates, null);

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
          {state && "error" in state ? (
            <p role="alert" className="font-medium text-red-800">
              {common("error", { message: state.error })}
            </p>
          ) : null}
          {/* The live region exists before the result so that it is announced. */}
          <p role="status">
            {state && "storedCount" in state
              ? t("ecbFetched", { count: state.storedCount })
              : null}
          </p>
        </form>
      ) : null}
    </div>
  );
}
