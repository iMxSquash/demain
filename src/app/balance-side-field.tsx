import { useTranslations } from "next-intl";

import { BALANCE_SIDES, type BalanceSide } from "../domain/amount-syntax";

interface BalanceSideFieldProps {
  /** The name of the radios, posted with the form. */
  name: string;
  /** What the form last held: anything but "debit" shows credit, the server's default. */
  value: string;
}

/**
 * Credit or Debit next to a balance (DESIGN section 9, "Balance"): the amount is typed without
 * a sign and the server turns Debit into a negative amount. Native radios, so it posts
 * without JavaScript.
 */
export function BalanceSideField({ name, value }: BalanceSideFieldProps) {
  const t = useTranslations("common.balanceSide");
  const current: BalanceSide = value === "debit" ? "debit" : "credit";

  return (
    // The key remounts the radios: React does not re-apply a changed defaultChecked after the
    // form reset that follows an action (same reason as ThemeSwitcher).
    <fieldset key={current} className="flex flex-col gap-1">
      <legend className="mb-1 text-caption font-medium text-text">{t("legend")}</legend>
      {/* A utility class, not an inline style: the CSP forbids style attributes. */}
      <div className="segmented self-start [--n:2]">
        {BALANCE_SIDES.map((side) => (
          <label key={side}>
            <input type="radio" name={name} value={side} defaultChecked={side === current} />
            {t(side)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
