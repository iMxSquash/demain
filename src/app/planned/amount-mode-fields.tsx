import { useTranslations } from "next-intl";

import { ChoiceChips, type ChipOption } from "../../components/choice-chips";
import { AMOUNT_MODES, AVERAGE_WINDOWS } from "../../domain/planned-item";

interface AmountModeFieldsProps {
  /** They differ between the create form and the version form, so that no id repeats on the edit page. */
  modeId: string;
  windowId: string;
  mode: string;
  averageWindow: string;
  onModeChange: (mode: string) => void;
  onAverageWindowChange: (averageWindow: string) => void;
  /** Without JavaScript the mode cannot show the window: it is always in the form, the server drops it. */
  showWindow: boolean;
  modeError: string | undefined;
  windowError: string | undefined;
}

const WINDOW_OPTIONS: readonly ChipOption[] = AVERAGE_WINDOWS.map((window) => ({
  value: String(window),
  label: String(window),
}));

/** The amount mode and, in rolling average mode, the number of occurrences averaged (DESIGN section 17). */
export function AmountModeFields({
  modeId,
  windowId,
  mode,
  averageWindow,
  onModeChange,
  onAverageWindowChange,
  showWindow,
  modeError,
  windowError,
}: AmountModeFieldsProps) {
  const t = useTranslations("planned.form");
  const modeOptions = AMOUNT_MODES.map((option) => ({
    value: option,
    label: t(`amountModes.${option}`),
  }));

  return (
    <>
      <div>
        <ChoiceChips
          id={modeId}
          legend={t("amountMode")}
          name="amountMode"
          value={mode}
          onChange={onModeChange}
          options={modeOptions}
          layout="row"
          error={modeError}
        />
        <p className="mt-2 text-caption text-text-muted">{t("amountModeHint")}</p>
      </div>
      {showWindow ? (
        <ChoiceChips
          id={windowId}
          legend={t("averageWindow")}
          name="averageWindow"
          value={averageWindow}
          onChange={onAverageWindowChange}
          options={WINDOW_OPTIONS}
          layout="row"
          error={windowError}
        />
      ) : null}
    </>
  );
}
