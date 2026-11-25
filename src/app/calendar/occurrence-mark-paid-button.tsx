"use client";

import { useEffect, useRef } from "react";

import { MarkPaidButton, type MarkPaidButtonText } from "../planned/mark-paid-form";
import type { MarkPaidFormValues } from "../planned/mark-paid-form-data";
import { focusFallbackIfLost } from "./focus-targets";

interface OccurrenceMarkPaidButtonProps {
  itemId: number;
  nominalDate: string;
  text: MarkPaidButtonText;
  values: MarkPaidFormValues;
}

/**
 * "Mark as paid" in the calendar. Once recorded, the occurrence is listed through its transaction
 * and its row leaves with the button: the focus then goes to the nearest heading.
 */
export function OccurrenceMarkPaidButton(props: OccurrenceMarkPaidButtonProps) {
  const isRecordedRef = useRef(false);

  useEffect(
    () => () => {
      if (isRecordedRef.current) focusFallbackIfLost();
    },
    [],
  );

  return (
    <MarkPaidButton
      {...props}
      onRecorded={() => {
        isRecordedRef.current = true;
      }}
    />
  );
}
