"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/button";
import { Notice } from "../../components/notice";
import { ChoiceChips, type ChipOption } from "../../components/choice-chips";
import type { SurplusChoice } from "./transaction-form-data";
import { TRANSFER_DECISION } from "./transfer-decision";

const KEEP_IN_SOURCE = "keep";

interface SurplusStepProps {
  /** What the server found: the split is its computation, the browser never decides what fits. */
  choice: SurplusChoice;
  sourceName: string;
  destinationName: string;
  /** The accounts that can take the surplus, in display order. */
  targets: readonly { id: number; name: string }[];
  isPending: boolean;
  error?: string | undefined;
  /** Called when Cancel is pressed, so the form can return the focus to its save button. */
  onCancel: () => void;
}

/**
 * The step that replaces the save button when a transfer does not fit under the ceiling of its
 * destination (DESIGN section 10, "Above the ceiling"). Its heading takes the focus when it
 * opens. The buttons post the decision with the form; Cancel records nothing.
 */
export function SurplusStep({ choice, sourceName, destinationName, targets, isPending, error, onCancel }: SurplusStepProps) {
  const t = useTranslations("transactions.add");
  const common = useTranslations("common");
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The overflow account of the destination comes first when there is one.
  const [surplusTo, setSurplusTo] = useState(
    targets.some((target) => String(target.id) === choice.suggestedAccountId)
      ? choice.suggestedAccountId
      : KEEP_IN_SOURCE,
  );

  useEffect(() => headingRef.current?.focus(), []);

  const target = targets.find((candidate) => String(candidate.id) === surplusTo);
  const options: ChipOption[] = [
    ...targets.map((account) => ({
      value: String(account.id),
      label: t("surplusSend", { account: account.name }),
    })),
    { value: KEEP_IN_SOURCE, label: t("surplusKeep", { account: sourceName }) },
  ];

  return (
    <div className="motion-enter flex flex-col gap-4">
      <h4 ref={headingRef} tabIndex={-1} className="font-medium outline-none">
        {t("aboveCeiling")}
      </h4>
      <Notice>
        {t("surplusWarning", {
          deposited: choice.depositedText,
          surplus: choice.surplusText,
          account: destinationName,
        })}
      </Notice>
      {/* Only a surplus sent elsewhere names an account: keeping it posts none. */}
      {target === undefined ? null : <input type="hidden" name="surplusAccountId" value={target.id} />}
      <ChoiceChips
        id="surplusAccountId"
        legend={t("surplusWhere")}
        name="surplusChoice"
        value={surplusTo}
        onChange={setSurplusTo}
        options={options}
        layout="row"
        error={error}
      />
      <div className="flex gap-3">
        <Button
          type="submit"
          name="decision"
          value={TRANSFER_DECISION.cancel}
          variant="secondary"
          pending={isPending}
          onClick={onCancel}
        >
          {common("cancel")}
        </Button>
        <Button
          type="submit"
          name="decision"
          value={target === undefined ? TRANSFER_DECISION.roomOnly : TRANSFER_DECISION.sendSurplus}
          pending={isPending}
          className="min-h-13 flex-1"
        >
          {target === undefined
            ? t("confirmRoomOnly", { deposited: choice.depositedText, account: destinationName })
            : t("confirmSend", { deposited: choice.depositedText, account: target.name })}
        </Button>
      </div>
    </div>
  );
}
