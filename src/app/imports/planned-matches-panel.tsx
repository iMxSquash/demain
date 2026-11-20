"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { formatAmount } from "../../domain/money";
import { formatCalendarDate } from "../../i18n/dates";
import { Button } from "../../components/button";
import { Notice } from "../../components/notice";
import { confirmMatchAction, listBatchMatchesAction, undoMatchAction } from "./match-actions";
import type {
  BatchMatchesState,
  MatchActionState,
  MatchPairView,
  ProposedGroupView,
  ProposedOptionView,
} from "./import-form-data";

const LEAVE_UNMATCHED = "";

function pairKey({ transactionId, plannedItemId, nominalDate }: MatchPairView): string {
  return `${transactionId}:${plannedItemId}:${nominalDate}`;
}

/** The first option names the group: a group keeps its options while the owner decides. */
function groupKey(group: ProposedGroupView): string {
  return group.options.map((option) => pairKey(option.pair)).join("|");
}

async function loadMatches(batchId: number, failedMessage: string): Promise<BatchMatchesState> {
  try {
    return await listBatchMatchesAction(batchId);
  } catch (error) {
    console.error("Planned matches failed", error);
    return { status: "error", message: failedMessage };
  }
}

interface ProposedGroupProps {
  group: ProposedGroupView;
  number: number;
  /** The key of the chosen option, or `LEAVE_UNMATCHED`. */
  chosen: string;
  currency: string;
  isPending: boolean;
  onChoose: (key: string) => void;
  onConfirm: (option: ProposedOptionView) => void;
  onLeave: () => void;
}

/** One group of competing options: native radios, nothing applied unless one is chosen and confirmed. */
function ProposedGroup({
  group,
  number,
  chosen,
  currency,
  isPending,
  onChoose,
  onConfirm,
  onLeave,
}: ProposedGroupProps) {
  const t = useTranslations("imports.staged.plannedMatches");
  const locale = useLocale();
  const radioName = useId();
  const noteId = useId();
  const chosenOption = group.options.find((option) => pairKey(option.pair) === chosen);
  const noteIds = chosenOption?.givesCategory ? noteId : undefined;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (chosenOption === undefined) onLeave();
        else onConfirm(chosenOption);
      }}
      className="flex flex-col items-start gap-2"
    >
      <fieldset aria-describedby={noteIds} className="flex flex-col gap-1">
        <legend className="font-medium">{t("groupLegend", { number })}</legend>
        {group.options.map((option) => {
          const key = pairKey(option.pair);
          return (
            <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="radio"
                name={radioName}
                value={key}
                checked={chosen === key}
                aria-describedby={chosen === key ? noteIds : undefined}
                onChange={() => onChoose(key)}
                className="mt-3 size-5 shrink-0 accent-primary"
              />
              <span className="py-2.5">
                {t("option", {
                  item: option.plannedItemName,
                  nominalDate: formatCalendarDate(option.nominalDate, locale),
                  label: option.transactionLabel,
                  date: formatCalendarDate(option.transactionDate, locale),
                  amount: formatAmount(option.transactionAmount, currency, locale),
                })}
              </span>
            </label>
          );
        })}
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="radio"
            name={radioName}
            value={LEAVE_UNMATCHED}
            checked={chosen === LEAVE_UNMATCHED}
            onChange={() => onChoose(LEAVE_UNMATCHED)}
            className="mt-3 size-5 shrink-0 accent-primary"
          />
          <span className="py-2.5">{t("leaveUnmatched")}</span>
        </label>
      </fieldset>
      {chosenOption?.givesCategory ? <Notice id={noteId}>{t("categoryNote")}</Notice> : null}
      <Button
        type="submit"
        pending={isPending}
        pendingLabel={t("confirmPending")}
        className="self-start"
      >
        {t("confirm")}
      </Button>
    </form>
  );
}

/**
 * What the matching did on a recorded file: the automatic matches the owner can undo, and the
 * ambiguous ones the owner can confirm one by one. A match is only created by an explicit choice.
 */
export function PlannedMatchesPanel({
  batchId,
  currency,
}: {
  batchId: number;
  /** The currency of the file: the matches carry amounts in its minor units. */
  currency: string;
}) {
  const t = useTranslations("imports.staged.plannedMatches");
  const locale = useLocale();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [matches, setMatches] = useState<BatchMatchesState | null>(null);
  const [choices, setChoices] = useState<Readonly<Record<string, string>>>({});
  const [result, setResult] = useState<MatchActionState | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let isCurrent = true;
    loadMatches(batchId, t("failed")).then((state) => {
      if (isCurrent) setMatches(state);
    });
    return () => {
      isCurrent = false;
    };
  }, [batchId, t]);

  function run(action: () => Promise<MatchActionState>) {
    startTransition(async () => {
      try {
        setResult(await action());
      } catch (error) {
        console.error("Planned match action failed", error);
        setResult({ status: "error", message: t("failed") });
      }
      setChoices({});
      setMatches(await loadMatches(batchId, t("failed")));
      headingRef.current?.focus();
    });
  }

  function leaveUnmatched() {
    setResult({ status: "done", message: t("nothingChosen") });
    headingRef.current?.focus();
  }

  const isReady = matches?.status === "ready";
  const matched = isReady ? matches.matched : [];
  const groups = isReady ? matches.groups : [];

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col items-start gap-3 border-t border-border-control pt-3"
    >
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="font-medium">
        {t("heading")}
      </h3>
      {matches === null ? <p>{t("loading")}</p> : null}
      {matches?.status === "error" ? <p>{matches.message}</p> : null}
      {isReady && matched.length === 0 && groups.length === 0 ? <p>{t("empty")}</p> : null}
      {matched.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="font-medium">{t("matchedHeading")}</h4>
          <ul className="flex flex-col gap-2">
            {matched.map((match) => (
              <li
                key={match.transactionId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <span>
                  {t("matched", {
                    label: match.label,
                    date: formatCalendarDate(match.date, locale),
                    amount: formatAmount(match.amount, currency, locale),
                    item: match.plannedItemName,
                    nominalDate: formatCalendarDate(match.nominalDate, locale),
                  })}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={t("undoLabel", { label: match.label })}
                  pending={isPending}
                  pendingLabel={t("undoPending")}
                  onClick={() => run(() => undoMatchAction(batchId, match.transactionId))}
                >
                  {t("undo")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {groups.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h4 className="font-medium">{t("toConfirmHeading")}</h4>
          <p>{t("toConfirmIntro")}</p>
          {groups.map((group, index) => {
            const key = groupKey(group);
            return (
              <ProposedGroup
                key={key}
                group={group}
                number={index + 1}
                chosen={choices[key] ?? LEAVE_UNMATCHED}
                currency={currency}
                isPending={isPending}
                onChoose={(choice) => setChoices({ ...choices, [key]: choice })}
                onConfirm={(option) => run(() => confirmMatchAction(batchId, option.pair))}
                onLeave={leaveUnmatched}
              />
            );
          })}
        </div>
      ) : null}
      <div role="status">
        {isPending ? <p>{t("working")}</p> : null}
        {result === null || isPending ? null : <p className="font-medium">{result.message}</p>}
      </div>
    </section>
  );
}
