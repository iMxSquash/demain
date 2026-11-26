import type { ReactNode } from "react";

import { DataTable } from "./data-display";
import { LoadingStatus } from "./loading-status";

// The loading skeleton of DESIGN section 8 ("Loading"): shapes only, for the data that is really
// loading, in its place and at its size, so nothing moves when it arrives. What does not depend on
// the data (a title, a link, a column heading) is drawn as it is, never as a block. Everything here is
// server code but the status message of a region.
// Sizes and widths are written as whole class names so that Tailwind finds them, and never as a
// style attribute, which the content security policy blocks.

const LINE_SIZE = {
  label: { text: "text-label", bar: "h-2.5" },
  caption: { text: "text-caption", bar: "h-3" },
  body: { text: "text-body", bar: "h-3.5" },
  title: { text: "text-title", bar: "h-5" },
  heading: { text: "text-heading", bar: "h-7" },
} as const;

const LINE_WIDTH = {
  full: "w-full",
  "3/4": "w-3/4",
  "1/2": "w-1/2",
  "1/3": "w-1/3",
  "1/4": "w-1/4",
} as const;

interface SkeletonRegionProps {
  /** The message in words, for example "Loading the table". It is the only text of the region. */
  label: string;
  /** Layout only: copy the classes of the container the content will fill (a flex column and its gap). */
  className?: string;
  children?: ReactNode;
}

/**
 * The fallback of a `Suspense` boundary: `aria-busy` and one visually hidden polite status message.
 * The blocks inside are `aria-hidden`, and nothing here moves the focus. It sits on the page ground,
 * so its blocks are `surface`; the card of a table sets its own tone.
 */
export function SkeletonRegion({ label, className, children }: SkeletonRegionProps) {
  return (
    <div aria-busy="true" className={`skeleton-ground ${className ?? ""}`.trim()}>
      <LoadingStatus label={label} />
      {children}
    </div>
  );
}

type Align = "start" | "end";

interface SkeletonLineProps {
  /** The text size it stands for: the line takes the exact height of a line of that size. */
  size?: keyof typeof LINE_SIZE;
  width?: keyof typeof LINE_WIDTH;
  /** `end` for a figure, which is right-aligned. */
  align?: Align;
  /** Layout only (for example `self-start`). */
  className?: string;
}

/** A line of text, with the radius of a control. */
export function SkeletonLine({
  size = "body",
  width = "full",
  align = "start",
  className = "",
}: SkeletonLineProps) {
  const { text, bar } = LINE_SIZE[size];

  return (
    <span
      aria-hidden="true"
      className={`flex h-lh items-center ${align === "end" ? "justify-end" : ""} ${text} ${className}`}
    >
      <span className={`skeleton rounded-control ${bar} ${LINE_WIDTH[width]}`} />
    </span>
  );
}

/**
 * A block of any shape: pass its size and the radius of what it stands for in `className`
 * (`rounded-control` for a field, `rounded-pill` for a button, `rounded-card` for a tile).
 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton ${className}`} />;
}

interface SkeletonRowsProps {
  columns: number;
  rows: number;
  /** The classes of a row, which copy those of the table it stands for. */
  rowClassName: string;
}

const placeholders = (count: number) => Array.from({ length: count }, (_, index) => index);

/** Rows of lines, one per column. */
export function SkeletonRows({ columns, rows, rowClassName }: SkeletonRowsProps) {
  return (
    <>
      {placeholders(rows).map((row) => (
        <div key={row} className={`flex items-center gap-3 ${rowClassName}`}>
          {placeholders(columns).map((column) => (
            <div key={column} className="min-w-0 flex-1">
              <SkeletonLine width="3/4" />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * A data table that is all data, caption and column headings included (a caption that names the
 * account, columns that are accounts): drawn as blocks, in a card, with 48 px rows.
 */
export function SkeletonTable({ columns, rows }: { columns: number; rows: number }) {
  return (
    <div className="skeleton-card rounded-card bg-surface p-4 @3xl:p-6">
      <div className="pb-3">
        <SkeletonLine width="1/3" />
      </div>
      <div className="flex gap-3 px-3 pb-2">
        {placeholders(columns).map((column) => (
          <div key={column} className="min-w-0 flex-1">
            <SkeletonLine size="label" width="1/2" />
          </div>
        ))}
      </div>
      <SkeletonRows
        columns={columns}
        rows={rows}
        rowClassName="h-12 border-t border-divider px-3"
      />
    </div>
  );
}

/**
 * The fields of a form and its submit button: a label line (the size of a field label), a 48 px
 * control each, then a button of the minimum target size.
 */
export function SkeletonFields({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-4">
      {placeholders(count).map((field) => (
        <div key={field} className="flex flex-col gap-1">
          <SkeletonLine size="caption" width="1/4" />
          <SkeletonBlock className="h-12 rounded-control" />
        </div>
      ))}
      <SkeletonBlock className="h-11 w-32 rounded-pill self-start" />
    </div>
  );
}

/** The rows of a table that is loading, one block per cell, hidden from assistive technology. */
export function SkeletonTableBody({
  columns,
  rows,
  className,
  rowClassName = "",
  cellClassName = "",
}: {
  /** One entry per column: `end` for a figure. */
  columns: readonly Align[];
  rows: number;
  /** `skeleton-card` for a table in its card. */
  className?: string;
  /** Only for a table that does not style its own cells, such as the chart table. */
  rowClassName?: string;
  cellClassName?: string;
}) {
  return (
    <tbody aria-hidden="true" className={className}>
      {placeholders(rows).map((row) => (
        <tr key={row} className={rowClassName}>
          {columns.map((align, column) => (
            <td key={column} className={cellClassName}>
              <SkeletonLine width="3/4" align={align} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

interface SkeletonDataTableProps {
  /** Static text, never data. */
  caption: string;
  regionLabel?: string;
  /**
   * The real `thead` of the table: the page renders the same element for the loaded table, so the
   * column headings cannot drift apart.
   */
  head: ReactNode;
  /** One entry per column, in the order of the head: `end` for a figure. */
  columns: readonly Align[];
  rows: number;
}

/** A `DataTable` with its real caption and column headings and rows of blocks. */
export function SkeletonDataTable({
  caption,
  regionLabel,
  head,
  columns,
  rows,
}: SkeletonDataTableProps) {
  return (
    <DataTable caption={caption} regionLabel={regionLabel}>
      {head}
      <SkeletonTableBody className="skeleton-card" columns={columns} rows={rows} />
    </DataTable>
  );
}
