import type { ReactNode } from "react";

// The loading skeleton of DESIGN section 8 ("Loading"): shapes only, in the place and at the size
// of the content to come, so nothing moves when it arrives. No hooks and no client code.
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
  /** The message in words, for example "Loading transactions". It is the only text of the region. */
  label: string;
  /** `main` for a page; the page it stands for renders its own `main`. */
  as?: "main" | "section" | "div";
  /** Layout only: copy the classes of the element the content will replace. */
  className?: string;
  children?: ReactNode;
}

/**
 * The loading region: `aria-busy` and one visually hidden polite status message. The blocks
 * inside are `aria-hidden`, and nothing here moves the focus. It sits on the page ground, so its
 * blocks are `surface`; the card of a table sets its own tone.
 */
export function SkeletonRegion({ label, as: Tag = "div", className, children }: SkeletonRegionProps) {
  return (
    <Tag aria-busy="true" className={`skeleton-ground ${className ?? ""}`.trim()}>
      <p role="status" className="sr-only">
        {label}
      </p>
      {children}
    </Tag>
  );
}

interface SkeletonLineProps {
  /** The text size it stands for: the line takes the exact height of a line of that size. */
  size?: keyof typeof LINE_SIZE;
  width?: keyof typeof LINE_WIDTH;
  /** Layout only (for example `self-start`). */
  className?: string;
}

/** A line of text, with the radius of a control. */
export function SkeletonLine({ size = "body", width = "full", className = "" }: SkeletonLineProps) {
  const { text, bar } = LINE_SIZE[size];

  return (
    <span aria-hidden="true" className={`flex h-lh items-center ${text} ${className}`}>
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

/** The back link and the title of a page, which most pages open with. */
export function SkeletonPageHead({ backLink = true }: { backLink?: boolean }) {
  return (
    <>
      {backLink ? <SkeletonLine className="w-32 self-start" /> : null}
      <SkeletonLine size="heading" width="1/3" />
    </>
  );
}

/** A section of a page: its title, then its content. */
export function SkeletonSection({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SkeletonLine size="title" width="1/4" />
      {children}
    </section>
  );
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
 * A data table in its card (DESIGN section 8, "Data display"): the caption, the header and
 * 48 px rows, as `DataTable` draws them. The column count is what the page already knows.
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
      <SkeletonRows columns={columns} rows={rows} rowClassName="h-12 border-t border-divider px-3" />
    </div>
  );
}

/** Fields of a form: a label line and a 48 px control each. */
export function SkeletonFields({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-4">
      {placeholders(count).map((field) => (
        <div key={field} className="flex flex-col gap-1">
          <SkeletonLine size="label" width="1/4" />
          <SkeletonBlock className="h-12 rounded-control" />
        </div>
      ))}
    </div>
  );
}
