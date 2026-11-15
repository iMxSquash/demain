"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";
import { useState, type AriaAttributes } from "react";

import { Icon } from "../components/icon";
import { CONTROL_CLASS } from "./form-field";

// The 44 px button sits 2 px inside the 48 px control (DESIGN section 9): 50 px keeps the text clear of it.
const PADDING_CLASS = "pr-[50px]";

interface PasswordInputProps {
  id: string;
  name: string;
  autoComplete: string;
  required?: boolean;
  autoFocus?: boolean;
  /** Set by FormField, which clones its one child. */
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
}

/**
 * A password field with a button that shows or hides what is typed. It stays a real
 * `input` with its own name and autocomplete, so paste and password managers keep working.
 * The label never changes: the state is carried by `aria-pressed`.
 */
export function PasswordInput({ id, ...inputProps }: PasswordInputProps) {
  const t = useTranslations("common");
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={isVisible ? "text" : "password"}
        // The value is a credential: never kept across a failed submit.
        defaultValue=""
        spellCheck={false}
        className={`${CONTROL_CLASS} ${PADDING_CLASS}`}
        {...inputProps}
      />
      <button
        type="button"
        aria-label={t("showPassword")}
        aria-controls={id}
        aria-pressed={isVisible}
        onClick={() => setIsVisible((visible) => !visible)}
        className={
          "absolute right-0.5 top-0.5 inline-flex size-11 items-center justify-center rounded-control transition-colors " +
          "hover:bg-control-hover hover:text-text " +
          (isVisible ? "text-text" : "text-text-muted")
        }
      >
        <Icon icon={isVisible ? EyeSlash : Eye} />
      </button>
    </div>
  );
}
