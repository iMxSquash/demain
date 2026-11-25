"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  withOverflowChoice,
  type OverflowTarget,
} from "../../domain/import-overflow";
import type { AssertionLinkSnapshot } from "../../domain/import-assertions";
import type { EnteredPaymentEntry } from "../../ledger/planned-matching";
import { failedStagedFile, type ColumnChoiceFields, type ImportView } from "./import-form-data";
import { useReviewSession } from "./review-session";
import { StagedImportReview } from "./staged-import-review";
import { useStaging } from "./use-staging";

const IMPORT_PATH = "/imports";

/** The review of the files chosen on the import, which `ReviewSessionProvider` keeps. */
export function ImportReview({
  accounts,
  categories,
  overflowAccounts,
  assertionSnapshot,
  enteredPayments,
}: ImportView & { assertionSnapshot: AssertionLinkSnapshot; enteredPayments: EnteredPaymentEntry[] }) {
  const t = useTranslations("imports");
  const router = useRouter();
  const { review, setReview } = useReviewSession();
  const { staging, stageOne, stageFiles } = useStaging();

  if (review === null) {
    return (
      <div className="flex flex-col gap-4">
        <p>{t("staged.nothingToReview")}</p>
        <Link href={IMPORT_PATH} className="inline-flex min-h-11 items-center self-start underline">
          {t("staged.backToImport")}
        </Link>
      </div>
    );
  }

  // The duplicates and the currency depend on the account: the files are read again for the new one.
  async function changeReviewAccount(accountId: number) {
    if (review === null) return;
    const { sources, columnChoices } = review;
    setReview({ ...review, accountId });
    const files = await stageFiles(sources, String(accountId), columnChoices);
    // Left while the files were read: it stays dropped.
    setReview((current) =>
      current === null
        ? null
        : {
            ...current,
            files,
            overflowAccounts,
            storedOverflowAccounts: overflowAccounts,
            assertionSnapshot,
            enteredPayments,
            // The balances are back to the stored ones: the choices go with them.
            overflowChoices: [],
            batch: current.batch + 1,
          },
    );
  }

  // The choice is only remembered: the plan of the review follows it, and it is
  // saved with the first file imported (an account to create is referred to by `pendingAccountRef`).
  function chooseOverflow(accountId: number, target: OverflowTarget) {
    setReview((current) => {
      if (current === null) return null;
      const choice = { accountId, target };
      return {
        ...current,
        overflowAccounts: withOverflowChoice(current.overflowAccounts, choice),
        overflowChoices: [...current.overflowChoices, choice],
      };
    });
  }

  // One file again, with the columns the user chose: the others are left as they are.
  async function restageSource(sourceIndex: number, choices: ColumnChoiceFields) {
    const source = review?.sources[sourceIndex];
    if (review === null || source === undefined) {
      return failedStagedFile("", t("staged.readFailed"));
    }
    const staged = await stageOne(source, String(review.accountId), choices);
    // Remembered only when the reading worked: a failed one leaves the earlier choices in force.
    if (staged.status !== "failed") {
      setReview((current) =>
        current === null
          ? null
          : { ...current, columnChoices: { ...current.columnChoices, [sourceIndex]: choices } },
      );
    }
    return staged;
  }

  function leave() {
    setReview(null);
    router.push(IMPORT_PATH);
  }

  return (
    <StagedImportReview
      batch={review.batch}
      files={review.files}
      accountId={review.accountId}
      accounts={accounts}
      categories={categories}
      overflowAccounts={review.overflowAccounts}
      storedOverflowAccounts={review.storedOverflowAccounts}
      assertionSnapshot={review.assertionSnapshot}
      enteredPayments={review.enteredPayments}
      overflowChoices={review.overflowChoices}
      readingText={staging === null ? null : t("staged.reading", { ...staging })}
      onAccountChange={changeReviewAccount}
      onOverflowChosen={chooseOverflow}
      onRestage={restageSource}
      onLeave={leave}
    />
  );
}
