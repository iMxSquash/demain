"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "../../components/button";
import { MOVEMENT_TYPES } from "../../domain/import-columns";
import type { VocabularyField } from "../../ledger/type-vocabulary";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type { VocabularyFormState } from "./vocabulary-form-data";
import { Select } from "../../components/select";

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
  const errorOf = (field: VocabularyField) => (state?.field === field ? state.message : undefined);

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      <FormField
        id="vocabulary-word"
        label={t("word")}
        hint={t("wordHint")}
        error={errorOf("word")}
      >
        <input
          id="vocabulary-word"
          name="word"
          type="text"
          defaultValue={values?.word ?? ""}
          required
          autoComplete="off"
          className={CONTROL_CLASS}
        />
      </FormField>

      <FormField id="vocabulary-type" label={t("type")} error={errorOf("type")}>
        <Select id="vocabulary-type" name="type" defaultValue={values?.type ?? "income"}>
          {MOVEMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </Select>
      </FormField>

      <Button
        type="submit"
        pending={isPending}
        pendingLabel={t("addSubmitPending")}
        className="self-start"
      >
        {t("addSubmit")}
      </Button>
    </form>
  );
}
