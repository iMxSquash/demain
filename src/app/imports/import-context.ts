import { listAccounts, listOverflowAccounts } from "../../ledger/accounts";
import { readAssertionLinkSnapshot } from "../../ledger/balance-assertions";
import { listCategories } from "../../ledger/categories";
import { listEnteredPayments } from "../../ledger/planned-matching";
import { withDatabase } from "../../storage/with-database";
import { tagDataRead } from "../data-cache";
import { toImportView } from "./import-form-data";

/**
 * What the import and its review both start from: the accounts, the categories, the balance
 * snapshots and the entries marked as paid that a bank row may replace.
 */
export async function readImportContext() {
  "use cache";
  tagDataRead();
  return withDatabase((db) => ({
    view: toImportView(listAccounts(db), listCategories(db), listOverflowAccounts(db)),
    assertionSnapshot: readAssertionLinkSnapshot(db),
    enteredPayments: listEnteredPayments(db),
  }));
}
