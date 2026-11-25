"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "../../components/button";
import { ChoiceChips } from "../../components/choice-chips";
import { PAYMENT_MODES, type PaymentMode } from "../../domain/transaction";
import { setDefaultPaymentModeAction } from "./actions";

/**
 * Works without JavaScript: the chips are native radios posted with the form. The parent keys it
 * on the stored mode, so a save remounts it with the new choice.
 */
export function DefaultPaymentModeForm({ stored }: { stored: PaymentMode }) {
  const t = useTranslations("settings");
  const transactions = useTranslations("transactions");
  const [chosen, setChosen] = useState<string>(stored);
  const options = PAYMENT_MODES.map((mode) => ({
    value: mode,
    label: transactions(`paymentModes.${mode}`),
  }));

  return (
    <form action={setDefaultPaymentModeAction} className="flex flex-col items-start gap-4">
      <ChoiceChips
        id="defaultPaymentMode"
        legend={t("defaultPaymentModeLegend")}
        name="paymentMode"
        value={chosen}
        onChange={setChosen}
        options={options}
        layout="row"
      />
      <Button type="submit" variant="secondary">
        {t("applyPaymentMode")}
      </Button>
    </form>
  );
}
