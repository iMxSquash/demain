"use client";

import { useEffect, useRef } from "react";

/**
 * Moves focus to the first invalid control once a submit has been refused, so
 * that keyboard and screen reader users land on what to fix (WCAG 3.3.1). The
 * state is the result of the server action: a new object on every submit.
 */
export function useFocusFirstError(state: unknown) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state === null || state === undefined) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [state]);

  return formRef;
}
