import { useTranslations } from "next-intl";

import {
  SkeletonBlock,
  SkeletonLine,
  SkeletonRegion,
  SkeletonRows,
} from "../components/skeleton";

// The classes of the elements of `RealChart` that this stands for, copied so that the section
// keeps its height when the chart arrives: the 280 px plot of the trajectory chart and the rows
// of its data table (`py-2` and a hairline below).
const SECTION_CLASS = "mt-8 flex flex-col gap-4";
const CHART_CLASS = "flex flex-col gap-3";
const PLOT_CLASS = "h-[280px] rounded-control";
const HEADER_ROW_CLASS = "border-b border-border-control py-2";
const ROW_CLASS = "border-b border-divider py-2";
const TABLE_COLUMNS = 4;
// The intro and the hint of the chart wrap on two lines on a desktop width; their real length
// depends on the width and on the language, so a phone can differ by a line. The table has one
// row per month of the history, which is not known before the data is read.
const TABLE_ROWS = 6;

/**
 * The shape of `RealChart`: its heading, intro, plot, legend, table heading and table. Shapes
 * only, no figure or label. The caller puts it in a loading region.
 */
export function RealChartSkeleton() {
  return (
    <div className={SECTION_CLASS}>
      <SkeletonLine size="title" width="1/4" />
      <div>
        <SkeletonLine />
        <SkeletonLine width="1/2" />
      </div>
      <div className={CHART_CLASS}>
        <SkeletonBlock className={PLOT_CLASS} />
        <SkeletonLine size="caption" width="1/3" />
        <div>
          <SkeletonLine size="caption" />
          <SkeletonLine size="caption" width="1/2" />
        </div>
      </div>
      <SkeletonLine size="title" width="1/4" />
      <div>
        <SkeletonRows columns={TABLE_COLUMNS} rows={1} rowClassName={HEADER_ROW_CLASS} />
        <SkeletonRows columns={TABLE_COLUMNS} rows={TABLE_ROWS} rowClassName={ROW_CLASS} />
      </div>
    </div>
  );
}

/** The fallback of the `Suspense` boundary around `RealChart`: its shape, announced in words. */
export function RealChartLoading() {
  const t = useTranslations("loading");

  return (
    <SkeletonRegion label={t("chart")}>
      <RealChartSkeleton />
    </SkeletonRegion>
  );
}
