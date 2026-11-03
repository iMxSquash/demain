import type en from "../../../messages/en.json";
import type { ConfirmReason, SplitSegment } from "../../domain/import-review";
import { formatAmount } from "../../domain/money";
import type { Flatten } from "./describe-issues";

/** Keys of the review messages, checked against the reference translation file. */
export type StagedKey = Flatten<(typeof en)["imports"]["staged"]>;

export type StagedT = (
  key: StagedKey,
  values?: Record<string, string | number>,
) => string;

function describeConfirmReason(reason: ConfirmReason, t: StagedT): string {
  switch (reason.kind) {
    case "typeCellConflict":
      return t(`confirm.typeCellConflict.${reason.against}`, { value: reason.value });
    case "typeCellUnknown":
      return t(`confirm.${reason.kind}`, { value: reason.value });
    case "categoryWord":
    case "categoryOverruled":
      return t(`confirm.${reason.kind}`, { category: reason.category });
    case "history":
    case "historyOverruled":
    case "sign":
    case "debitCredit":
      return t(`confirm.${reason.kind}`, { type: t(`typeNouns.${reason.type}`) });
    case "nothing":
      return t("confirm.nothing");
  }
}

/** Why a row is "to confirm", as the text that follows its label. */
export function describeConfirmReasons(
  reasons: readonly ConfirmReason[],
  t: StagedT,
): string {
  return reasons.map((reason) => describeConfirmReason(reason, t)).join("; ");
}

export interface SplitSay {
  t: StagedT;
  currency: string;
  locale: string;
  nameOf: (accountId: number) => string;
}

/** The parts of a savings row, from the plan of the domain: "100.00 to A, 200.00 to B". */
export function describeSplit(
  segments: readonly SplitSegment[],
  { t, currency, locale, nameOf }: SplitSay,
): string {
  return segments
    .map(({ direction, accountId, amount }) =>
      t(`split.${direction}`, {
        amount: formatAmount(amount, currency, locale),
        account: accountId === null ? "" : nameOf(accountId),
      }),
    )
    .join(", ");
}
