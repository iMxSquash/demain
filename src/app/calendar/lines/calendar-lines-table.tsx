import { DataTable, EmptyState, Pill } from "../../../components/data-display";
import { formatAmount, formatEditableAmount } from "../../../domain/money";
import { formatCalendarDate, formatWeekdayDate } from "../../../i18n/dates";
import type { CalendarEntry, CalendarMonth } from "../../../ledger/calendar";
import { OccurrenceChangeButton } from "../occurrence-change-button";

export interface CalendarLinesTableText {
  caption: string;
  columns: {
    date: string;
    description: string;
    account: string;
    kind: string;
    status: string;
    amount: string;
    balance: string;
    actions: string;
  };
  kinds: { real: string; planned: string };
  statuses: Record<"planned" | "partial" | "confirmed" | "overdue" | "cancelled", string>;
  belowZero: string;
  belowZeroFrom: (date: string) => string;
  unplacedSurplus: (amount: string, account: string) => string;
  routingInvalid: string;
  transferTo: (from: string, to: string) => string;
  empty: string;
  unconverted: (currencies: string) => string;
  /** The button that skips, moves or restores one planned occurrence, and the title of its dialog. */
  change: string;
  changeTitle: (name: string, date: string) => string;
}

export interface CalendarLinesTableProps {
  month: CalendarMonth;
  accounts: { id: number; name: string }[];
  locale: string;
  text: CalendarLinesTableText;
}

// The 880 px threshold of DESIGN section 18 is written here once: the table and the list swap at it.
const TABLE_CLASS = "hidden @min-[880px]:block";
const LIST_CLASS = "@min-[880px]:hidden";

const REAL_ROW_CLASS = "text-text";
// The table styles its own rows: `!` is what lets the dashed top border win over its solid hairline.
const PLANNED_ROW_CLASS = "border-dashed! border-border-control! text-text-muted";
const PLANNED_ITEM_CLASS = "border-dashed border-border-control text-text-muted";
const ENTRY_NOTE_CLASS = "block text-caption font-medium text-warning";

interface LineView {
  isCancelled: boolean;
  isPlanned: boolean;
  account: string;
  kind: string;
  status: { label: string; tone: "neutral" | "warning" } | null;
  amount: string;
  notes: string[];
}

interface Line {
  entry: CalendarEntry;
  view: LineView;
  /** The end-of-day balance, on the last line of a day only. */
  balance: { amount: string; isBelowZero: boolean } | null;
}

function lineViewOf(
  entry: CalendarEntry,
  nameOf: (accountId: number) => string,
  { locale, text }: Pick<CalendarLinesTableProps, "locale" | "text">,
): LineView {
  const notes: string[] = [];
  if (entry.unplacedSurplus !== null) {
    notes.push(
      text.unplacedSurplus(
        formatAmount(entry.unplacedSurplus.amount, entry.currency, locale),
        nameOf(entry.unplacedSurplus.accountId),
      ),
    );
  }
  if (entry.routingInvalid) notes.push(text.routingInvalid);

  return {
    isCancelled: entry.status === "cancelled",
    isPlanned: entry.kind === "planned",
    account:
      entry.destinationAccountId === null
        ? nameOf(entry.accountId)
        : text.transferTo(nameOf(entry.accountId), nameOf(entry.destinationAccountId)),
    kind: text.kinds[entry.kind],
    status:
      entry.status === null
        ? null
        : { label: text.statuses[entry.status], tone: entry.status === "overdue" ? "warning" : "neutral" },
    // A move says "X to Y": a sign would claim a direction for the selected account.
    amount: formatAmount(
      entry.destinationAccountId === null ? entry.amount : Math.abs(entry.amount),
      entry.currency,
      locale,
    ),
    notes,
  };
}

// Only the days that have entries have lines. Each line is read once and drawn by both layouts.
function linesOf({ month, accounts, locale, text }: CalendarLinesTableProps): Line[] {
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const nameOf = (accountId: number) => names.get(accountId) ?? String(accountId);
  return month.days.flatMap((day) =>
    day.entries.map((entry, index) => ({
      entry,
      view: lineViewOf(entry, nameOf, { locale, text }),
      balance:
        index === day.entries.length - 1 && day.balance !== null
          ? { amount: formatAmount(day.balance, month.currency, locale), isBelowZero: day.isBelowZero }
          : null,
    })),
  );
}

function StatusPill({ status }: { status: LineView["status"] }) {
  return status === null ? null : <Pill tone={status.tone}>{status.label}</Pill>;
}

function Notes({ notes }: { notes: readonly string[] }) {
  return notes.map((note) => (
    <span key={note} className={ENTRY_NOTE_CLASS}>
      {note}
    </span>
  ));
}

// A linked occurrence keeps what its transaction settled: it is unlinked first (owner decision Q1 of issue 174).
// A skipped one keeps its button, so that it can be restored.
function ChangeOccurrence({ entry, locale, text }: { entry: CalendarEntry; locale: string; text: CalendarLinesTableText }) {
  const { plannedItemId, nominalDate, override } = entry;
  if (entry.kind !== "planned" || entry.isLinked || plannedItemId === null || nominalDate === null) return null;
  const date = formatCalendarDate(nominalDate, locale);
  return (
    <OccurrenceChangeButton
      itemId={plannedItemId}
      nominalDate={nominalDate}
      label={text.change}
      subject={`${entry.label}, ${date}`}
      title={text.changeTitle(entry.label, date)}
      hasOverride={override !== null}
      isSkipped={override?.status === "cancelled"}
      initialValues={{
        overrideDate: override?.overrideDate ?? "",
        // Unsigned in the form: the kind of the item gives the direction.
        overrideAmount:
          override === null || override.overrideAmount === null
            ? ""
            : formatEditableAmount(Math.abs(override.overrideAmount), entry.currency),
      }}
    />
  );
}

function BelowZero({ text }: { text: CalendarLinesTableText }) {
  return <span className="block text-caption font-medium text-negative">{text.belowZero}</span>;
}

function TableRow({ line, locale, text }: { line: Line; locale: string; text: CalendarLinesTableText }) {
  const { entry, view, balance } = line;

  return (
    <tr
      className={`${view.isPlanned ? PLANNED_ROW_CLASS : REAL_ROW_CLASS} ${view.isCancelled ? "text-text-muted" : ""}`}
    >
      <td>{formatWeekdayDate(entry.date, locale)}</td>
      <th scope="row" className="min-w-40 whitespace-normal! py-2">
        <span className={view.isCancelled ? "line-through" : ""}>{entry.label}</span>
        <Notes notes={view.notes} />
      </th>
      <td className="whitespace-normal!">{view.account}</td>
      <td className="whitespace-normal!">{view.kind}</td>
      <td>
        <StatusPill status={view.status} />
      </td>
      <td className="text-right tabular-nums">{view.amount}</td>
      <td className="text-right tabular-nums">
        {balance === null ? null : (
          <>
            {balance.amount}
            {balance.isBelowZero ? <BelowZero text={text} /> : null}
          </>
        )}
      </td>
      <td>
        <ChangeOccurrence entry={entry} locale={locale} text={text} />
      </td>
    </tr>
  );
}

/** The column headings, shared with the loading skeleton so that they cannot drift apart. */
export function CalendarLinesHead({ columns }: { columns: CalendarLinesTableText["columns"] }) {
  return (
    <thead>
      <tr>
        <th scope="col" className="align-bottom">{columns.date}</th>
        <th scope="col" className="align-bottom">{columns.description}</th>
        <th scope="col" className="align-bottom">{columns.account}</th>
        <th scope="col" className="align-bottom">{columns.kind}</th>
        <th scope="col" className="align-bottom">{columns.status}</th>
        <th scope="col" className="align-bottom text-right">{columns.amount}</th>
        <th scope="col" className="align-bottom text-right">{columns.balance}</th>
        <th scope="col" className="align-bottom">{columns.actions}</th>
      </tr>
    </thead>
  );
}

function LinesTable({ lines, locale, text }: { lines: Line[]; locale: string; text: CalendarLinesTableText }) {
  return (
    <div className={TABLE_CLASS}>
      <DataTable caption={text.caption}>
        <colgroup>
          <col className="w-24" />
          <col />
          <col className="w-32" />
          <col className="w-18" />
          <col className="w-26" />
          <col className="w-26" />
          <col className="w-36" />
          <col className="w-24" />
        </colgroup>
        <CalendarLinesHead columns={text.columns} />
        <tbody>
          {lines.map((line) => (
            <TableRow key={line.entry.id} line={line} locale={locale} text={text} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function ListEntry({ line, locale, text }: { line: Line; locale: string; text: CalendarLinesTableText }) {
  const { entry, view, balance } = line;
  const textClass = view.isPlanned || view.isCancelled ? "text-text-muted" : "text-text";

  return (
    <li className={`border-t py-3 ${view.isPlanned ? PLANNED_ITEM_CLASS : "border-divider"} ${textClass}`}>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="w-18 flex-none text-caption text-text-muted">
          {formatWeekdayDate(entry.date, locale)}
        </span>
        <span className={`min-w-0 font-medium ${view.isCancelled ? "line-through" : ""}`}>{entry.label}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-caption font-medium">{view.kind}</span>
        <StatusPill status={view.status} />
        <span className="ml-auto tabular-nums">{view.amount}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2">
        <p className="text-caption text-text-muted">{view.account}</p>
        <ChangeOccurrence entry={entry} locale={locale} text={text} />
      </div>
      <Notes notes={view.notes} />
      {balance === null ? null : (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-caption text-text-muted">
          <span>{text.columns.balance}</span>
          <span className="tabular-nums text-text">{balance.amount}</span>
          {balance.isBelowZero ? <BelowZero text={text} /> : null}
        </p>
      )}
    </li>
  );
}

function LinesList({ lines, locale, text }: { lines: Line[]; locale: string; text: CalendarLinesTableText }) {
  return (
    <div className={`rounded-card bg-surface p-4 ${LIST_CLASS}`}>
      <h2 className="pb-3 font-medium">{text.caption}</h2>
      <ul>
        {lines.map((line) => (
          <ListEntry key={line.entry.id} line={line} locale={locale} text={text} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The entries of a month, day by day, with the balance at the end of each day (DESIGN section 18).
 * A table for a wide column, a list for a narrow one: both are in the page and a container query
 * shows one.
 */
export function CalendarLinesTable(props: CalendarLinesTableProps) {
  const { month, locale, text } = props;
  const lines = linesOf(props);

  return (
    <div className="@container flex flex-col gap-3">
      {month.firstDayBelowZero === null ? null : (
        <p className="font-medium text-negative">
          {text.belowZeroFrom(formatCalendarDate(month.firstDayBelowZero, locale))}
        </p>
      )}
      {month.unconvertedCurrencies.length === 0 ? null : (
        <p className="text-caption text-text-muted">{text.unconverted(month.unconvertedCurrencies.join(", "))}</p>
      )}
      {lines.length === 0 ? (
        <EmptyState>{text.empty}</EmptyState>
      ) : (
        <>
          <LinesTable lines={lines} locale={locale} text={text} />
          <LinesList lines={lines} locale={locale} text={text} />
        </>
      )}
    </div>
  );
}
