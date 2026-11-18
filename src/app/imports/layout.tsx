import type { ReactNode } from "react";

import { ReviewSessionProvider } from "./review-session";

export default function ImportsLayout({ children }: { children: ReactNode }) {
  return <ReviewSessionProvider>{children}</ReviewSessionProvider>;
}
