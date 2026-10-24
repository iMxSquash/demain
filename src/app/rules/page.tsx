import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";

import { listAccounts } from "../../ledger/accounts";
import { listCategories } from "../../ledger/categories";
import { listRules } from "../../ledger/categorization-rules";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { ConfirmActionButton } from "../confirm-action-button";
import { deleteRuleAction, createRuleAction, moveRuleAction } from "./actions";
import { RuleForm } from "./rule-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rules");
  return { title: t("metaTitle") };
}

export default async function RulesPage() {
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const [t, common] = await Promise.all([
    getTranslations("rules"),
    getTranslations("common"),
  ]);
  const { rules, accounts, categories } = withDatabase((db) => ({
    rules: listRules(db),
    // Archived ones are kept to name the rules that still point to them.
    accounts: listAccounts(db, { includeArchived: true }),
    categories: listCategories(db, { includeArchived: true }),
  }));
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryName = new Map(
    categories.map((category) => [
      category.id,
      category.archived
        ? `${category.name} ${t("archivedSuffix")}`
        : category.name,
    ]),
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p>{t("intro")}</p>

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-xl font-semibold">
          {t("listHeading")}
        </h2>
        {rules.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-500">
                <th scope="col" className="py-2 pr-4">{t("columns.order")}</th>
                <th scope="col" className="py-2 pr-4">{t("columns.condition")}</th>
                <th scope="col" className="py-2 pr-4">{t("columns.account")}</th>
                <th scope="col" className="py-2 pr-4">{t("columns.category")}</th>
                <th scope="col" className="py-2">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, index) => {
                const subject = t("condition", {
                  operator: t(`operators.${rule.operator}`),
                  value: rule.value,
                });
                return (
                  <tr key={rule.id} className="border-b border-neutral-300">
                    <td className="py-2 pr-4 tabular-nums">{index + 1}</td>
                    <th scope="row" className="py-2 pr-4 font-medium">
                      {subject}
                    </th>
                    <td className="py-2 pr-4">
                      {rule.accountId === null
                        ? t("allAccounts")
                        : (accountName.get(rule.accountId) ?? "")}
                    </td>
                    <td className="py-2 pr-4">
                      {categoryName.get(rule.categoryId) ?? ""}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <form action={moveRuleAction.bind(null, rule.id, "up")}>
                          <button
                            type="submit"
                            disabled={index === 0}
                            className="min-h-11 px-2 underline disabled:opacity-60"
                          >
                            {t("moveUp")}<span className="sr-only"> {subject}</span>
                          </button>
                        </form>
                        <form action={moveRuleAction.bind(null, rule.id, "down")}>
                          <button
                            type="submit"
                            disabled={index === rules.length - 1}
                            className="min-h-11 px-2 underline disabled:opacity-60"
                          >
                            {t("moveDown")}<span className="sr-only"> {subject}</span>
                          </button>
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
          </table>
        )}
      </section>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-xl font-semibold">
          {t("addHeading")}
        </h2>
        <RuleForm
          action={createRuleAction}
          accounts={accounts.filter((account) => !account.archived)}
          categories={categories.filter((category) => !category.archived)}
        />
      </section>
    </main>
  );
}
