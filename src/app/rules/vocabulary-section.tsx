import { getTranslations } from "next-intl/server";

import { Button } from "../../components/button";
import { DataTable, Pill } from "../../components/data-display";
import { MOVEMENT_TYPES } from "../../domain/import-columns";
import type { VocabularyOverview } from "../../ledger/type-vocabulary";
import { CONTROL_CLASS } from "../form-field";
import {
  addVocabularyWordAction,
  changeVocabularyTypeAction,
  removeVocabularyWordAction,
  restoreVocabularyWordAction,
} from "./vocabulary-actions";
import { VocabularyForm } from "./vocabulary-form";

/**
 * The words of a category that give the type of an imported row, with where
 * each one comes from written out: the origin is never carried by color alone.
 */
export async function VocabularySection({ overview }: { overview: VocabularyOverview }) {
  const t = await getTranslations("rules.vocabulary");

  return (
    <section aria-labelledby="vocabulary-heading" className="flex flex-col gap-4">
      <h2 id="vocabulary-heading" className="text-title font-medium">
        {t("heading")}
      </h2>
      <p>{t("intro")}</p>
      <ul className="list-disc pl-6">
        <li>{t("origins.user")}: {t("originHelp.user")}</li>
        <li>{t("origins.fixed")}: {t("originHelp.fixed")}</li>
        <li>{t("origins.history")}: {t("originHelp.history")}</li>
      </ul>

      <DataTable caption={t("caption")}>
        <thead>
          <tr>
            <th scope="col">{t("columns.word")}</th>
            <th scope="col">{t("columns.type")}</th>
            <th scope="col">{t("columns.origin")}</th>
            <th scope="col">{t("columns.actions")}</th>
          </tr>
        </thead>
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
                    <select
                      id={`type-${word}`}
                      name="type"
                      defaultValue={type}
                      className={`${CONTROL_CLASS} w-auto`}
                    >
                      {MOVEMENT_TYPES.map((option) => (
                        <option key={option} value={option}>
                          {t(`types.${option}`)}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="link">
                      {t("change")}<span className="sr-only"> {word}</span>
                    </Button>
                  </form>
                  <form action={removeVocabularyWordAction.bind(null, word)}>
                    <Button type="submit" variant="link">
                      {t("remove")}<span className="sr-only"> {word}</span>
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
                    {t("restore")}<span className="sr-only"> {word}</span>
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h3 className="text-title font-medium">{t("addHeading")}</h3>
      <VocabularyForm action={addVocabularyWordAction} />
    </section>
  );
}
