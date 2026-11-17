import { listAccounts, listOverflowAccounts } from "../../ledger/accounts";
import { readAssertionLinkSnapshot } from "../../ledger/balance-assertions";
import { listCategories } from "../../ledger/categories";
import { withDatabase } from "../../storage/with-database";
import { tagDataRead } from "../data-cache";
import { toImportView } from "./import-form-data";

/** What the import and its review both start from: the accounts, the categories and the balance snapshots. */
export async function readImportContext() {
  "use cache";
  tagDataRead();
  return withDatabase((db) => ({
    view: toImportView(listAccounts(db), listCategories(db), listOverflowAccounts(db)),
    assertionSnapshot: readAssertionLinkSnapshot(db),
  }));
}
