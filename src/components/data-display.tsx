import Link from "next/link";
import type { ReactNode } from "react";

// The table, pill, count badge and empty state of DESIGN section 8 ("Data display" and
// "Feedback"). No hooks and no client code: server and client components can both use it.

// The cells are styled from the table so that a screen writes plain `th` and `td`. Alignment
// stays on the cell (`text-right` for figures): a descendant selector here would win over it.
const TABLE_CLASS = [
  "w-full border-collapse text-left",
  "[&_caption]:pb-3 [&_caption]:text-left [&_caption]:font-medium",
  "[&_thead_th]:px-3 [&_thead_th]:pb-2 [&_thead_th]:text-label [&_thead_th]:font-medium [&_thead_th]:uppercase [&_thead_th]:text-text-muted",
  "[&_tbody_tr]:border-t [&_tbody_tr]:border-divider [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-surface-sunken",
  "[&_tbody_td]:h-12 [&_tbody_td]:px-3 [&_tbody_td]:whitespace-nowrap",
  "[&_tbody_th]:h-12 [&_tbody_th]:px-3 [&_tbody_th]:whitespace-nowrap [&_tbody_th]:font-medium",
].join(" ");

interface DataTableProps {
  /** Visible, medium weight. It also names the scroll region. */
  caption: string;
  children: ReactNode;
}

/**
 * A table in its card. The card scrolls sideways when the table is wider than a phone, so
 * the page never does. The region is focusable and named: keyboard users must reach it.
 */
export function DataTable({ caption, children }: DataTableProps) {
  return (
    <div className="rounded-card bg-surface p-4 @3xl:p-6">
      {/* `relative`: the sr-only text of the cells is absolutely positioned and must be clipped here. */}
      <div
        role="region"
        aria-label={caption}
        tabIndex={0}
        className="relative overflow-x-auto"
      >
        <table className={TABLE_CLASS}>
          <caption>{caption}</caption>
          {children}
        </table>
      </div>
    </div>
  );
}

const PILL_TONE_CLASS = {
  neutral: "bg-control text-text",
  warning: "bg-warning-tint text-warning",
} as const;

/** A status written as a word. It is never a button. The 10 px side padding is the spec's. */
export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof PILL_TONE_CLASS;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-1 text-caption font-medium ${PILL_TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * The to-categorize count. Layout classes only in `className` (for example `ml-auto`).
 * `decorative` hides the digits from assistive technology, for a place that says the count in words.
 */
export function CountBadge({
  count,
  className = "",
  decorative = false,
}: {
  count: number;
  className?: string;
  decorative?: boolean;
}) {
  return (
    <span
      aria-hidden={decorative ? true : undefined}
      className={`inline-grid h-7 min-w-7 place-items-center rounded-pill bg-control px-2.5 text-label leading-none text-text ${className}`}
    >
      {count}
    </span>
  );
}

interface EmptyStateProps {
  children: ReactNode;
  /** The one secondary action. Absent when there is nothing to do about it. */
  action?: { href: string; label: string };
}

const ACTION_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-control px-4 font-medium text-text transition-colors hover:bg-control-hover";

export function EmptyState({ children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-control bg-surface-sunken px-4 py-8 text-center text-text-muted">
      <p className="max-w-[36ch]">{children}</p>
      {action === undefined ? null : (
        <Link href={action.href} className={ACTION_CLASS}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
