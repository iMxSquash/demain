import { useTranslations } from "next-intl";

import {
  SkeletonBlock,
  SkeletonLine,
  SkeletonRegion,
  SkeletonTableBody,
} from "../components/skeleton";

// The classes of the elements of `RealChart` and `TrajectoryTable` that this stands for, copied
// so that the section keeps its height when the chart arrives: the 280 px plot of the trajectory
// chart and the rows of its data table (`py-2` and a hairline below).
const SECTION_CLASS = "mt-8 flex flex-col gap-4";
const CHART_CLASS = "flex flex-col gap-3";
const PLOT_CLASS = "h-[280px] rounded-control";
const TABLE_CLASS = "w-full border-collapse text-left";
const HEADER_ROW_CLASS = "border-b border-border-control";
const ROW_CLASS = "border-b border-divider";
const CELL_CLASS = "py-2 pr-4";
// The kinds drawn by `RealChart`, in its order.
const SERIES_KINDS = ["checking", "savings"] as const;
// The intro is one line on a desktop width (more on a phone, where the skeleton is one line short),
// and the chart hint is real text, so it wraps as it does in the chart. The table has one row per
// month of the history, which is not known before the data is read.
const TABLE_ROWS = 6;

/**
 * The fallback of the `Suspense` boundary around `RealChart`. The headings, the hint and the
 * column headings do not depend on the data and are drawn as they are; the intro (it names the
 * reference currency), the chart and the rows are blocks.
 */
export function RealChartLoading() {
  const t = useTranslations("realChart");
  const kinds = useTranslations("accounts.kinds");
  const tLoading = useTranslations("loading");

  return (
    <SkeletonRegion label={tLoading("chart")}>
      <div className={SECTION_CLASS}>
        <h2 className="text-title font-medium">{t("heading")}</h2>
        <SkeletonLine width="3/4" />
        <div className={CHART_CLASS}>
          <SkeletonBlock className={PLOT_CLASS} />
          <SkeletonLine size="caption" width="1/3" />
          <p className="text-caption text-text-muted">{t("hint")}</p>
        </div>
        <h3 className="text-title font-medium">{t("tableHeading")}</h3>
        <table className={TABLE_CLASS}>
          <thead>
            <tr className={HEADER_ROW_CLASS}>
              <th scope="col" className="py-2 pr-4">
                {t("columns.month")}
              </th>
              {SERIES_KINDS.map((kind) => (
                <th key={kind} scope="col" className="py-2 pl-4 text-right">
                  {kinds(kind)}
                </th>
              ))}
              <th scope="col" className="py-2 pl-4">
                {t("columns.kind")}
              </th>
            </tr>
          </thead>
          <SkeletonTableBody
            columns={["start", "end", "end", "start"]}
            rows={TABLE_ROWS}
            rowClassName={ROW_CLASS}
            cellClassName={CELL_CLASS}
          />
        </table>
      </div>
    </SkeletonRegion>
  );
}
