import { connection } from "next/server";
import { cache } from "react";

import { requireSession } from "./session";

/**
 * For a page that reads the database: checks the session and makes the page render per request,
 * never at build time (ADR-023). Once per request, whatever the number of sections that await it.
 */
export const requireRequest = cache(async () => {
  await requireSession();
  await connection();
});
