import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { WarningCircle } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import {
  CHIP_DISC_CLASS,
  CHIP_ICON_ONLY_CLASS,
  CHIP_PILL_CLASS,
  CHIP_TEXT_ONLY_CLASS,
  CHIP_TILE_CLASS,
  CHIP_WITH_DISC_CLASS,
} from "./chip";
import { Icon } from "./icon";

export interface ChipOption {
  value: string;
  label: string;
  /** Drawn in a 32 px disc before the word, or above it in a tile. */
  icon?: PhosphorIcon;
  /**
   * "later" is the amber chip that sends a transaction to the to-categorize queue. "today" keeps
   * a blue ring while it is not chosen.
   */
  tone?: "later" | "today";
  /** Not choosable: drawn dashed and muted, and skipped by the keyboard. */
  disabled?: boolean;
}

interface ChoiceChipsProps {
  id: string;
  legend: string;
  /** The name of the radios, posted with the form. */
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ChipOption[];
  /**
   * "tiles" is the grid of 76 px chips of the categories, "row" the pills of the date and the
   * account, "icons" a grid of square icon-only chips whose word is only read.
   */
  layout: "row" | "tiles" | "icons";
  /** Another chip at the end of the row, such as the date picker. */
  trailing?: ReactNode;
  error?: string | undefined;
}

// The radio is visually hidden and the label is the chip: the ring goes on the label.
const FOCUS_CLASS =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus";
const CHOSEN_CLASS = {
  plain: "has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-on-primary",
  later: "has-[:checked]:border-warning has-[:checked]:bg-warning-tint has-[:checked]:text-text",
} as const;
const TODAY_RING_CLASS = "not-has-[:checked]:shadow-[inset_0_0_0_1.5px_var(--color-accent)]";
const GROUP_CLASS = {
  row: "flex flex-wrap gap-3",
  tiles: "grid grid-cols-4 gap-3",
  icons: "grid grid-cols-5 gap-2",
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
  trailing,
  error,
}: ChoiceChipsProps) {
  const common = useTranslations("common");
  const errorId = `${id}-error`;
  const invalidValue = options.find((option) => option.value === value)?.value ?? options[0]?.value;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-3 text-caption font-medium text-text">{legend}</legend>
      <div className={GROUP_CLASS[layout]}>
        {options.map((option) => {
          const { icon } = option;
          const isLater = option.tone === "later";
          const isIconOnly = layout === "icons";
          const shape =
            layout === "tiles"
              ? CHIP_TILE_CLASS
              : isIconOnly
                ? CHIP_ICON_ONLY_CLASS
                : `${CHIP_PILL_CLASS} ${icon ? CHIP_WITH_DISC_CLASS : CHIP_TEXT_ONLY_CLASS}`;
          return (
            <label
              key={option.value}
              title={isIconOnly ? option.label : undefined}
              className={`group/chip ${shape} ${CHOSEN_CLASS[isLater ? "later" : "plain"]} ${FOCUS_CLASS} not-has-[:checked]:not-has-[:disabled]:hover:border-text has-[:disabled]:cursor-not-allowed has-[:disabled]:border-dashed has-[:disabled]:bg-transparent has-[:disabled]:text-text-muted ${
                option.tone === "today" ? TODAY_RING_CLASS : ""
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={option.value === value}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                aria-describedby={error ? errorId : undefined}
                {...(error && option.value === invalidValue ? { "aria-invalid": true } : {})}
                className="sr-only"
              />
              {icon && isIconOnly ? <Icon icon={icon} /> : null}
              {icon && !isIconOnly ? (
                <span
                  className={`${CHIP_DISC_CLASS} group-has-[:checked]/chip:bg-surface group-has-[:disabled]/chip:bg-surface-sunken group-has-[:disabled]/chip:text-text-muted ${
                    isLater
                      ? "bg-warning-tint text-warning group-has-[:checked]/chip:text-warning"
                      : ""
                  }`}
                >
                  <Icon icon={icon} />
                </span>
              ) : null}
              <span className={isIconOnly ? "sr-only" : "min-w-0 break-words"}>{option.label}</span>
            </label>
          );
        })}
        {trailing}
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
