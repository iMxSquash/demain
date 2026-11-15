"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Width in pixels of an element, followed as it resizes. Charts draw at this
 * width instead of scaling a fixed viewBox, so their text keeps its size and a
 * phone never gets a horizontal scroll. `fallback` is used for the server
 * render and the first client render, so both produce the same markup.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    // One source of truth for the first read and every resize.
    const read = () => setWidth(element.clientWidth);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
