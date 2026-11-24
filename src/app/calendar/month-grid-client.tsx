"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { reduceGridKey } from "./month-grid-keyboard";

interface MonthGridClientProps {
  /** YYYY-MM. */
  month: string;
  weekStart: number;
  /** The day the grid is entered on, YYYY-MM-DD: the one tab stop. */
  entryDate: string;
  /** The details panel of each day, drawn on the server; one is shown at a time. */
  details: Readonly<Record<string, ReactNode>>;
  /** The grid, already drawn on the server: it works as links without this component. */
  children: ReactNode;
}

const DAY_LINK_SELECTOR = "a[data-date]";
const HEADING_SELECTOR = "[data-day-heading]";
const ACTIVATION_KEYS = new Set(["Enter", " "]);

function dayLinkOf(target: EventTarget): HTMLAnchorElement | null {
  return target instanceof Element ? target.closest<HTMLAnchorElement>(DAY_LINK_SELECTOR) : null;
}

// The grid is one tab stop: the link of one day has tabindex 0, the others -1. Without JavaScript
// every link keeps its natural tab stop, so this only runs in the browser.
function setTabStop(root: HTMLElement, link: HTMLElement): void {
  for (const other of root.querySelectorAll<HTMLElement>(DAY_LINK_SELECTOR)) {
    other.tabIndex = -1;
  }
  link.tabIndex = 0;
}

/**
 * The behaviour of the month grid: roving focus, and the details of a day under the grid. The cells
 * are server markup that React never re-renders, so the selected state is written on them here.
 */
export function MonthGridClient({ month, weekStart, entryDate, details, children }: MonthGridClientProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // An object, so that opening the day that is already open still moves the focus to its heading.
  const [opened, setOpened] = useState<{ date: string } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const entryLink = root?.querySelector<HTMLElement>(`a[data-date="${entryDate}"]`);
    if (root && entryLink) setTabStop(root, entryLink);
  }, [entryDate]);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    for (const link of root.querySelectorAll<HTMLAnchorElement>(DAY_LINK_SELECTOR)) {
      const cell = link.closest<HTMLElement>('[role="gridcell"]');
      if (cell === null) continue;
      if (link.dataset.date === opened?.date) {
        cell.setAttribute("aria-selected", "true");
        cell.dataset.selected = "true";
      } else {
        cell.removeAttribute("aria-selected");
        delete cell.dataset.selected;
      }
    }
    if (opened !== null) root.querySelector<HTMLElement>(HEADING_SELECTOR)?.focus();
  }, [opened]);

  function focusDay(date: string): void {
    // Focusing the link runs `onFocus`, which moves the tab stop.
    rootRef.current?.querySelector<HTMLElement>(`a[data-date="${date}"]`)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const focused = dayLinkOf(event.target)?.dataset.date;
    if (focused === undefined) return;
    const result = reduceGridKey(
      { focused, opened: opened?.date ?? null },
      event.key,
      { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey },
      weekStart,
      month,
    );
    if (!result.handled) return;
    event.preventDefault();
    if (result.focused !== focused) focusDay(result.focused);
    if (result.opened !== null && ACTIVATION_KEYS.has(event.key)) setOpened({ date: result.opened });
  }

  function handleClick(event: MouseEvent<HTMLDivElement>): void {
    const date = dayLinkOf(event.target)?.dataset.date;
    const isPlainClick = event.button === 0 && !(event.shiftKey || event.ctrlKey || event.metaKey || event.altKey);
    if (date === undefined || !isPlainClick) return;
    event.preventDefault();
    setOpened({ date });
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      onFocus={(event) => {
        const link = dayLinkOf(event.target);
        if (link !== null && rootRef.current !== null) setTabStop(rootRef.current, link);
      }}
    >
      {children}
      {opened === null ? null : details[opened.date]}
    </div>
  );
}
