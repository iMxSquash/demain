import type { ReactNode } from "react";

/**
 * A titled section of a page. The heading never depends on the data, so a page can show it at once
 * and let `Suspense` hold only what is loading; the loading fallback and the loaded content both
 * sit in this same section, so the layout is the same before and after.
 */
export function PageSection({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-title font-medium">
        {heading}
      </h2>
      {children}
    </section>
  );
}
