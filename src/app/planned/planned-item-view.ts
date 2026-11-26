import { toRepetition, versionInEffectAt } from "../../domain/planned-item";
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

/** What the schedule of a version is read from. */
type ScheduleVersion = Pick<PlannedItemVersion, "repetitionKind" | "repetitionValue">;

/** The repetition of one version in words, or "Once on <date>" for a one-off event. */
export function versionScheduleText(
  translate: ScheduleTranslate,
  locale: string,
  startDate: string,
  version: ScheduleVersion,
): string {
  const repetition = toRepetition(version.repetitionKind, version.repetitionValue);
  if (repetition === null) {
    return translate("schedule.once", { date: formatCalendarDate(startDate, locale) });
  }
  return repetitionText(translate, repetition);
}

/** What the schedule of an item is read from. */
interface ScheduleSource {
  startDate: string;
  endDate: string | null;
  versions: (ScheduleVersion & Pick<PlannedItemVersion, "effectiveFrom">)[];
}

/**
 * The schedule of an item in words, as it stands on `today`: "Monthly on day 12", "Every 2 weeks",
 * "Once on 5 March 2027". `today` is a calendar date read by the caller, so that no clock is read here.
 */
export function scheduleText(
  translate: ScheduleTranslate,
  locale: string,
  item: ScheduleSource,
  today: string,
): string {
  const version = versionInEffectAt(item.versions, today);
  const text = versionScheduleText(translate, locale, item.startDate, version);
  if (version.repetitionKind === null || item.endDate === null) {
    return text;
  }
  return translate("schedule.until", {
    schedule: text,
    date: formatCalendarDate(item.endDate, locale),
  });
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

/**
 * The categories an item may be given. Archived ones are not offered, except the one the item has
 * already: it stays in the list, worded as archived, so that saving does not drop it without a word
 * (the domain then refuses it and names the field).
 */
export function categoryOptionsOf(
  categories: readonly { id: number; name: string; archived: boolean }[],
  currentCategoryId: number | null,
  archivedName: (name: string) => string,
): { id: number; name: string }[] {
  return categories
    .filter((category) => !category.archived || category.id === currentCategoryId)
    .map((category) => ({
      id: category.id,
      name: category.archived ? archivedName(category.name) : category.name,
    }));
}
