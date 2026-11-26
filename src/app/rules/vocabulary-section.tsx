import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";

import { Button } from "../../components/button";
import { DataTable, Pill } from "../../components/data-display";
import { SkeletonDataTable, SkeletonRegion } from "../../components/skeleton";
import { MOVEMENT_TYPES } from "../../domain/import-columns";
import { getVocabularyOverview } from "../../ledger/type-vocabulary";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { tagDataRead } from "../data-cache";
import {
  addVocabularyWordAction,
  changeVocabularyTypeAction,
  removeVocabularyWordAction,
  restoreVocabularyWordAction,
} from "./vocabulary-actions";
import { VocabularyForm } from "./vocabulary-form";
import { Select } from "../../components/select";

/**
 * The words of a category that give the type of an imported row, with where
 * each one comes from written out: the origin is never carried by color alone.
 * The explanation and the form to add a word do not depend on the data and show
 * at once; the table of words and the removed ones wait for the database.
 */
export async function VocabularySection() {
  const t = await getTranslations("rules.vocabulary");

  return (
    <section aria-labelledby="vocabulary-heading" className="flex flex-col gap-4">
      <h2 id="vocabulary-heading" className="text-title font-medium">
        {t("heading")}
      </h2>
      <p>{t("intro")}</p>
      <ul className="list-disc pl-6">
        <li>
          {t("origins.user")}: {t("originHelp.user")}
        </li>
        <li>
          {t("origins.fixed")}: {t("originHelp.fixed")}
        </li>
        <li>
          {t("origins.history")}: {t("originHelp.history")}
        </li>
      </ul>

      <Suspense fallback={<VocabularyWordsLoading />}>
        <VocabularyWords />
      </Suspense>

      <h3 className="text-title font-medium">{t("addHeading")}</h3>
      <VocabularyForm action={addVocabularyWordAction} />
    </section>
  );
}

// The same `thead` for the loaded table and for its skeleton.
function VocabularyHead() {
  const t = useTranslations("rules.vocabulary");

  return (
    <thead>
      <tr>
        <th scope="col">{t("columns.word")}</th>
        <th scope="col">{t("columns.type")}</th>
        <th scope="col">{t("columns.origin")}</th>
        <th scope="col">{t("columns.actions")}</th>
      </tr>
    </thead>
  );
}

function VocabularyWordsLoading() {
  const t = useTranslations("rules.vocabulary");
  const loading = useTranslations("loading");

  return (
    <SkeletonRegion label={loading("table")}>
      <SkeletonDataTable
        caption={t("caption")}
        head={<VocabularyHead />}
        columns={["start", "start", "start", "start"]}
        rows={4}
      />
    </SkeletonRegion>
  );
}

async function readVocabularyOverview() {
  "use cache";
  tagDataRead();
  return withDatabase(getVocabularyOverview);
}

async function VocabularyWords() {
  await requireSession();
  // The page reads the database: it must run per request, never at build time.
  await connection();
  const t = await getTranslations("rules.vocabulary");
  const overview = await readVocabularyOverview();

  return (
    <>
      <DataTable caption={t("caption")}>
        <VocabularyHead />
        <tbody>
          {overview.words.map(({ word, type, origin }) => (
            <tr key={word}>
              <th scope="row">{word}</th>
              <td>{t(`types.${type}`)}</td>
              <td>
                <Pill>{t(`origins.${origin}`)}</Pill>
              </td>
              <td>
                <div className="flex flex-wrap items-center gap-2">
                  <form
                    action={changeVocabularyTypeAction.bind(null, word)}
                    className="flex items-center gap-2"
                  >
                    <label htmlFor={`type-${word}`} className="sr-only">
                      {t("changeTypeOf", { word })}
                    </label>
                    <Select id={`type-${word}`} name="type" defaultValue={type} inline>
                      {MOVEMENT_TYPES.map((option) => (
                        <option key={option} value={option}>
                          {t(`types.${option}`)}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" variant="link">
                      {t("change")}
                      <span className="sr-only"> {word}</span>
                    </Button>
                  </form>
                  <form action={removeVocabularyWordAction.bind(null, word)}>
                    <Button type="submit" variant="link">
                      {t("remove")}
                      <span className="sr-only"> {word}</span>
                    </Button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      {overview.removed.length > 0 ? (
        <section aria-labelledby="removed-heading" className="flex flex-col gap-2">
          <h3 id="removed-heading" className="text-title font-medium">
            {t("removedHeading")}
          </h3>
          <p>{t("removedIntro")}</p>
          <ul className="flex flex-col gap-1">
            {overview.removed.map((word) => (
              <li key={word} className="flex items-center gap-2">
                <span className="font-medium">{word}</span>
                <form action={restoreVocabularyWordAction.bind(null, word)}>
                  <Button type="submit" variant="link">
                    {t("restore")}
                    <span className="sr-only"> {word}</span>
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
