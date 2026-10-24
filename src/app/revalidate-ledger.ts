import { revalidatePath } from "next/cache";

// Every page that shows figures derived from transactions.
const LEDGER_PATHS = [
  "/transactions",
  "/accounts",
  "/categories",
  "/synthesis",
];

/** Refreshes the pages whose figures change when a movement is recorded. */
export function revalidateLedger(): void {
  for (const path of LEDGER_PATHS) revalidatePath(path);
}
