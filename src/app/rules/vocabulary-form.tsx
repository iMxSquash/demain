"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { MOVEMENT_TYPES } from "../../domain/import-columns";
import type { VocabularyField } from "../../ledger/type-vocabulary";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type { VocabularyFormState } from "./vocabulary-form-data";

interface VocabularyFormProps {
  action: (
    previous: VocabularyFormState | null,
    formData: FormData,
  ) => Promise<VocabularyFormState | null>;
}

export function VocabularyForm({ action }: VocabularyFormProps) {
  const t = useTranslations("rules.vocabulary");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  const values = state?.values;
  const errorOf = (field: VocabularyField) =>
    state?.field === field ? state.message : undefined;
  const describedBy = (field: VocabularyField) =>
    errorOf(field) ? `vocabulary-${field}-error` : undefined;

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      <FormField id="vocabulary-word" label={t("word")} error={errorOf("word")}>
        <input
          id="vocabulary-word"
          name="word"
          type="text"
          defaultValue={values?.word ?? ""}
          required
          autoComplete="off"
          className={CONTROL_CLASS}
          aria-invalid={errorOf("word") ? true : undefined}
          aria-describedby={["vocabulary-word-hint", describedBy("word")].filter(Boolean).join(" ")}
        />
        <p id="vocabulary-word-hint">{t("wordHint")}</p>
      </FormField>

      <FormField id="vocabulary-type" label={t("type")} error={errorOf("type")}>
        <select
          id="vocabulary-type"
          name="type"
          defaultValue={values?.type ?? "income"}
          className={CONTROL_CLASS}
          aria-invalid={errorOf("type") ? true : undefined}
          aria-describedby={describedBy("type")}
        >
          {MOVEMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </select>
      </FormField>

      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 self-start rounded-pill bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        {t("addSubmit")}
      </button>
    </form>
  );
}
