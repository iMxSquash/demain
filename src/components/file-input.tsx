"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ChangeEvent, type ComponentPropsWithoutRef } from "react";

import { buttonClass } from "./button";

// The button is the label of the input, so a click or a tap opens the native picker without
// JavaScript. The input stays in the page, visually hidden, and the ring of its focus is drawn on
// the button (DESIGN section 8, "File input").
const BUTTON_CLASS =
  `${buttonClass("secondary")} cursor-pointer shrink-0 ` +
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus " +
  "peer-disabled:cursor-not-allowed peer-disabled:bg-surface-sunken peer-disabled:text-text-muted";

type FileInputProps = Omit<ComponentPropsWithoutRef<"input">, "type" | "className" | "children"> & {
  /** The same `id` as the field: FormField's label points at the input. */
  id: string;
};

export function FileInput({ onChange, ...rest }: FileInputProps) {
  const t = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<string | null>(null);

  // A form reset (the action of a form resets it) clears the files without a change event.
  useEffect(() => {
    const form = inputRef.current?.form;
    const clear = () => setSummary(null);
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);

  function describeFiles(files: FileList | null): string | null {
    if (files === null || files.length === 0) return null;
    return files.length === 1 ? (files[0]?.name ?? null) : t("filesChosen", { count: files.length });
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setSummary(describeFiles(event.currentTarget.files));
    onChange?.(event);
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <input {...rest} ref={inputRef} type="file" onChange={handleChange} className="peer sr-only" />
      <label htmlFor={rest.id} className={BUTTON_CLASS}>
        {t("chooseFile")}
      </label>
      <span className={`min-w-0 truncate ${summary === null ? "text-text-muted" : "text-text"}`}>
        {summary ?? t("noFileChosen")}
      </span>
    </div>
  );
}
