"use client";

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { AssertionLinkSnapshot } from "../../domain/import-assertions";
import type { PendingOverflow } from "../../domain/import-overflow";
import type { EnteredPaymentEntry } from "../../ledger/planned-matching";
import type { AccountRef, OverflowAccount } from "../../domain/overflow";
import type { StagedFile } from "./import-form-data";
import type { ColumnChoicesBySource, MappingsBySource } from "./stage-sources";

export interface Review {
  accountId: number;
  /** The files as chosen, kept to read them again when the account changes. */
  sources: File[];
  files: StagedFile[];
  /** The balances when the files were read: the page refreshes after each import, the plan must not. */
  overflowAccounts: OverflowAccount<AccountRef>[];
  /** The same balances without the choices made so far: what a file needs is read from them. */
  storedOverflowAccounts: OverflowAccount<AccountRef>[];
  /** The balance assertions and the movements when the files were read: the page refreshes after each import, the comparison must not. */
  assertionSnapshot: AssertionLinkSnapshot;
  /** The entries marked as paid when the files were read: what a bank row of a file may replace. */
  enteredPayments: EnteredPaymentEntry[];
  /** The overflow accounts chosen so far: written with the first file imported, never before. */
  overflowChoices: PendingOverflow[];
  /** The columns chosen by hand, by position in `sources`: a file is read again with its own. */
  columnChoices: ColumnChoicesBySource;
  /** The mappings set by hand, by position in `sources`: a file mapped by hand is read again with its own. */
  mappings: MappingsBySource;
  /** Counts the readings of the files: what was edited belongs to one of them. */
  batch: number;
}

interface ReviewSession {
  review: Review | null;
  setReview: Dispatch<SetStateAction<Review | null>>;
}

const ReviewSessionContext = createContext<ReviewSession | null>(null);

/**
 * Holds the review in the browser while the user moves between the import and
 * its review page (ADR-016). It sits in the layout of `/imports`, which stays
 * mounted across that navigation: the chosen files cannot be sent through a URL
 * or kept on the server, and nothing is recorded until a file is imported.
 */
export function ReviewSessionProvider({
  children,
  initialReview = null,
}: {
  children: ReactNode;
  initialReview?: Review | null;
}) {
  const [review, setReview] = useState<Review | null>(initialReview);

  return (
    <ReviewSessionContext value={{ review, setReview }}>{children}</ReviewSessionContext>
  );
}

export function useReviewSession(): ReviewSession {
  const session = useContext(ReviewSessionContext);
  if (session === null) throw new Error("useReviewSession needs a ReviewSessionProvider");
  return session;
}
