"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, type FormEvent } from "react";

import { overflowTargetChoices, type OverflowDemand, type OverflowTarget } from "../../domain/import-overflow";
import { formatAmount } from "../../domain/money";
import { BUTTON_CLASS, CONTROL_CLASS } from "../form-field";
import type { ImportAccountOption } from "./import-form-data";

interface DemandCardProps {
  demand: OverflowDemand;
  accounts: readonly ImportAccountOption[];
  receivingAccountId: number;
  isBusy: boolean;
  /** Called with the choice and the name to announce it by; nothing is saved at this point. */
  onChosen: (target: OverflowTarget, targetName: string) => void;
}

function DemandCard({ demand, accounts, receivingAccountId, isBusy, onChosen }: DemandCardProps) {
  const t = useTranslations("imports.staged.overflow");
  const tImports = useTranslations("imports");
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
  const nameRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const account = accounts.find(({ id }) => id === demand.accountId);
  const currency = account?.currency ?? "";
  const accountName = account?.name ?? "";
  // The account that receives the file cannot take the surplus back: the transfer would go to itself.
  const targetIds = new Set(
    overflowTargetChoices(accounts, demand.accountId, receivingAccountId, currency),
  );
  const options = accounts
    .filter(({ id }) => targetIds.has(id))
    .map(({ id, name: label }) => ({ id, label }));

  function choose() {
    const selected = options.find(({ id }) => String(id) === chosen);
    if (selected === undefined) {
      setError(t("chooseRequired"));
      selectRef.current?.focus();
      return;
    }
    onChosen({ kind: "existing", id: selected.id }, selected.label);
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      setCreateError(t("nameRequired"));
      nameRef.current?.focus();
      return;
    }
    onChosen({ kind: "new", name: trimmed }, trimmed);
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
          disabled={isBusy}
          aria-invalid={error === null ? undefined : true}
          aria-describedby={error === null ? hintId : `${hintId} ${errorId}`}
          onChange={(event) => {
            setChosen(event.currentTarget.value);
            setError(null);
          }}
          className={CONTROL_CLASS}
        >
          <option value="">{tImports("chooseAccount")}</option>
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
      <button type="button" disabled={isBusy} onClick={choose} className={`${BUTTON_CLASS} self-start`}>
        {t("choose")}
      </button>
      <form onSubmit={create} className="flex flex-col gap-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium">{t("createLegend")}</legend>
          <label htmlFor={nameId}>{t("nameLabel")}</label>
          <input
            id={nameId}
            ref={nameRef}
            value={name}
            disabled={isBusy}
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
          <button type="submit" disabled={isBusy} className={`${BUTTON_CLASS} self-start`}>
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
  onChosen: (accountId: number, target: OverflowTarget) => void;
}

/**
 * Asks, for each savings account with a ceiling and no overflow account that a
 * row exceeds, which account takes the surplus. The choice is only remembered:
 * it is saved, for good, together with the first file that is imported.
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
      {/* Always in the page: the card that held the focus is gone once its choice is made, so the focus comes here. */}
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
          onChosen={(target, targetName) => {
            setNotice(t("chosen", { account: nameOf(demand.accountId), overflow: targetName }));
            onChosen(demand.accountId, target);
            noticeRef.current?.focus();
          }}
        />
      ))}
    </>
  );
}
