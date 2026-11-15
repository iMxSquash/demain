import { kindLabel, type TrajectoryKindText, type TrajectoryMonth, type TrajectorySeries } from "./trajectory-types";
import { monthKind } from "./trajectory-geometry";

export interface TrajectoryTableText extends TrajectoryKindText {
  caption: string;
  month: string;
  kind: string;
}

export interface TrajectoryTableProps {
  months: TrajectoryMonth[];
  todayIndex: number;
  series: TrajectorySeries[];
  text: TrajectoryTableText;
}

/**
 * The data table every chart needs (DOMAIN, "Every chart has an equivalent data
 * table"). It shows exactly the months the chart draws. The caller wraps it in
 * a focusable scroll region, so a phone never scrolls the page sideways.
 */
export function TrajectoryTable({ months, todayIndex, series, text }: TrajectoryTableProps) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">{text.caption}</caption>
      <thead>
        <tr className="border-b border-border-control">
          <th scope="col" className="py-2 pr-4">{text.month}</th>
          {series.map((entry) => (
            <th key={entry.id} scope="col" className="py-2 pl-4 text-right">
              {entry.label}
            </th>
          ))}
          <th scope="col" className="py-2 pl-4">{text.kind}</th>
        </tr>
      </thead>
      <tbody>
        {months.map((month, index) => (
          <tr key={month.key} className="border-b border-divider">
            <th scope="row" className="py-2 pr-4 font-medium">
              <time dateTime={month.key}>{month.label}</time>
            </th>
            {series.map((entry) => (
              <td key={entry.id} className="py-2 pl-4 text-right tabular-nums">
                {entry.valueLabels[index]}
              </td>
            ))}
            <td className="py-2 pl-4">{kindLabel(monthKind(index, todayIndex), text)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
