import { Check, WarningCircle } from "@phosphor-icons/react/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { Icon } from "../../components/icon";

export interface ChipOption {
  value: string;
  label: string;
  /** Drawn above the word of a tile. */
  icon?: PhosphorIcon;
  /** "later" is the amber chip: the choice that sends a transaction to the to-categorize queue. */
  tone?: "later";
}

interface ChoiceChipsProps {
  id: string;
  legend: string;
  /** The name of the radios, posted with the form. */
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ChipOption[];
  /** "tiles" is the grid of 76 px chips of the categories, "row" the pills of the date and the account. */
  layout: "row" | "tiles";
  hint?: string;
  error?: string | undefined;
}

// The radio is visually hidden and the label is the chip: the ring goes on the label, as for the
// segmented control. The selected chip is ink with a tick, so it never rests on colour alone.
const CHIP_CLASS =
  "group/chip relative flex cursor-pointer items-center justify-center gap-2 border border-border-control text-center font-medium " +
  "transition-colors not-has-[:checked]:hover:bg-control has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-on-primary " +
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus";
const TONE_CLASS = {
  plain: "bg-surface-sunken text-text",
  later: "bg-warning-tint text-text",
} as const;
const LAYOUT_CLASS = {
  row: "min-h-11 rounded-pill px-4",
  tiles: "min-h-19 flex-col rounded-control px-2 py-2 text-caption",
} as const;
const GROUP_CLASS = {
  row: "flex flex-wrap gap-2",
  tiles: "grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2",
} as const;

/**
 * A group of native radios drawn as chips (DESIGN section 10): one tab stop, arrows to move, and
 * it posts without JavaScript. An error is linked to the group and given to the focus through
 * the checked radio, which is where `useFocusFirstError` looks.
 */
export function ChoiceChips({
  id,
  legend,
  name,
  value,
  onChange,
  options,
  layout,
  hint,
  error,
}: ChoiceChipsProps) {
  const common = useTranslations("common");
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(" ");
  const invalidValue = options.find((option) => option.value === value)?.value ?? options[0]?.value;

  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-caption font-medium text-text">{legend}</legend>
      {hint ? (
        <p id={hintId} className="text-caption text-text-muted">
          {hint}
        </p>
      ) : null}
      <div className={GROUP_CLASS[layout]}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`${CHIP_CLASS} ${LAYOUT_CLASS[layout]} ${TONE_CLASS[option.tone ?? "plain"]}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              aria-describedby={describedBy || undefined}
              {...(error && option.value === invalidValue ? { "aria-invalid": true } : {})}
              className="sr-only"
            />
            {option.icon ? (
              <span
                className={
                  option.tone === "later"
                    ? "text-warning group-has-[:checked]/chip:text-on-primary"
                    : ""
                }
              >
                <Icon icon={option.icon} />
              </span>
            ) : null}
            <span className="min-w-0 break-words">{option.label}</span>
            <span
              aria-hidden="true"
              className="hidden group-has-[:checked]/chip:inline-flex"
            >
              <Icon icon={Check} />
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2 text-caption font-medium text-negative"
        >
          <Icon icon={WarningCircle} />
          <span>{common("error", { message: error })}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
