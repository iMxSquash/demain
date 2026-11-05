import { getTranslations } from "next-intl/server";

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
      <h2 id="vocabulary-heading" className="text-xl font-semibold">
        {t("heading")}
      </h2>
      <p>{t("intro")}</p>
      <ul className="list-disc pl-6">
        <li>{t("origins.user")}: {t("originHelp.user")}</li>
        <li>{t("origins.fixed")}: {t("originHelp.fixed")}</li>
        <li>{t("origins.history")}: {t("originHelp.history")}</li>
      </ul>

      <table className="w-full border-collapse text-left">
        <caption className="pb-2 text-left">{t("caption")}</caption>
        <thead>
          <tr className="border-b border-neutral-500">
            <th scope="col" className="py-2 pr-4">{t("columns.word")}</th>
            <th scope="col" className="py-2 pr-4">{t("columns.type")}</th>
            <th scope="col" className="py-2 pr-4">{t("columns.origin")}</th>
            <th scope="col" className="py-2">{t("columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {overview.words.map(({ word, type, origin }) => (
            <tr key={word} className="border-b border-neutral-300">
              <th scope="row" className="py-2 pr-4 font-medium">{word}</th>
              <td className="py-2 pr-4">{t(`types.${type}`)}</td>
              <td className="py-2 pr-4">{t(`origins.${origin}`)}</td>
              <td className="py-2">
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
                    <button type="submit" className="min-h-11 px-2 underline">
                      {t("change")}<span className="sr-only"> {word}</span>
                    </button>
                  </form>
                  <form action={removeVocabularyWordAction.bind(null, word)}>
                    <button type="submit" className="min-h-11 px-2 underline">
                      {t("remove")}<span className="sr-only"> {word}</span>
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {overview.removed.length > 0 ? (
        <section aria-labelledby="removed-heading" className="flex flex-col gap-2">
          <h3 id="removed-heading" className="text-lg font-semibold">
            {t("removedHeading")}
          </h3>
          <p>{t("removedIntro")}</p>
          <ul className="flex flex-col gap-1">
            {overview.removed.map((word) => (
              <li key={word} className="flex items-center gap-2">
                <span className="font-medium">{word}</span>
                <form action={restoreVocabularyWordAction.bind(null, word)}>
                  <button type="submit" className="min-h-11 px-2 underline">
                    {t("restore")}<span className="sr-only"> {word}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h3 className="text-lg font-semibold">{t("addHeading")}</h3>
      <VocabularyForm action={addVocabularyWordAction} />
    </section>
  );
}
