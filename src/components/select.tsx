"use client";

import { CaretDown, Check } from "@phosphor-icons/react/ssr";
import { AnimatePresence, m } from "motion/react";
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from "react";

import { CONTROL_CLASS } from "../app/form-field";
import { useMotion } from "../app/motion-provider";
import { Icon } from "./icon";
import { firstEnabled, resolveSelectKey, type SelectOption } from "./select-keyboard";
import { useFormReset } from "./use-form-reset";
import { useIsHydrated } from "./use-is-hydrated";

// DESIGN.md, section 9: the server renders the native select, and this component swaps it for a
// select-only combobox once the page is interactive. The native select stays in the DOM, hidden:
// it keeps the name, the form value, the reset behaviour and the `onChange` of the caller, so the
// forms behave the same with and without JavaScript.

const TYPEAHEAD_RESET_MS = 500;
const LIST_MAX_HEIGHT = 296;
const LIST_PADDING = 12;
const POPOVER_GAP = 6;
const OPTION_HEIGHT = 44;
const VIEWPORT_MARGIN = 8;

interface LabelledOption extends SelectOption {
  lang?: string;
}

export interface SelectHandle {
  focus: () => void;
}

// The top layer lifts the list above any ancestor that clips or scrolls, and above an open dialog.
function showAsPopover(element: HTMLElement | null) {
  if (element !== null && !element.matches(":popover-open")) element.showPopover();
}

// The focus and invalid events of the hidden native select never fire once the combobox is swapped
// in, and a list of values is for `multiple`: none of them is accepted.
type NativeProps = Omit<
  ComponentProps<"select">,
  | "className"
  | "style"
  | "multiple"
  | "size"
  | "ref"
  | "value"
  | "defaultValue"
  | "onFocus"
  | "onBlur"
  | "onInvalid"
  | "autoFocus"
>;

export interface SelectProps extends NativeProps {
  value?: string | number;
  defaultValue?: string | number;
  /** The look is the shared control: a class is refused instead of silently dropped. */
  className?: never;
  /** Fits the content instead of the width of the column. */
  inline?: boolean;
  ref?: Ref<SelectHandle>;
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

// Only <option> (alone, in arrays or in fragments) is read: the list is drawn from them. Anything
// else, an <optgroup> or a component that returns options, would be in the native select and
// missing from the list, so it is refused loudly instead of dropped.
function readOptions(children: ReactNode): LabelledOption[] {
  const options: LabelledOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<ComponentProps<"option">>(child)) return;
    if (child.type === Fragment) {
      options.push(...readOptions(child.props.children));
      return;
    }
    if (child.type !== "option") {
      throw new Error("Select only accepts <option> children, alone, in arrays or in fragments.");
    }
    // The text of an option as the native select reads it: whitespace collapsed and trimmed.
    const label = textOf(child.props.children).replace(/\s+/g, " ").trim();
    options.push({
      value: child.props.value === undefined ? label : String(child.props.value),
      label,
      disabled: child.props.disabled === true,
      ...(child.props.lang === undefined ? {} : { lang: child.props.lang }),
    });
  });
  return options;
}

// Where the popover sits, in viewport pixels: it is in the top layer, so no ancestor clips it.
// `maxHeight` is the room left on its side, so the list scrolls instead of leaving the screen.
type Anchor = { left: number; width: number; maxHeight: number } & ({ top: number } | { bottom: number });

export function Select({
  inline = false,
  ref,
  id,
  value,
  defaultValue,
  disabled = false,
  required = false,
  children,
  onChange,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  ...nativeProps
}: SelectProps) {
  const isEnhanced = useIsHydrated();
  const motion = useMotion();
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-select`;
  const listId = `${generatedId}-list`;
  const options = readOptions(children);

  const nativeRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(() =>
    String(defaultValue ?? options.find((option) => option.disabled !== true)?.value ?? ""),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // The ring of the active option is for keyboard users: a pointer already shows where it is.
  const [isKeyboardActive, setIsKeyboardActive] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  // An uncontrolled select whose options changed falls back on the first one, as the native select does.
  const currentValue = isControlled
    ? String(value)
    : options.some((option) => option.value === uncontrolledValue)
      ? uncontrolledValue
      : (options[firstEnabled(options)]?.value ?? "");
  const selectedIndex = options.findIndex((option) => option.value === currentValue);
  // A list left open by a select that gets disabled must not come back by itself when it is enabled again.
  if (disabled && isOpen) setIsOpen(false);
  const isListShown = isOpen && !disabled;

  // A search never outlives the list it was typed in, whatever closes the list.
  const closeList = useCallback(() => {
    typeaheadRef.current = "";
    setIsOpen(false);
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => (triggerRef.current ?? nativeRef.current)?.focus(),
  }), []);

  // A form reset (React 19 resets the form after an action) puts the native select back on its default.
  useFormReset(nativeRef, () => setUncontrolledValue(nativeRef.current?.value ?? ""), isEnhanced && !isControlled);

  // A pointer press outside closes the list; the focus is not moved.
  useEffect(() => {
    if (!isListShown) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && wrapperRef.current?.contains(event.target)) return;
      closeList();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [isListShown, closeList]);

  // The popover does not follow its trigger: a scroll outside the list or a resize closes it, as a native select does.
  useEffect(() => {
    if (!isListShown) return;
    const closeOnMove = (event: Event) => {
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return;
      closeList();
    };
    window.addEventListener("scroll", closeOnMove, { capture: true, passive: true });
    window.addEventListener("resize", closeOnMove);
    return () => {
      window.removeEventListener("scroll", closeOnMove, { capture: true });
      window.removeEventListener("resize", closeOnMove);
    };
  }, [isListShown, closeList]);

  // A native select only takes the focus when its label is pressed; the button would open the list.
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

  useEffect(() => {
    if (!isListShown || activeIndex < 0) return;
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [isListShown, activeIndex, listId]);

  useEffect(() => () => clearTimeout(typeaheadTimerRef.current), []);

  function openAt(index: number, isKeyboard: boolean) {
    const trigger = triggerRef.current;
    if (trigger !== null) {
      const rect = trigger.getBoundingClientRect();
      const listHeight = Math.min(options.length * OPTION_HEIGHT, LIST_MAX_HEIGHT) + LIST_PADDING + POPOVER_GAP;
      const spaceBelow = window.innerHeight - rect.bottom;
      const isAbove = spaceBelow < listHeight && rect.top > spaceBelow;
      const room = (isAbove ? rect.top : spaceBelow) - POPOVER_GAP - LIST_PADDING - VIEWPORT_MARGIN;
      setAnchor({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(room, OPTION_HEIGHT),
        ...(isAbove
          ? { bottom: window.innerHeight - rect.top + POPOVER_GAP }
          : { top: rect.bottom + POPOVER_GAP }),
      });
    }
    activate(index, isKeyboard);
    setIsOpen(true);
  }

  function activate(index: number, isKeyboard: boolean) {
    setActiveIndex(index);
    setIsKeyboardActive(isKeyboard);
  }

  function choose(index: number) {
    const option = options[index];
    const native = nativeRef.current;
    closeList();
    if (option === undefined || option.disabled === true || native === null) return;
    if (native.value !== option.value) {
      native.value = option.value;
      // The caller's `onChange` and the form listen to the native select, as they always did.
      native.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (!isControlled) setUncontrolledValue(option.value);
  }

  function rememberTypeahead(buffer: string) {
    typeaheadRef.current = buffer;
    clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = setTimeout(() => {
      typeaheadRef.current = "";
    }, TYPEAHEAD_RESET_MS);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const action = resolveSelectKey(
      {
        isOpen: isListShown,
        activeIndex: isListShown ? activeIndex : selectedIndex,
        typeahead: typeaheadRef.current,
      },
      event.key,
      options,
      { alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey },
    );
    if (action.type === "none") return;
    if (action.preventDefault) event.preventDefault();

    switch (action.type) {
      case "open":
        openAt(action.activeIndex, true);
        break;
      case "move":
        activate(action.activeIndex, true);
        break;
      case "commit":
        choose(action.activeIndex);
        break;
      case "close":
        // The Escape that closes the list is not meant for a dialog around it.
        if (event.key === "Escape") event.stopPropagation();
        closeList();
        break;
      case "typeahead":
        rememberTypeahead(action.buffer);
        if (isListShown) activate(action.activeIndex, true);
        else openAt(action.activeIndex, true);
        break;
    }
  }

  const selectedLabel = options[selectedIndex]?.label ?? "";
  const widthClass = inline ? "w-auto" : "w-full";

  return (
    <div ref={wrapperRef} className={`relative ${widthClass}`}>
      {/* Without JavaScript this is the control. Once swapped, it only carries the value. */}
      <select
        {...nativeProps}
        ref={nativeRef}
        {...(isEnhanced
          ? {
              hidden: true,
              tabIndex: -1,
              "aria-hidden": true,
              // A hidden control cannot show the browser's message: the focus goes to the combobox instead.
              onInvalid: (event: SyntheticEvent<HTMLSelectElement>) => {
                event.preventDefault();
                triggerRef.current?.focus();
              },
            }
          : {
              id,
              className: `${CONTROL_CLASS} ${widthClass}`,
              "aria-describedby": ariaDescribedby,
              "aria-invalid": ariaInvalid,
              "aria-label": ariaLabel,
              "aria-labelledby": ariaLabelledby,
            })}
        {...(isControlled ? { value } : { defaultValue })}
        required={required}
        disabled={disabled}
        onChange={onChange}
      >
        {children}
      </select>
      {isEnhanced ? (
        <>
          <button
            ref={triggerRef}
            id={triggerId}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={isListShown}
            aria-controls={listId}
            aria-activedescendant={isListShown && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            aria-describedby={ariaDescribedby}
            aria-invalid={ariaInvalid}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            aria-required={required || undefined}
            disabled={disabled}
            onClick={() => {
              if (isListShown) closeList();
              else openAt(selectedIndex >= 0 ? selectedIndex : firstEnabled(options), false);
            }}
            onKeyDown={handleKeyDown}
            onBlur={closeList}
            className={`${CONTROL_CLASS} flex cursor-pointer items-center justify-between gap-2 text-left`}
          >
            <span className="truncate">{selectedLabel === "" ? " " : selectedLabel}</span>
            <span
              className={`inline-flex shrink-0 transition-transform ${isListShown ? "rotate-180" : ""}`}
            >
              <Icon icon={CaretDown} />
            </span>
          </button>
          <AnimatePresence>
            {isListShown && anchor !== null ? (
              <m.div
                key="popover"
                ref={showAsPopover}
                popover="manual"
                style={anchor}
                initial={{ opacity: 0, y: "top" in anchor ? motion.offset.rise : -motion.offset.rise }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { duration: motion.duration.enter, ease: motion.ease.enter },
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: motion.duration.exit, ease: motion.ease.exit },
                }}
                className="m-0 inset-auto overflow-visible rounded-control border border-divider bg-surface p-1.5 text-text shadow-overlay"
              >
                <ul
                  ref={listRef}
                  id={listId}
                  role="listbox"
                  // A scrolling list is a tab stop in some browsers: Tab must leave the combobox, not enter the list.
                  tabIndex={-1}
                  aria-labelledby={ariaLabelledby ?? triggerId}
                  // Keeps the focus on the combobox while the pointer picks an option.
                  onMouseDown={(event) => event.preventDefault()}
                  style={{ maxHeight: Math.min(LIST_MAX_HEIGHT, anchor.maxHeight) }}
                  className="overflow-y-auto"
                >
                  {options.map((option, index) => (
                    <li
                      key={index}
                      id={`${listId}-${index}`}
                      role="option"
                      lang={option.lang}
                      aria-selected={index === selectedIndex}
                      aria-disabled={option.disabled === true ? true : undefined}
                      onMouseMove={() => {
                        if (option.disabled === true || (index === activeIndex && !isKeyboardActive)) return;
                        activate(index, false);
                      }}
                      onClick={() => {
                        if (option.disabled === true) return;
                        choose(index);
                      }}
                      className={`flex min-h-11 items-center justify-between gap-3 rounded-[calc(var(--radius-control)-6px)] px-3 py-2 ${
                        option.disabled === true ? "cursor-not-allowed text-text-muted" : "cursor-pointer text-text"
                      } ${index === selectedIndex ? "font-medium" : ""} ${
                        index === activeIndex && option.disabled !== true ? "bg-control" : ""
                      } ${index === activeIndex && isKeyboardActive ? "ring-2 ring-inset ring-focus" : ""}`}
                    >
                      <span>{option.label === "" ? " " : option.label}</span>
                      {index === selectedIndex ? <Icon icon={Check} /> : null}
                    </li>
                  ))}
                </ul>
              </m.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}
    </div>
  );
}
