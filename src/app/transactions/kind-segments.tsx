import { ArrowDown, ArrowsLeftRight, ArrowUp, Percent } from "@phosphor-icons/react/ssr";

import { Icon } from "../../components/icon";

export const KIND_ICON = {
  expense: ArrowUp,
  income: ArrowDown,
  transfer: ArrowsLeftRight,
  interest: Percent,
} as const;
export const KIND_TONE = {
  expense: "text-negative",
  income: "text-positive",
  transfer: "",
  interest: "text-positive",
} as const;

interface KindSegmentsProps<Kind extends keyof typeof KIND_ICON> {
  /** The name of the radios, posted with the form. */
  name: string;
  legend: string;
  options: readonly Kind[];
  value: Kind;
  onChange: (kind: Kind) => void;
  labelOf: (kind: Kind) => string;
}

/** The type segments (Out, In, Move, Interest), native radios drawn as one segmented control. */
export function KindSegments<Kind extends keyof typeof KIND_ICON>({
  name,
  legend,
  options,
  value,
  onChange,
  labelOf,
}: KindSegmentsProps<Kind>) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      {/* A utility class, not an inline style: the CSP forbids style attributes. */}
      <div
        className={`segmented raised grid w-full [&_label]:gap-1 [&_label]:px-0 [&_label]:text-caption ${
          options.length === 4 ? "[--n:4]" : "[--n:3]"
        }`}
      >
        {options.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={option === value}
              onChange={() => onChange(option)}
            />
            <span className={KIND_TONE[option]}>
              <Icon icon={KIND_ICON[option]} />
            </span>
            {labelOf(option)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
