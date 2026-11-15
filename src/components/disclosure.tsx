import { CaretDown } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

import { Icon } from "./icon";

interface DisclosureProps {
  summary: ReactNode;
  /** Opens it from the server, for example to show a field the last submit rejected. */
  open?: boolean;
  children?: ReactNode;
}

/**
 * A native `details` between two divider hairlines (DESIGN section 8, "Disclosure"). It opens and
 * closes without JavaScript. The chevron and the content take their motion from the stylesheet,
 * which is instant under reduced motion.
 */
export function Disclosure({ summary, open, children }: DisclosureProps) {
  return (
    <details open={open} className="group border-y border-divider">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
        {summary}
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">
          <Icon icon={CaretDown} />
        </span>
      </summary>
      <div className="motion-enter pb-3">{children}</div>
    </details>
  );
}
