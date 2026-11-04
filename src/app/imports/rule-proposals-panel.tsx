"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";

import { BUTTON_CLASS } from "../form-field";
import {
  listRuleProposalsAction,
  saveRuleProposalsAction,
} from "./checks-actions";
import type {
  RuleProposalsSaveState,
  RuleProposalsState,
} from "./import-form-data";

/** Offers the rules suggested by a recorded file as unchecked boxes; only the checked ones are created. */
export function RuleProposalsPanel({ batchId }: { batchId: number }) {
  const t = useTranslations("imports.staged.ruleProposals");
  const headingId = useId();
  const warningIdPrefix = useId();
  const [proposals, setProposals] = useState<RuleProposalsState | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [result, setResult] = useState<RuleProposalsSaveState | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let isCurrent = true;
    listRuleProposalsAction(batchId)
      .then((state) => {
        if (isCurrent) setProposals(state);
      })
      .catch((error: unknown) => {
        console.error("Rule proposals failed", error);
        if (isCurrent) setProposals({ status: "error", message: t("failed") });
      });
    return () => {
      isCurrent = false;
    };
  }, [batchId, t]);

  function toggle(key: string, isChecked: boolean) {
    const next = new Set(selected);
    if (isChecked) next.add(key);
    else next.delete(key);
    setSelected(next);
  }

  function save() {
    startTransition(async () => {
      try {
        const saved = await saveRuleProposalsAction(batchId, [...selected]);
        setResult(saved);
        if (saved.status !== "saved") return;
        setSelected(new Set());
        setProposals(await listRuleProposalsAction(batchId));
      } catch (error) {
        console.error("Saving rule proposals failed", error);
        setResult({ status: "error", message: t("failed") });
      }
    });
  }

  const list = proposals?.status === "ready" ? proposals.proposals : [];

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col items-start gap-2 border-t border-neutral-500 pt-3"
    >
      <h4 id={headingId} className="font-semibold">
        {t("heading")}
      </h4>
      {proposals === null ? <p role="status">{t("loading")}</p> : null}
      {proposals?.status === "error" ? <p role="status">{proposals.message}</p> : null}
      {proposals?.status === "ready" && list.length === 0 ? (
        <p>{proposals.hasCategorizedRow ? t("empty") : t("noCategorizedRow")}</p>
      ) : null}
      {list.length > 0 ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          className="flex flex-col items-start gap-2"
        >
          <p>{t("intro")}</p>
          <fieldset className="flex flex-col gap-1">
            <legend className="font-medium">{t("legend")}</legend>
            {list.map((proposal) => {
              const warningId = `${warningIdPrefix}-${proposal.key}`;
              return (
                <div key={proposal.key} className="flex flex-col gap-1">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(proposal.key)}
                      aria-describedby={
                        proposal.shadowingCategoryName === null ? undefined : warningId
                      }
                      onChange={(event) => toggle(proposal.key, event.currentTarget.checked)}
                    />
                    <span>
                      {t("option", { label: proposal.label, category: proposal.categoryName })}
                    </span>
                  </label>
                  {proposal.shadowingCategoryName === null ? null : (
                    <p id={warningId} className="ml-6 text-sm">
                      {t("shadowed", { category: proposal.shadowingCategoryName })}
                    </p>
                  )}
                </div>
              );
            })}
          </fieldset>
          <button type="submit" disabled={isPending} className={BUTTON_CLASS}>
            {t("submit")}
          </button>
        </form>
      ) : null}
      <div role="status">
        {isPending ? <p>{t("saving")}</p> : null}
        {result === null || isPending ? null : <p className="font-medium">{result.message}</p>}
      </div>
    </section>
  );
}
