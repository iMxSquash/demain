import { toRepetition } from "../../domain/planned-item";
import type { Repetition } from "../../domain/recurrence";
import { formatCalendarDate } from "../../i18n/dates";
import type { PlannedItemVersion, PlannedItemWithDetails } from "../../ledger/planned-items";

type ScheduleMessageKey =
  | "schedule.once"
  | "schedule.monthlyOnDay"
  | "schedule.monthlyOnLastDay"
  | "schedule.everyNMonths"
  | "schedule.quarterly"
  | "schedule.yearly"
  | "schedule.everyNWeeks"
  | "schedule.until";

/** The `planned` translator, narrowed to the messages that word a schedule. */
export type ScheduleTranslate = (
  key: ScheduleMessageKey,
  values?: Record<string, string | number>,
) => string;

/**
 * The version that holds the amount and the repetition shown for an item. Versions are ordered by
 * effective date and an item has only its first one until #161 adds the others, so the last one
 * is the one to show without reading the clock.
 */
export function currentVersionOf<Version>(item: { id: number; versions: Version[] }): Version {
  const version = item.versions.at(-1);
  if (version === undefined) throw new RangeError(`Planned item ${item.id} has no version`);
  return version;
}

function repetitionText(translate: ScheduleTranslate, repetition: Repetition): string {
  switch (repetition.kind) {
    case "monthly_on_day":
      return translate("schedule.monthlyOnDay", { day: repetition.day });
    case "monthly_on_last_day":
      return translate("schedule.monthlyOnLastDay");
    case "every_n_months":
      return translate("schedule.everyNMonths", { months: repetition.months });
    case "quarterly":
      return translate("schedule.quarterly");
    case "yearly":
      return translate("schedule.yearly");
    case "every_n_weeks":
      return translate("schedule.everyNWeeks", { weeks: repetition.weeks });
  }
}

/** What the schedule of an item is read from. */
interface ScheduleSource {
  id: number;
  startDate: string;
  endDate: string | null;
  versions: Pick<PlannedItemVersion, "repetitionKind" | "repetitionValue">[];
}

/** The schedule of an item in words: "Monthly on day 12", "Every 2 weeks", "Once on 5 March 2027". */
export function scheduleText(
  translate: ScheduleTranslate,
  locale: string,
  item: ScheduleSource,
): string {
  const version = currentVersionOf(item);
  const repetition = toRepetition(version.repetitionKind, version.repetitionValue);
  if (repetition === null) {
    return translate("schedule.once", { date: formatCalendarDate(item.startDate, locale) });
  }
  const text = repetitionText(translate, repetition);
  return item.endDate === null
    ? text
    : translate("schedule.until", { schedule: text, date: formatCalendarDate(item.endDate, locale) });
}

/** The account of an item, or "from X to Y" for a transfer. `transferText` words the pair. */
export function accountTextOf(
  item: Pick<PlannedItemWithDetails, "accountId" | "destinationAccountId">,
  accountNames: ReadonlyMap<number, string>,
  transferText: (names: { from: string; to: string }) => string,
): string {
  const from = accountNames.get(item.accountId) ?? "";
  if (item.destinationAccountId === null) return from;
  return transferText({ from, to: accountNames.get(item.destinationAccountId) ?? "" });
}
