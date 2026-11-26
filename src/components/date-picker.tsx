"use client";

import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { AnimatePresence, m } from "motion/react";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type Ref,
  type SyntheticEvent,
} from "react";

import { CONTROL_CLASS } from "../app/form-field";
import { CHIP_CHOSEN_CLASS, CHIP_DISC_CLASS, CHIP_PILL_CLASS, CHIP_WITH_DISC_CLASS } from "./chip";
import { useMotion } from "../app/motion-provider";
import { isCalendarDate } from "../domain/account";
import {
  formatCalendarDate,
  formatFullCalendarDate,
  formatMonth,
  formatWeekday,
  todayIn,
} from "../i18n/dates";
import {
  addMonths,
  buildMonthGrid,
  DAYS_IN_WEEK,
  resolveDateKey,
  weekStartOf,
} from "./date-picker-keyboard";
import { Icon } from "./icon";
import { useFormReset } from "./use-form-reset";
import { useIsHydrated } from "./use-is-hydrated";

// DESIGN.md, section 9: the server renders the native date input, and this component swaps it for
// the WAI-ARIA date picker dialog once the page is interactive. The native input stays in the DOM,
// hidden: it keeps the name, the form value, the reset behaviour and the `onChange` of the caller,
// so the forms behave the same with and without JavaScript (the same approach as Select, ADR-024).

const DIALOG_WIDTH = 332;
// Header 44, weekday row 36, six weeks of 44, footer 44, padding 2 x 12 and the borders.
const DIALOG_HEIGHT = 44 + 36 + 6 * 44 + 44 + 24 + 2;
const POPOVER_GAP = 6;
const VIEWPORT_MARGIN = 16;
const FOCUSABLE = "button:not([disabled]):not([tabindex='-1'])";
const DAY_BASE_CLASS = "inline-flex size-11 items-center justify-center rounded-pill tabular-nums";
const ICON_BUTTON_CLASS =
  "inline-flex size-11 items-center justify-center rounded-control text-text hover:bg-control";

export interface DatePickerHandle {
  focus: () => void;
}

// The focus and invalid events of the hidden native input never fire once the dialog is swapped in.
type NativeProps = Omit<
  ComponentProps<"input">,
  | "type"
  | "className"
  | "style"
  | "ref"
  | "value"
  | "defaultValue"
  | "min"
  | "max"
  | "step"
  | "onFocus"
  | "onBlur"
  | "onInvalid"
  | "autoFocus"
>;

export interface DatePickerProps extends NativeProps {
  /** A calendar date, "YYYY-MM-DD", or an empty string. */
  value?: string;
  defaultValue?: string;
  /** The look is the shared control: a class is refused instead of silently dropped. */
  className?: never;
  /**
   * Draws the trigger as a chip among other chips (the "When" row of the add-transaction flow):
   * `label` while no date of its own is chosen, the chosen date once `isChosen`.
   */
  chip?: { label: string; isChosen: boolean };
  ref?: Ref<DatePickerHandle>;
}

// Where the dialog sits, in viewport pixels: it is in the top layer, so no ancestor clips it.
type Anchor = { left: number; width: number } & ({ top: number } | { bottom: number });

function placeDialog(trigger: HTMLElement): Anchor {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(DIALOG_WIDTH, window.innerWidth - 2 * VIEWPORT_MARGIN);
  const centred = rect.left + rect.width / 2 - width / 2;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(centred, window.innerWidth - width - VIEWPORT_MARGIN),
  );
  const spaceBelow = window.innerHeight - rect.bottom;
  const isAbove = spaceBelow < DIALOG_HEIGHT + POPOVER_GAP && rect.top > spaceBelow;
  return isAbove
    ? { left, width, bottom: window.innerHeight - rect.top + POPOVER_GAP }
    : { left, width, top: rect.bottom + POPOVER_GAP };
}

// The top layer lifts the dialog above any ancestor that clips or scrolls, and above an open dialog.
function showAsPopover(element: HTMLElement | null) {
  if (element !== null && !element.matches(":popover-open")) element.showPopover();
}

// Setting `.value` on the element would update React's own record of it, and the `onChange` of a
// controlled input would never hear of the change: the prototype setter leaves that record alone.
function writeValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function DatePicker({
  ref,
  id,
  value,
  defaultValue = "",
  disabled = false,
  required = false,
  chip,
  onChange,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  ...nativeProps
}: DatePickerProps) {
  const isEnhanced = useIsHydrated();
  const motion = useMotion();
  const t = useTranslations("common.datePicker");
  const locale = useLocale();
  const timeZone = useTimeZone();
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-date`;
  const titleId = `${generatedId}-title`;
  const dialogId = `${generatedId}-dialog`;

  const nativeRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The day button takes the focus after the render that shows it, not before.
  const shouldFocusDayRef = useRef(false);

  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedDate, setFocusedDate] = useState("");
  const [today, setToday] = useState("");
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const currentValue = isControlled ? value : uncontrolledValue;
  const chosenDate = isCalendarDate(currentValue) ? currentValue : "";
  if (disabled && isOpen) setIsOpen(false);
  const isDialogShown = isOpen && !disabled && anchor !== null;
  const weekStart = weekStartOf(locale);
  const viewMonth = focusedDate.slice(0, 7);

  const closeDialog = useCallback(() => setIsOpen(false), []);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => (triggerRef.current ?? nativeRef.current)?.focus(),
    }),
    [],
  );

  // A form reset (React 19 resets the form after an action) puts the native input back on its default.
  useFormReset(
    nativeRef,
    () => setUncontrolledValue(nativeRef.current?.value ?? ""),
    isEnhanced && !isControlled,
  );

  // A pointer press outside closes the dialog; the focus is not moved.
  useEffect(() => {
    if (!isDialogShown) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && wrapperRef.current?.contains(event.target)) return;
      closeDialog();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [isDialogShown, closeDialog]);

  // The dialog does not follow its trigger: a scroll outside it or a resize closes it.
  useEffect(() => {
    if (!isDialogShown) return;
    const closeOnMove = (event: Event) => {
      if (event.target instanceof Node && dialogRef.current?.contains(event.target)) return;
      closeDialog();
    };
    window.addEventListener("scroll", closeOnMove, { capture: true, passive: true });
    window.addEventListener("resize", closeOnMove);
    return () => {
      window.removeEventListener("scroll", closeOnMove, { capture: true });
      window.removeEventListener("resize", closeOnMove);
    };
  }, [isDialogShown, closeDialog]);

  // A native input only takes the focus when its label is pressed; the button would open the dialog.
  useEffect(() => {
    if (!isEnhanced) return;
    const trigger = triggerRef.current;
    const labels = Array.from(trigger?.labels ?? []);
    const focusInstead = (event: Event) => {
      if (event.target instanceof Node && wrapperRef.current?.contains(event.target)) return;
      event.preventDefault();
      trigger?.focus();
    };
    for (const label of labels) label.addEventListener("click", focusInstead);
    return () => {
      for (const label of labels) label.removeEventListener("click", focusInstead);
    };
  }, [isEnhanced, triggerId]);

  // `preventScroll`: a scroll of the page would close the dialog the moment it opens.
  useEffect(() => {
    if (!isDialogShown || !shouldFocusDayRef.current) return;
    shouldFocusDayRef.current = false;
    dialogRef.current
      ?.querySelector<HTMLElement>(`[data-date="${focusedDate}"]`)
      ?.focus({ preventScroll: true });
  }, [isDialogShown, focusedDate]);

  function openDialog() {
    const trigger = triggerRef.current;
    if (trigger === null) return;
    // "Today" is the day in the time zone of the app, the same one the server uses for its own.
    const now = todayIn(timeZone ?? "UTC", new Date());
    setToday(now);
    setAnchor(placeDialog(trigger));
    moveTo(chosenDate === "" ? now : chosenDate, true);
    setIsOpen(true);
  }

  function moveTo(date: string, shouldFocusDay: boolean) {
    shouldFocusDayRef.current = shouldFocusDay;
    setFocusedDate(date);
  }

  function choose(date: string) {
    const native = nativeRef.current;
    closeDialog();
    triggerRef.current?.focus();
    if (native === null || native.value === date) return;
    writeValue(native, date);
    if (!isControlled) setUncontrolledValue(date);
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLElement>) {
    const action = resolveDateKey(
      { focused: focusedDate },
      event.key,
      { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey },
      weekStart,
    );
    if (action.type === "none" || action.type === "close") return;
    event.preventDefault();
    if (action.type === "move") moveTo(action.date, true);
    else choose(action.date);
  }

  // Escape closes and returns the focus to the field; Tab turns around inside the dialog.
  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      // The Escape that closes the picker is not meant for a dialog around it.
      event.stopPropagation();
      closeDialog();
      triggerRef.current?.focus();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    const edge = event.shiftKey ? first : last;
    if (document.activeElement !== edge) return;
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }

  const shownDate = chosenDate === "" ? " " : formatCalendarDate(chosenDate, locale);

  return (
    <div ref={wrapperRef} className={chip ? "relative" : "relative w-full"}>
      {/* Without JavaScript this is the control. Once swapped, it only carries the value. */}
      <input
        {...nativeProps}
        ref={nativeRef}
        type="date"
        {...(isEnhanced
          ? {
              hidden: true,
              tabIndex: -1,
              "aria-hidden": true,
              // A hidden control cannot show the browser's message: the focus goes to the trigger instead.
              onInvalid: (event: SyntheticEvent<HTMLInputElement>) => {
                event.preventDefault();
                triggerRef.current?.focus();
              },
            }
          : {
              id,
              className: CONTROL_CLASS,
              "aria-describedby": ariaDescribedby,
              "aria-invalid": ariaInvalid,
              "aria-label": ariaLabel,
              "aria-labelledby": ariaLabelledby,
            })}
        {...(isControlled ? { value } : { defaultValue })}
        required={required}
        disabled={disabled}
        onChange={onChange}
      />
      {isEnhanced ? (
        <>
          {/* A button does not support aria-invalid, but the shared control style and useFocusFirstError
              both read it; the error itself is announced through aria-describedby. */}
          {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
          <button
            ref={triggerRef}
            id={triggerId}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isDialogShown}
            aria-controls={isDialogShown ? dialogId : undefined}
            aria-describedby={ariaDescribedby}
            aria-invalid={ariaInvalid}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            disabled={disabled}
            onClick={() => (isDialogShown ? closeDialog() : openDialog())}
            className={
              chip
                ? `${CHIP_PILL_CLASS} ${CHIP_WITH_DISC_CLASS} ${chip.isChosen ? CHIP_CHOSEN_CLASS : "hover:border-text"}`
                : `${CONTROL_CLASS} flex cursor-pointer items-center justify-between gap-2 text-left`
            }
          >
            {chip ? (
              <>
                <span className={`${CHIP_DISC_CLASS} ${chip.isChosen ? "bg-surface" : ""}`}>
                  <Icon icon={CalendarBlank} />
                </span>
                <span>{chip.isChosen ? shownDate : chip.label}</span>
              </>
            ) : (
              <>
                <span className="truncate">{shownDate}</span>
                <span className="inline-flex shrink-0">
                  <Icon icon={CalendarBlank} />
                </span>
              </>
            )}
          </button>
          <AnimatePresence>
            {isDialogShown ? (
              <m.div
                key="dialog"
                ref={(element: HTMLDivElement | null) => {
                  dialogRef.current = element;
                  showAsPopover(element);
                }}
                id={dialogId}
                popover="manual"
                role="dialog"
                aria-modal="true"
                aria-label={t("dialog")}
                style={anchor}
                initial={{
                  opacity: 0,
                  y: "top" in anchor ? motion.offset.rise : -motion.offset.rise,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { duration: motion.duration.enter, ease: motion.ease.enter },
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: motion.duration.exit, ease: motion.ease.exit },
                }}
                onKeyDown={handleDialogKeyDown}
                className="m-0 inset-auto overflow-visible rounded-control border border-divider bg-surface p-3 text-text shadow-overlay"
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    aria-label={t("previousMonth")}
                    onClick={() => moveTo(addMonths(focusedDate, -1), false)}
                    className={ICON_BUTTON_CLASS}
                  >
                    <Icon icon={CaretLeft} />
                  </button>
                  <h2 id={titleId} aria-live="polite" className="text-body font-medium">
                    {formatMonth(viewMonth, locale)}
                  </h2>
                  <button
                    type="button"
                    aria-label={t("nextMonth")}
                    onClick={() => moveTo(addMonths(focusedDate, 1), false)}
                    className={ICON_BUTTON_CLASS}
                  >
                    <Icon icon={CaretRight} />
                  </button>
                </div>
                <div role="grid" aria-labelledby={titleId} onKeyDown={handleGridKeyDown}>
                  <div role="row" className="grid grid-cols-7">
                    {Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
                      const weekday = (weekStart + index) % DAYS_IN_WEEK;
                      return (
                        <div
                          key={weekday}
                          role="columnheader"
                          className="flex h-9 items-center justify-center text-caption text-text-muted"
                        >
                          <span aria-hidden="true">{formatWeekday(weekday, locale, "short")}</span>
                          <span className="sr-only">{formatWeekday(weekday, locale, "long")}</span>
                        </div>
                      );
                    })}
                  </div>
                  {buildMonthGrid(viewMonth, weekStart).map((week) => (
                    <div key={week[0]} role="row" className="grid grid-cols-7">
                      {week.map((date) => {
                        if (!date.startsWith(viewMonth)) return <div key={date} role="gridcell" />;
                        const isChosen = date === chosenDate;
                        const isToday = date === today;
                        return (
                          <div
                            key={date}
                            role="gridcell"
                            aria-selected={isChosen}
                            className="flex justify-center"
                          >
                            <button
                              type="button"
                              data-date={date}
                              tabIndex={date === focusedDate ? 0 : -1}
                              aria-current={isToday ? "date" : undefined}
                              aria-label={formatFullCalendarDate(date, locale)}
                              onClick={() => choose(date)}
                              className={`${DAY_BASE_CLASS} ${
                                isChosen
                                  ? "bg-primary font-medium text-on-primary"
                                  : isToday
                                    ? "text-accent ring-[1.5px] ring-inset ring-accent hover:bg-control"
                                    : "text-text hover:bg-control"
                              }`}
                            >
                              {Number(date.slice(8))}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => choose(today)}
                    className="min-h-11 rounded-control px-3 text-accent underline underline-offset-4"
                  >
                    {t("today")}
                  </button>
                </div>
              </m.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}
    </div>
  );
}
