import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";

import { Button } from "../../components/button";
import { DataTable, EmptyState } from "../../components/data-display";
import { PageSection } from "../../components/page-section";
import {
  SkeletonDataTable,
  SkeletonFields,
  SkeletonRegion,
} from "../../components/skeleton";
import { listAccounts } from "../../ledger/accounts";
import { listCategories } from "../../ledger/categories";
import { listRules } from "../../ledger/categorization-rules";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { tagDataRead } from "../data-cache";
import { ConfirmActionButton } from "../confirm-action-button";
import { deleteRuleAction, createRuleAction, moveRuleAction } from "./actions";
import { RuleForm } from "./rule-form";
import { VocabularySection } from "./vocabulary-section";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rules");
  return { title: t("metaTitle") };
}

// One read for the whole request: every section below asks for it and gets the same answer.
const readRules = cache(async () => {
  // Checked here, inside the `Suspense` of each section, so the page awaits nothing and its static
  // parts are part of the prefetched App Shell (ADR-023).
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  return readRulesFromDatabase();
});

async function readRulesFromDatabase() {
  "use cache";
  tagDataRead();
  return withDatabase((db) => ({
    rules: listRules(db),
    // Archived ones are kept to name the rules that still point to them.
    accounts: listAccounts(db, { includeArchived: true }),
    categories: listCategories(db, { includeArchived: true }),
  }));
}

const PAGE_GAP = "gap-10";

// The sections show their heading at once and hold only the data in a `Suspense`, so a slow read
// never delays the rest of the page.
export default async function RulesPage() {
  const [t, common] = await Promise.all([
    getTranslations("rules"),
    getTranslations("common"),
  ]);

  return (
    <main className={`mx-auto flex max-w-4xl flex-col ${PAGE_GAP} p-8`}>
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-heading font-medium">{t("title")}</h1>
      <p>{t("intro")}</p>

      <PageSection id="list-heading" heading={t("listHeading")}>
        <Suspense fallback={<RuleListLoading />}>
          <RuleList />
        </Suspense>
      </PageSection>

      <PageSection id="new-heading" heading={t("addHeading")}>
        <Suspense fallback={<RuleFormLoading />}>
          <NewRule />
        </Suspense>
      </PageSection>

      <VocabularySection />
    </main>
  );
}

// The same `thead` for the loaded table and for its skeleton.
function RulesHead() {
  const t = useTranslations("rules");

  return (
    <thead>
      <tr>
        <th scope="col">{t("columns.order")}</th>
        <th scope="col">{t("columns.condition")}</th>
        <th scope="col">{t("columns.account")}</th>
        <th scope="col">{t("columns.category")}</th>
        <th scope="col">{t("columns.actions")}</th>
      </tr>
    </thead>
  );
}

function RuleListLoading() {
  const t = useTranslations("rules");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")}>
      <SkeletonDataTable
        caption={t("caption")}
        head={<RulesHead />}
        columns={["start", "start", "start", "start", "start"]}
        rows={4}
      />
    </SkeletonRegion>
  );
}

async function RuleList() {
  const [t, { rules, accounts, categories }] = await Promise.all([
    getTranslations("rules"),
    readRules(),
  ]);
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryName = new Map(
    categories.map((category) => [
      category.id,
      category.archived
        ? `${category.name} ${t("archivedSuffix")}`
        : category.name,
    ]),
  );

  if (rules.length === 0) {
    return (
      <EmptyState action={{ href: "#new-heading", label: t("emptyAction") }}>
        {t("empty")}
      </EmptyState>
    );
  }

  return (
    <DataTable caption={t("caption")}>
      <RulesHead />
      <tbody>
      {rules.map((rule, index) => {
        const subject = t("condition", {
          operator: t(`operators.${rule.operator}`),
          value: rule.value,
        });
        return (
          <tr key={rule.id}>
            <td className="tabular-nums">{index + 1}</td>
            <th scope="row">
              {subject}
            </th>
            <td>
              {rule.accountId === null
                ? t("allAccounts")
                : (accountName.get(rule.accountId) ?? "")}
            </td>
            <td>
              {categoryName.get(rule.categoryId) ?? ""}
            </td>
            <td>
              <div className="flex gap-2">
                <form action={moveRuleAction.bind(null, rule.id, "up")}>
                  <Button type="submit" variant="link" disabled={index === 0}>
                    {t("moveUp")}<span className="sr-only"> {subject}</span>
                  </Button>
                </form>
                <form action={moveRuleAction.bind(null, rule.id, "down")}>
                  <Button type="submit" variant="link" disabled={index === rules.length - 1}>
                    {t("moveDown")}<span className="sr-only"> {subject}</span>
                  </Button>
                </form>
                <ConfirmActionButton
                  action={deleteRuleAction.bind(null, rule.id)}
                  label={t("delete")}
                  subject={subject}
                  title={t("deleteTitle")}
                  message={t("deleteMessage")}
                  confirmLabel={t("deleteConfirm")}
                />
              </div>
            </td>
          </tr>
        );
      })}
      </tbody>
    </DataTable>
  );
}

function RuleFormLoading() {
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("form")}>
      <SkeletonFields count={4} />
    </SkeletonRegion>
  );
}

async function NewRule() {
  const { accounts, categories } = await readRules();

  return (
    <RuleForm
      action={createRuleAction}
      accounts={accounts.filter((account) => !account.archived)}
      categories={categories.filter((category) => !category.archived)}
    />
  );
}
