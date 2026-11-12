import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export const CONTROL_CLASS =
  "min-h-11 w-full rounded-control border border-border-control bg-surface px-3 text-text aria-[invalid=true]:border-2 aria-[invalid=true]:border-negative";

export const BUTTON_CLASS =
  "min-h-11 rounded-pill border border-text px-4 font-medium disabled:opacity-60";

interface FormFieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
}

/** A labelled control whose error is linked to it through `aria-describedby`. */
export function FormField({ id, label, error, children }: FormFieldProps) {
  const t = useTranslations("common");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="font-medium text-negative"
        >
          {t("error", { message: error })}
        </p>
      ) : null}
    </div>
  );
}
