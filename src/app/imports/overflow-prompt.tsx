"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, type FormEvent } from "react";

import type { OverflowDemand } from "../../domain/import-overflow";
import { formatAmount } from "../../domain/money";
import type { OverflowAccount } from "../../domain/overflow";
import { BUTTON_CLASS, CONTROL_CLASS } from "../form-field";
import type { ImportAccountOption } from "./import-form-data";
import { chooseOverflowAccountAction, createOverflowAccountAction } from "./overflow-actions";

interface MadeAccount {
  name: string;
  account: OverflowAccount;
}

interface DemandCardProps {
  demand: OverflowDemand;
  accounts: readonly ImportAccountOption[];
  receivingAccountId: number;
  isBusy: boolean;
  /** Called once the choice is saved; `created` is the account made in the card, if it was chosen. */
  onChosen: (
    overflowAccountId: number,
    overflowName: string,
    created: OverflowAccount | undefined,
  ) => void;
}

function DemandCard({ demand, accounts, receivingAccountId, isBusy, onChosen }: DemandCardProps) {
  const t = useTranslations("imports.staged.overflow");
  const common = useTranslations("common");
  const locale = useLocale();
  const headingId = useId();
  const selectId = useId();
  const hintId = useId();
  const errorId = useId();
  const nameId = useId();
  const nameHintId = useId();
  const createErrorId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const [made, setMade] = useState<readonly MadeAccount[]>([]);
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const account = accounts.find(({ id }) => id === demand.accountId);
  const currency = account?.currency ?? "";
  const accountName = account?.name ?? "";
  // The account that receives the file cannot take the surplus back: the transfer would go to itself.
  const options = [
    ...accounts
      .filter(
        (candidate) =>
          candidate.id !== demand.accountId &&
          candidate.id !== receivingAccountId &&
          candidate.currency === currency,
      )
      .map(({ id, name: label }) => ({ id, label })),
    ...made
      .filter(({ account: created }) => !accounts.some(({ id }) => id === created.id))
      .map(({ name: label, account: created }) => ({ id: created.id, label })),
  ];
  const locked = isBusy || isWorking;

  async function choose() {
    if (chosen === "") {
      setError(t("chooseRequired"));
      selectRef.current?.focus();
      return;
    }
    const overflowAccountId = Number(chosen);
    setIsWorking(true);
    try {
      const result = await chooseOverflowAccountAction({
        receivingAccountId,
        accountId: demand.accountId,
        overflowAccountId,
      });
      if (result.status === "error") {
        setError(result.message);
        selectRef.current?.focus();
        return;
      }
      setError(null);
      onChosen(
        overflowAccountId,
        options.find(({ id }) => id === overflowAccountId)?.label ?? "",
        made.find(({ account: created }) => created.id === overflowAccountId)?.account,
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsWorking(true);
    try {
      const result = await createOverflowAccountAction({
        likeAccountId: demand.accountId,
        name,
      });
      if (result.status === "error") {
        setCreateError(result.message);
        return;
      }
      if (result.status !== "created") return;
      setCreateError(null);
      setName("");
      setMade((previous) => [...previous, { name: result.name, account: result.account }]);
      setChosen(String(result.account.id));
      setError(null);
      // The button that was pressed is disabled while the call runs: the focus goes to the choice.
      requestAnimationFrame(() => selectRef.current?.focus());
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded border border-neutral-500 p-4">
      <h3 id={headingId} className="text-lg font-semibold">
        {t("heading", { account: accountName })}
      </h3>
      <p>
        {t("shortfall", {
          amount: formatAmount(demand.amount, currency, locale),
          account: accountName,
          rows: demand.rows,
        })}
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId}>{t("selectLabel", { account: accountName })}</label>
        <select
          id={selectId}
          ref={selectRef}
          value={chosen}
          disabled={locked}
          aria-invalid={error === null ? undefined : true}
          aria-describedby={error === null ? hintId : `${hintId} ${errorId}`}
          onChange={(event) => {
            setChosen(event.currentTarget.value);
            setError(null);
          }}
          className={CONTROL_CLASS}
        >
          <option value="">{t("noChoice")}</option>
          {options.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <p id={hintId} className="text-sm">
          {t("permanent", { account: accountName })}
        </p>
        {error === null ? null : (
          <p id={errorId} role="alert" className="font-medium text-red-800">
            {common("error", { message: error })}
          </p>
        )}
      </div>
      <button type="button" disabled={locked} onClick={choose} className={`${BUTTON_CLASS} self-start`}>
        {t("choose")}
      </button>
      <form onSubmit={create} className="flex flex-col gap-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium">{t("createLegend")}</legend>
          <label htmlFor={nameId}>{t("nameLabel")}</label>
          <input
            id={nameId}
            value={name}
            disabled={locked}
            aria-invalid={createError === null ? undefined : true}
            aria-describedby={createError === null ? nameHintId : `${nameHintId} ${createErrorId}`}
            onChange={(event) => {
              setName(event.currentTarget.value);
              setCreateError(null);
            }}
            className={CONTROL_CLASS}
          />
          <p id={nameHintId} className="text-sm">
            {t("createHint", { currency })}
          </p>
          {createError === null ? null : (
            <p id={createErrorId} role="alert" className="font-medium text-red-800">
              {common("error", { message: createError })}
            </p>
          )}
          <button type="submit" disabled={locked} className={`${BUTTON_CLASS} self-start`}>
            {t("create")}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

interface OverflowPromptProps {
  demands: readonly OverflowDemand[];
  accounts: readonly ImportAccountOption[];
  receivingAccountId: number;
  isBusy: boolean;
  onChosen: (
    accountId: number,
    overflowAccountId: number,
    created: OverflowAccount | undefined,
  ) => void;
}

/**
 * Asks, for each savings account with a ceiling and no overflow account that a
 * row exceeds, which account takes the surplus. The choice is saved for good.
 */
export function OverflowPrompt({
  demands,
  accounts,
  receivingAccountId,
  isBusy,
  onChosen,
}: OverflowPromptProps) {
  const t = useTranslations("imports.staged.overflow");
  const noticeRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nameOf = (id: number) => accounts.find((account) => account.id === id)?.name ?? "";

  return (
    <>
      {/* Always in the page: the card that held the focus is gone once its choice is saved, so the focus comes here. */}
      <div ref={noticeRef} role="status" tabIndex={-1}>
        {notice === null ? null : <p className="font-medium">{notice}</p>}
      </div>
      {demands.map((demand) => (
        <DemandCard
          key={demand.accountId}
          demand={demand}
          accounts={accounts}
          receivingAccountId={receivingAccountId}
          isBusy={isBusy}
          onChosen={(overflowAccountId, overflowName, created) => {
            setNotice(
              t("chosen", { account: nameOf(demand.accountId), overflow: overflowName }),
            );
            onChosen(demand.accountId, overflowAccountId, created);
            noticeRef.current?.focus();
          }}
        />
      ))}
    </>
  );
}
