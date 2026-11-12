import { kindLabel, type TrajectoryKindText, type TrajectoryMonth, type TrajectorySeries } from "./trajectory-chart";
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
 * table"). It shows exactly the months the chart draws.
 */
export function TrajectoryTable({ months, todayIndex, series, text }: TrajectoryTableProps) {
  return (
    <table className="trajectory-table">
      <caption>{text.caption}</caption>
      <thead>
        <tr>
          <th scope="col">{text.month}</th>
          {series.map((entry) => (
            <th key={entry.id} scope="col" className="r">
              {entry.label}
            </th>
          ))}
          <th scope="col">{text.kind}</th>
        </tr>
      </thead>
      <tbody>
        {months.map((month, index) => (
          <tr key={month.key}>
            <th scope="row">
              <time dateTime={month.key}>{month.label}</time>
            </th>
            {series.map((entry) => (
              <td key={entry.id} className="r">
                {entry.valueLabels[index]}
              </td>
            ))}
            <td>{kindLabel(monthKind(index, todayIndex), text)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
