import { getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function NotFoundPage() {
  const [t, common] = await Promise.all([getTranslations("errors"), getTranslations("common")]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-8">
      <h1 className="text-heading font-medium">{t("notFoundTitle")}</h1>
      <p className="max-w-prose">{t("notFoundBody")}</p>
      <Link href="/" className="self-start underline">
        {common("backToHome")}
      </Link>
    </main>
  );
}
