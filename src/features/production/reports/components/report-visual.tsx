import { cn } from "cn";
import { ChartPie, Info } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";

import { EmptyState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import {
  reportMeasureInfo,
  type ReportMeasure,
  type ReportResult
} from "@/contracts/production-reports";

import type { DimensionKey } from "../dimensions";
import { buildChartModel, canPie } from "../pivot";
import type { ReportView } from "../model";
import { PivotTable } from "./pivot-table";

const ReportChart = lazy(() =>
  import("./report-chart").then((module) => ({ default: module.ReportChart }))
);

export const ChartSkeleton = ({ className }: { className?: string }) => (
  <div className={cn("flex h-72 items-end gap-2 px-2 pb-2", className)} aria-hidden="true">
    {[40, 65, 50, 80, 35, 70, 55, 90, 45, 60].map((height, index) => (
      <Skeleton
        key={index}
        className="flex-1 rounded-t-md rounded-b-none"
        style={{ height: `${height}%` }}
      />
    ))}
  </div>
);

/**
 * Renders a report result in the chosen view: pivot table, or a chart of one measure (lazy Recharts).
 * Charts note what the caps left out (8 series / 40 bars / 8 slices).
 */
export const ReportVisual = ({
  result,
  rows,
  columns,
  measures,
  view,
  chartMeasure,
  sort,
  onSort,
  multiValue,
  compact = false
}: {
  result: Pick<ReportResult, "rows" | "totals"> & { columns?: ReportResult["columns"] };
  rows: readonly DimensionKey[];
  columns: readonly DimensionKey[];
  measures: readonly ReportMeasure[];
  view: ReportView;
  /** Measure drawn by charts (defaults to the first). */
  chartMeasure?: ReportMeasure | null | undefined;
  sort?: { key: DimensionKey | ReportMeasure; direction: "asc" | "desc" } | undefined;
  onSort?: ((key: DimensionKey | ReportMeasure) => void) | undefined;
  /** MULTISELECT custom-field dimensions (sub-totals across their options are not summed). */
  multiValue?: ReadonlySet<string> | undefined;
  /** Dashboard cards: shorter table / chart. */
  compact?: boolean;
}) => {
  const measure = chartMeasure && measures.includes(chartMeasure) ? chartMeasure : measures[0];
  const kind = view === "TABLE" ? null : view;
  const model = useMemo(
    () => (kind && measure ? buildChartModel(result, rows, columns, measure, kind) : null),
    [result, rows, columns, measure, kind]
  );

  if (!kind || !measure) {
    return (
      <PivotTable
        result={result}
        rows={rows}
        columns={columns}
        measures={measures}
        multiValue={multiValue}
        sort={sort}
        onSort={onSort}
        maxHeightClass={compact ? "max-h-80" : "max-h-[70vh]"}
      />
    );
  }

  if (kind === "PIE" && !canPie(measure)) {
    return (
      <EmptyState
        size="sm"
        icon={ChartPie}
        title="Biểu đồ tròn không hợp với chỉ số này"
        description={`"${reportMeasureInfo[measure].label}" là tỉ lệ hoặc trung bình nên không chia thành phần trăm được. Hãy chọn biểu đồ cột hoặc một chỉ số cộng dồn (điểm, số tấm, số task).`}
      />
    );
  }

  if (!model || model.data.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={ChartPie}
        title="Không có gì để vẽ"
        description={
          kind === "PIE"
            ? "Biểu đồ tròn chỉ vẽ các nhóm có giá trị lớn hơn 0."
            : "Kết quả không có nhóm nào."
        }
      />
    );
  }

  const notes = [
    model.hiddenCategories > 0 && kind !== "PIE"
      ? `Đang vẽ ${model.data.length} nhóm đầu, còn ${model.hiddenCategories} nhóm xem ở dạng bảng.`
      : null,
    model.hiddenSeries > 0
      ? model.series.some((series) => series.other)
        ? `${model.hiddenSeries + 1} giá trị cột nhỏ nhất được gộp vào "Khác".`
        : `Chỉ vẽ ${model.series.length} giá trị cột lớn nhất; ${model.hiddenSeries} giá trị còn lại xem ở dạng bảng.`
      : null,
    kind === "PIE" && model.hiddenCategories > 0
      ? `${model.hiddenCategories} nhóm nhỏ nhất được gộp vào "Khác".`
      : null
  ].filter((note): note is string => note !== null);

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", compact ? "p-3" : "p-4")}>
      <Suspense fallback={<ChartSkeleton />}>
        <ReportChart
          model={model}
          kind={kind}
          format={reportMeasureInfo[measure].format}
          measureLabel={reportMeasureInfo[measure].label}
          {...(compact && kind !== "BAR" ? { height: 220 } : {})}
        />
      </Suspense>
      {notes.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs text-foreground-muted">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>{notes.join(" ")}</span>
        </p>
      ) : null}
    </div>
  );
};
