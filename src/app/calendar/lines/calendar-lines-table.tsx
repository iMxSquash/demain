import { DataTable, EmptyState, Pill } from "../../../components/data-display";
import { formatAmount } from "../../../domain/money";
import { formatCalendarDate, formatWeekdayDate } from "../../../i18n/dates";
import type { CalendarDay, CalendarEntry, CalendarMonth } from "../../../ledger/calendar";

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

interface Line {
  entry: CalendarEntry;
  /** The day, on its last line only: the end-of-day balance is shown there. */
  day: CalendarDay | null;
}

// Only the days that have entries have lines.
function linesOf(days: readonly CalendarDay[]): Line[] {
  return days.flatMap((day) =>
    day.entries.map((entry, index) => ({
      entry,
      day: index === day.entries.length - 1 ? day : null,
    })),
  );
}

interface LineView {
  description: string;
  isCancelled: boolean;
  isPlanned: boolean;
  account: string;
  kind: string;
  status: string | null;
  isOverdue: boolean;
  amount: string;
  notes: string[];
}

function lineViewOf(
  entry: CalendarEntry,
  names: ReadonlyMap<number, string>,
  { locale, text }: Pick<CalendarLinesTableProps, "locale" | "text">,
): LineView {
  const nameOf = (id: number) => names.get(id) ?? String(id);
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
    description: entry.label,
    isCancelled: entry.status === "cancelled",
    isPlanned: entry.kind === "planned",
    account:
      entry.destinationAccountId === null
        ? nameOf(entry.accountId)
        : text.transferTo(nameOf(entry.accountId), nameOf(entry.destinationAccountId)),
    kind: text.kinds[entry.kind],
    status: entry.status === null ? null : text.statuses[entry.status],
    isOverdue: entry.status === "overdue",
    amount: formatAmount(entry.amount, entry.currency, locale),
    notes,
  };
}

function StatusPill({ view }: { view: LineView }) {
  if (view.status === null) return null;
  return <Pill tone={view.isOverdue ? "warning" : "neutral"}>{view.status}</Pill>;
}

function Notes({ notes }: { notes: readonly string[] }) {
  return notes.map((note) => (
    <span key={note} className={ENTRY_NOTE_CLASS}>
      {note}
    </span>
  ));
}

function BelowZero({ text }: { text: CalendarLinesTableText }) {
  return <span className="block text-caption font-medium text-negative">{text.belowZero}</span>;
}

function TableRow({ line, view, props }: { line: Line; view: LineView; props: CalendarLinesTableProps }) {
  const { entry, day } = line;
  const { locale, text } = props;
  const mutedClass = view.isCancelled ? "text-text-muted" : "";

  return (
    <tr className={`${view.isPlanned ? PLANNED_ROW_CLASS : REAL_ROW_CLASS} ${mutedClass}`}>
      <td>{formatWeekdayDate(entry.date, locale)}</td>
      <th scope="row" className="min-w-40 whitespace-normal! py-2">
        <span className={view.isCancelled ? "line-through" : ""}>{view.description}</span>
        <Notes notes={view.notes} />
      </th>
      <td className="whitespace-normal!">{view.account}</td>
      <td className="whitespace-normal!">{view.kind}</td>
      <td>
        <StatusPill view={view} />
      </td>
      <td className="text-right tabular-nums">{view.amount}</td>
      <td className="text-right tabular-nums">
        {day === null || day.balance === null ? null : (
          <>
            {formatAmount(day.balance, props.month.currency, locale)}
            {day.isBelowZero ? <BelowZero text={text} /> : null}
          </>
        )}
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
      </tr>
    </thead>
  );
}

function LinesTable({ lines, names, props }: { lines: Line[]; names: ReadonlyMap<number, string>; props: CalendarLinesTableProps }) {
  const { columns } = props.text;

  return (
    <div className={TABLE_CLASS}>
      <DataTable caption={props.text.caption}>
        <colgroup>
          <col className="w-24" />
          <col />
          <col className="w-32" />
          <col className="w-18" />
          <col className="w-26" />
          <col className="w-26" />
          <col className="w-36" />
        </colgroup>
        <CalendarLinesHead columns={columns} />
        <tbody>
          {lines.map((line) => (
            <TableRow key={line.entry.id} line={line} view={lineViewOf(line.entry, names, props)} props={props} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function ListEntry({ line, view, props }: { line: Line; view: LineView; props: CalendarLinesTableProps }) {
  const { entry, day } = line;
  const { locale, text } = props;
  const textClass = view.isPlanned || view.isCancelled ? "text-text-muted" : "text-text";

  return (
    <li className={`border-t py-3 ${view.isPlanned ? PLANNED_ITEM_CLASS : "border-divider"} ${textClass}`}>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="w-18 flex-none text-caption text-text-muted">
          {formatWeekdayDate(entry.date, locale)}
        </span>
        <span className={`min-w-0 font-medium ${view.isCancelled ? "line-through" : ""}`}>{view.description}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-caption font-medium">{view.kind}</span>
        <StatusPill view={view} />
        <span className="ml-auto tabular-nums">{view.amount}</span>
      </div>
      <p className="mt-1 text-caption text-text-muted">{view.account}</p>
      <Notes notes={view.notes} />
      {day === null || day.balance === null ? null : (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-caption text-text-muted">
          <span>{text.columns.balance}</span>
          <span className="tabular-nums text-text">{formatAmount(day.balance, props.month.currency, locale)}</span>
          {day.isBelowZero ? <BelowZero text={text} /> : null}
        </p>
      )}
    </li>
  );
}

function LinesList({ lines, names, props }: { lines: Line[]; names: ReadonlyMap<number, string>; props: CalendarLinesTableProps }) {
  return (
    <div className={`rounded-card bg-surface p-4 ${LIST_CLASS}`}>
      <h2 className="pb-3 font-medium">{props.text.caption}</h2>
      <ul>
        {lines.map((line) => (
          <ListEntry key={line.entry.id} line={line} view={lineViewOf(line.entry, names, props)} props={props} />
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
  const { month, accounts, locale, text } = props;
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const lines = linesOf(month.days);

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
          <LinesTable lines={lines} names={names} props={props} />
          <LinesList lines={lines} names={names} props={props} />
        </>
      )}
    </div>
  );
}
