"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo } from "react";

import type { AssertionLinks } from "../../domain/import-assertions";
import { describeAssertionLinks } from "./assertion-link-text";

/**
 * Tells whether the file leaves the balances the user wrote down: for each
 * balance assertion within the dates of the file, the real balance, the balance
 * once the file is recorded and the gap, written in words. Zero tolerance.
 */
export function AssertionLinkPanel({
  links,
  fileName,
  currency,
  accountNames,
}: {
  links: AssertionLinks;
  fileName: string;
  currency: string;
  accountNames: ReadonlyMap<number, string>;
}) {
  const t = useTranslations("imports.staged.assertionLinks");
  const staged = useTranslations("imports.staged");
  const locale = useLocale();
  const headingId = useId();

  const { summary, rows } = useMemo(
    () =>
      describeAssertionLinks(links, {
        t,
        currency,
        locale,
        nameOf: (id) => accountNames.get(id) ?? staged("unknownAccount"),
      }),
    [links, currency, locale, accountNames, t, staged],
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h4 id={headingId} className="font-medium">
        {t("heading")}
      </h4>
      <p aria-live="polite">{summary ?? t("empty")}</p>
      {rows.length === 0 ? null : (
        // A wide table scrolls: the region takes the focus so that the keyboard can scroll it too.
        <div
          role="region"
          aria-label={t("regionLabel", { name: fileName })}
          tabIndex={0}
          className="max-h-96 overflow-auto"
        >
          <table className="w-full border-collapse text-left">
            <caption className="py-1 text-left">{t("caption", { name: fileName })}</caption>
            <thead>
              <tr className="border-b border-border-control">
                <th scope="col" className="py-2 pr-2">
                  {t("columnAccount")}
                </th>
                <th scope="col" className="pr-2">
                  {t("columnDate")}
                </th>
                <th scope="col" className="pr-2 text-right">
                  {t("columnReal")}
                </th>
                <th scope="col" className="pr-2 text-right">
                  {t("columnComputed")}
                </th>
                <th scope="col">{t("columnGap")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-divider">
                  <th scope="row" className="py-2 pr-2 font-regular">
                    {row.accountName}
                  </th>
                  <td className="pr-2">{row.date}</td>
                  <td className="pr-2 text-right">{row.realBalance}</td>
                  <td className="pr-2 text-right">{row.computedBalance}</td>
                  <td>{row.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
