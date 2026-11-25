import {
  createElement,
  type ComponentProps,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { StagedFile } from "../../../src/app/imports/import-form-data";
import { ImportReview } from "../../../src/app/imports/import-review";
import type { EnteredPaymentEntry } from "../../../src/ledger/planned-matching";
import { ReviewHeading } from "../../../src/app/imports/review/review-heading";
import {
  ReviewSessionProvider,
  type Review,
} from "../../../src/app/imports/review-session";
import { loadMessages } from "../../../src/i18n/message-files";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));

// Synthetic data only: one account, one file, two made-up movements.
const FILE: StagedFile = {
  fileName: "march-synthetic.csv",
  status: "ready",
  message: "",
  format: "csv",
  mapping: null,
  currency: "EUR",
  firstDate: "2026-03-02",
  needsMapping: false,
  columns: null,
  rows: [
    {
      line: 2,
      rawDate: null,
      draft: { date: "2026-03-02", label: "SYNTHETIC SHOP", amount: "-12,50", externalId: null },
      details: { type: "expense", categoryId: null, paymentMode: "card", description: null, savingsAccountId: null },
      guess: null,
      isDuplicate: false,
    },
    {
      line: 3,
      rawDate: null,
      draft: { date: "2026-03-03", label: "SYNTHETIC SALARY", amount: "1000,00", externalId: null },
      details: { type: "income", categoryId: null, paymentMode: "transfer", description: null, savingsAccountId: null },
      guess: null,
      isDuplicate: false,
    },
  ],
};

const PAID_ENTRY: EnteredPaymentEntry = {
  id: 9,
  accountId: 1,
  categoryId: null,
  date: "2026-03-02",
  label: "Synthetic shop",
  kind: "expense",
  amount: -1_250,
  plannedItemId: 4,
  plannedItemName: "Synthetic shop",
  nominalDate: "2026-03-01",
  windowDays: 5,
  toleranceBasisPoints: 500,
};

// The mapping of a headerless file, set by hand in the mapping form.
const HAND_MAPPING = {
  delimiter: ";",
  hasHeader: false,
  dateColumn: 0,
  dateFormat: "dmy",
  labelColumn: 1,
  amount: { kind: "single", column: 2 },
} as const;

const ACCOUNTS = [
  { id: 1, name: "Synthetic current", kind: "checking" as const, archived: false, currency: "EUR", overflowAccountId: null },
];

const REVIEW: Review = {
  accountId: 1,
  sources: [],
  files: [FILE],
  overflowAccounts: [],
  storedOverflowAccounts: [],
  assertionSnapshot: { accounts: [], assertions: [], transactions: [] },
  enteredPayments: [],
  overflowChoices: [],
  columnChoices: {},
  mappings: {},
  batch: 1,
};

// The providers take their children as an argument (the lint rule), which their types do not see.
const IntlProvider = NextIntlClientProvider as ComponentType<
  Omit<ComponentProps<typeof NextIntlClientProvider>, "children"> & { children?: ReactNode }
>;
const SessionProvider = ReviewSessionProvider as ComponentType<{
  initialReview: Review | null;
  children?: ReactNode;
}>;

function renderWithIntl(child: ReactElement): string {
  return renderToStaticMarkup(
    createElement(IntlProvider, { locale: "en", messages: loadMessages("en") }, child),
  );
}

function render(initialReview: Review | null): string {
  const review = createElement(ImportReview, {
    accounts: ACCOUNTS,
    categories: [],
    overflowAccounts: [],
    assertionSnapshot: REVIEW.assertionSnapshot,
    enteredPayments: initialReview?.enteredPayments ?? [],
  });
  return renderWithIntl(createElement(SessionProvider, { initialReview }, review));
}

describe("ImportReview", () => {
  it("renders the staged file with its rows and the actions of the review", () => {
    const markup = render(REVIEW);

    expect(markup).toContain("march-synthetic.csv");
    expect(markup).toContain("SYNTHETIC SHOP");
    expect(markup).toContain("SYNTHETIC SALARY");
    expect(markup).toContain("Import this file");
    expect(markup).toContain("Cancel this file");
    expect(markup).toContain(">Cancel</button>");
  });

  it("flags a row that matches an entry marked as paid, with Replace chosen in advance", () => {
    const markup = render({
      ...REVIEW,
      enteredPayments: [PAID_ENTRY],
    });

    expect(markup).toContain("Entries already marked as paid");
    expect(markup).toContain("You marked Synthetic shop of");
    expect(markup).toMatch(/checked=""[^>]*\/><span class="py-2.5">Replace my entry with this bank row/);
    expect(markup).toContain("Keep both");
    expect(markup).toContain("a replaced entry does not come back");
  });

  it("flags such a row in a file whose columns were mapped by hand", () => {
    const markup = render({
      ...REVIEW,
      files: [{ ...FILE, mapping: HAND_MAPPING, columns: null }],
      mappings: { 0: HAND_MAPPING },
      enteredPayments: [PAID_ENTRY],
    });

    expect(markup).toContain("You marked Synthetic shop of");
    expect(markup).toMatch(/checked=""[^>]*\/><span class="py-2.5">Replace my entry with this bank row/);
  });

  it("renders no dialog", () => {
    expect(render(REVIEW)).not.toContain("<dialog");
  });

  it("says there is nothing to review when no file was chosen, with a way back", () => {
    const markup = render(null);

    expect(markup).not.toContain("march-synthetic.csv");
    expect(markup).toContain('href="/imports"');
  });
});

describe("ReviewHeading", () => {
  it("is the page heading and can take the focus", () => {
    const markup = renderWithIntl(createElement(ReviewHeading));

    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("Review the files before importing");
  });
});
