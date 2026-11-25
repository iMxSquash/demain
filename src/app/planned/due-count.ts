import { listDueOccurrences } from "../../ledger/planned-matching";
import { withDatabase } from "../../storage/with-database";
import { tagDataRead } from "../data-cache";

/**
 * The number of occurrences in the "Due" section of To pay: the sidebar badge, the calendar header
 * link and the More row count the same list as the page. `today` is an argument, read outside
 * the cache, so that a cached count never goes stale at midnight (ADR-023).
 */
export async function readDueCount(today: string): Promise<number> {
  "use cache";
  tagDataRead();
  return withDatabase((db) => listDueOccurrences(db, today).due.length);
}
