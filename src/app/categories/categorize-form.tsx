"use client";

import { useActionState } from "react";

import { CONTROL_CLASS } from "../form-field";
import type { CategorizeState } from "./category-form-data";

interface CategorizeFormProps {
  action: (
    previous: CategorizeState | null,
    formData: FormData,
  ) => Promise<CategorizeState | null>;
  /** Label of the transaction, to name the controls for screen readers. */
  transactionLabel: string;
  /** Unique per row: the queue shows many of these forms on one page. */
  idPrefix: string;
  categories: { id: number; name: string }[];
}

export function CategorizeForm({
  action,
  transactionLabel,
  idPrefix,
  categories,
}: CategorizeFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const selectId = `${idPrefix}-category`;
  const errorId = `${idPrefix}-error`;

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <label htmlFor={selectId} className="sr-only">
          Category for {transactionLabel}
        </label>
        <select
          id={selectId}
          name="categoryId"
          defaultValue=""
          className={CONTROL_CLASS}
          aria-invalid={state ? true : undefined}
          aria-describedby={state ? errorId : undefined}
        >
          <option value="">Choose a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="min-h-11 px-2 underline disabled:opacity-60"
        >
          Categorize<span className="sr-only"> {transactionLabel}</span>
        </button>
      </div>
      {state ? (
        <p id={errorId} role="alert" className="font-medium text-red-800">
          Error: {state.message}
        </p>
      ) : null}
    </form>
  );
}
