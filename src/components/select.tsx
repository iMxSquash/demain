"use client";

import { CaretDown, Check } from "@phosphor-icons/react/ssr";
import { AnimatePresence, m } from "motion/react";
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

import { CONTROL_CLASS } from "../app/form-field";
import { useMotion } from "../app/motion-provider";
import { Icon } from "./icon";
import { firstEnabled, resolveSelectKey, type SelectOption } from "./select-keyboard";

// DESIGN.md, section 9: the server renders the native select, and this component swaps it for a
// select-only combobox once the page is interactive. The native select stays in the DOM, hidden:
// it keeps the name, the form value, the reset behaviour and the `onChange` of the caller, so the
// forms behave the same with and without JavaScript.

const TYPEAHEAD_RESET_MS = 500;
const LIST_MAX_HEIGHT = 296;
const LIST_PADDING = 12;
const POPOVER_GAP = 6;
const OPTION_HEIGHT = 44;

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

type NativeProps = Omit<ComponentProps<"select">, "className" | "style" | "multiple" | "size" | "ref">;

export interface SelectProps extends NativeProps {
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

function readOptions(children: ReactNode): LabelledOption[] {
  const options: LabelledOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<ComponentProps<"option">>(child)) return;
    if (child.type === Fragment) {
      options.push(...readOptions(child.props.children));
      return;
    }
    if (child.type !== "option") return;
    const label = textOf(child.props.children);
    options.push({
      value: child.props.value === undefined ? label : String(child.props.value),
      label,
      disabled: child.props.disabled === true,
      ...(child.props.lang === undefined ? {} : { lang: child.props.lang }),
    });
  });
  return options;
}

// False on the server and during hydration, so the first client render matches the HTML.
const subscribeToNothing = () => () => undefined;
function useIsEnhanced(): boolean {
  return useSyncExternalStore(subscribeToNothing, () => true, () => false);
}

// Where the popover sits, in viewport pixels: it is in the top layer, so no ancestor clips it.
type Anchor = { left: number; width: number } & ({ top: number } | { bottom: number });

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
  const isEnhanced = useIsEnhanced();
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

  const currentValue = isControlled ? String(value) : uncontrolledValue;
  const selectedIndex = options.findIndex((option) => option.value === currentValue);
  const isListShown = isOpen && !disabled;

  useImperativeHandle(ref, () => ({
    focus: () => (triggerRef.current ?? nativeRef.current)?.focus(),
  }), []);

  // A form reset (React 19 resets the form after an action) puts the native select back on its
  // default; the combobox follows once the browser has done it.
  useEffect(() => {
    const native = nativeRef.current;
    if (!isEnhanced || isControlled || native === null) return;
    const form = native.form;
    if (form === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const syncAfterReset = () => {
      timer = setTimeout(() => setUncontrolledValue(native.value), 0);
    };
    form.addEventListener("reset", syncAfterReset);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("reset", syncAfterReset);
    };
  }, [isEnhanced, isControlled]);

  // A pointer press outside closes the list; the focus is not moved.
  useEffect(() => {
    if (!isListShown) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && wrapperRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [isListShown]);

  // The popover does not follow its trigger: a scroll outside the list closes it, as a native select does.
  useEffect(() => {
    if (!isListShown) return;
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    window.addEventListener("scroll", closeOnScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", closeOnScroll, { capture: true });
  }, [isListShown]);

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
      setAnchor({
        left: rect.left,
        width: rect.width,
        ...(isAbove
          ? { bottom: window.innerHeight - rect.top + POPOVER_GAP }
          : { top: rect.bottom + POPOVER_GAP }),
      });
    }
    activate(index, isKeyboard);
    setIsOpen(true);
  }

  // A search never outlives the list it was typed in.
  function closeList() {
    typeaheadRef.current = "";
    setIsOpen(false);
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
          ? { hidden: true, tabIndex: -1, "aria-hidden": true }
          : {
              id,
              required,
              className: `${CONTROL_CLASS} ${widthClass}`,
              "aria-describedby": ariaDescribedby,
              "aria-invalid": ariaInvalid,
              "aria-label": ariaLabel,
              "aria-labelledby": ariaLabelledby,
            })}
        {...(isControlled ? { value } : { defaultValue })}
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
              if (isListShown) setIsOpen(false);
              else openAt(selectedIndex >= 0 ? selectedIndex : firstEnabled(options), false);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => setIsOpen(false)}
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
                  aria-labelledby={ariaLabelledby ?? triggerId}
                  // Keeps the focus on the combobox while the pointer picks an option.
                  onMouseDown={(event) => event.preventDefault()}
                  className="max-h-74 overflow-y-auto"
                >
                  {options.map((option, index) => (
                    <li
                      key={option.value}
                      id={`${listId}-${index}`}
                      role="option"
                      lang={option.lang}
                      aria-selected={index === selectedIndex}
                      aria-disabled={option.disabled === true ? true : undefined}
                      onMouseMove={() => {
                        if (option.disabled === true) return;
                        activate(index, false);
                      }}
                      onClick={() => {
                        if (option.disabled === true) return;
                        choose(index);
                      }}
                      className={`flex min-h-11 items-center justify-between gap-3 rounded-control px-3 py-2 ${
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
