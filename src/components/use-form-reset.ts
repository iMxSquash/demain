"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

/**
 * Runs `onReset` once the browser has reset the form of an element. A form reset (the action of a
 * form resets it) changes the controls without a change event, so a control that mirrors its
 * value in state has to read it again afterwards.
 */
export function useFormReset(
  elementRef: RefObject<{ form: HTMLFormElement | null } | null>,
  onReset: () => void,
  isActive = true,
): void {
  const handleReset = useEffectEvent(onReset);

  useEffect(() => {
    const form = elementRef.current?.form;
    if (!isActive || !form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The event fires before the browser puts the values back.
    const afterReset = () => {
      timer = setTimeout(handleReset, 0);
    };
    form.addEventListener("reset", afterReset);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("reset", afterReset);
    };
  }, [elementRef, isActive]);
}
