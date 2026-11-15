import { WarningCircle } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";
import { cloneElement, type AriaAttributes, type ReactElement } from "react";

import { Icon } from "../components/icon";

// The hover and focus borders skip an invalid control: their selectors are more specific than
// the invalid one and would otherwise turn the red border ink while the pointer is on it.
// Read-only uses the attribute, not `read-only:`, which also matches every select, file input
// and disabled input.
export const CONTROL_CLASS =
  "min-h-12 w-full rounded-control border border-border-control bg-control px-3 text-text transition-colors " +
  "not-aria-[invalid=true]:enabled:hover:border-text not-aria-[invalid=true]:focus-visible:border-text " +
  "aria-[invalid=true]:border-2 aria-[invalid=true]:border-negative " +
  "[&[readonly]]:bg-transparent " +
  "disabled:cursor-not-allowed disabled:border-divider disabled:bg-surface-sunken disabled:text-text-muted";

interface ControlProps {
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
}

interface FormFieldProps {
  id: string;
  label: string;
  /** Marks the field as optional, in muted text after the label. */
  optional?: boolean;
  /** What the user needs before typing: a format, a unit, a consequence. Never a substitute for the label. */
  hint?: string;
  error?: string | undefined;
  /** The one control of the field: FormField links the hint and the error to it. */
  children: ReactElement<ControlProps>;
}

function joinIds(...ids: (string | undefined)[]): string | undefined {
  const unique = new Set(ids.flatMap((value) => value?.split(" ") ?? []).filter(Boolean));
  return unique.size === 0 ? undefined : [...unique].join(" ");
}

/**
 * A labelled control with an optional hint above it and an error under it. The hint and
 * the error are linked to the control through `aria-describedby`, so a caller never
 * builds that attribute by hand.
 */
export function FormField({ id, label, optional = false, hint, error, children }: FormFieldProps) {
  const t = useTranslations("common");
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = joinIds(
    children.props["aria-describedby"],
    hint ? hintId : undefined,
    error ? errorId : undefined,
  );

  // Only the attributes that apply are set: an explicit `undefined` would erase the caller's own.
  const control = cloneElement(children, {
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(error ? { "aria-invalid": true } : {}),
  });

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-caption font-medium text-text">
        {label}
        {optional ? <span className="font-regular text-text-muted"> {t("optional")}</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-caption text-text-muted">
          {hint}
        </p>
      ) : null}
      {control}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2 text-caption font-medium text-negative"
        >
          <Icon icon={WarningCircle} />
          <span>{t("error", { message: error })}</span>
        </p>
      ) : null}
    </div>
  );
}
