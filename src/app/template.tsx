import type { ReactNode } from "react";

// A template mounts again on every navigation, so the page content enters each time. The
// entrance is the CSS utility, which runs from the first paint and is instant under reduced
// motion (DESIGN section 6, Motion). The shell stays in the layout and never moves.
export default function Template({ children }: { children: ReactNode }) {
  return <div className="motion-enter">{children}</div>;
}
