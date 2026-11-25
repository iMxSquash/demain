/**
 * The heading of the day details, which takes the focus when they open. Its own module, so that
 * the line view can aim at it without loading the grid's client code.
 */
export const DAY_HEADING_SELECTOR = "[data-day-heading]";

/** Where the focus goes when the row of a changed occurrence leaves the page (DESIGN section 6). */
const FOCUS_FALLBACK_SELECTORS = [DAY_HEADING_SELECTOR, "[data-focus-fallback]"];

/**
 * A server answer can take the row of an occurrence away (moved to another day, or settled and
 * listed through its transaction): the control that had the focus is gone and the focus would land
 * on the body. It goes to the nearest heading instead. Browser only.
 */
export function focusFallbackIfLost(): void {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    for (const selector of FOCUS_FALLBACK_SELECTORS) {
      const target = document.querySelector<HTMLElement>(selector);
      if (target !== null) {
        target.focus();
        return;
      }
    }
  });
}
