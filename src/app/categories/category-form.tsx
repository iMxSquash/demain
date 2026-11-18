"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Button } from "../../components/button";
import { categoryIconOf } from "../../components/category-icons";
import { ChoiceChips, type ChipOption } from "../../components/choice-chips";
import { CATEGORY_ICONS } from "../../domain/category";
import { CONTROL_CLASS, FormField } from "../form-field";
import { useFocusFirstError } from "../use-focus-first-error";
import type { CategoryFormState } from "./category-form-data";

interface CategoryFormProps {
  action: (
    previous: CategoryFormState | null,
    formData: FormData,
  ) => Promise<CategoryFormState | null>;
  initialName: string;
  initialIcon: string;
  submitLabel: string;
  /** Adds a Cancel button next to the submit one, for a form shown in a modal. */
  onCancel?: () => void;
}

/** A category has a name and an icon: the form asks for both, the icon among the closed set. */
export function CategoryForm({
  action,
  initialName,
  initialIcon,
  submitLabel,
  onCancel,
}: CategoryFormProps) {
  const t = useTranslations("categories");
  const common = useTranslations("common");
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useFocusFirstError(state);
  const [icon, setIcon] = useState(initialIcon);
  const [seenState, setSeenState] = useState(state);
  // The key remounts the radios after a result: the automatic form reset sends them back to
  // their first checked state and React does not re-apply an unchanged `checked`.
  const [resultCount, setResultCount] = useState(0);
  if (state !== seenState) {
    setSeenState(state);
    setResultCount((count) => count + 1);
    if (state !== null) setIcon(state.icon);
  }
  const name = state?.name ?? initialName;
  const nameError = state?.field === "name" ? state.message : undefined;
  const iconError = state?.field === "icon" ? state.message : undefined;
  const iconOptions: ChipOption[] = CATEGORY_ICONS.map((key) => ({
    value: key,
    label: t(`icons.${key}`),
    icon: categoryIconOf(key),
  }));

  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      <FormField id="name" label={t("name")} error={nameError}>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={name}
          required
          autoComplete="off"
          className={CONTROL_CLASS}
        />
      </FormField>

      <ChoiceChips
        key={resultCount}
        id="icon"
        legend={t("icon")}
        name="icon"
        value={icon}
        onChange={setIcon}
        options={iconOptions}
        layout="icons"
        error={iconError}
      />

      <div className="flex gap-2">
        <Button type="submit" pending={isPending} pendingLabel={common("pending")}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {common("cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
