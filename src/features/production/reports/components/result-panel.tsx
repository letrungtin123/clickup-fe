import { cn } from "cn";
import {
  ChartColumnBig,
  ChartLine,
  ChartPie,
  Info,
  RefreshCw,
  Sheet as SheetIcon,
  TableProperties,
  TriangleAlert
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, type ReactNode } from "react";

import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  reportMeasureInfo,
  type ReportConfig,
  type ReportMeasure,
  type ReportResult
} from "@/contracts/production-reports";
import { isApiError } from "@/lib/api/errors";

import { formatInteger } from "../../format";
import {
  dimensionLabel,
  emptyCatalog,
  multiValueDimensions,
  type DimensionKey,
  type FieldCatalog
} from "../dimensions";
import { reportErrorMessage } from "../errors";
import { formatRange } from "../format";
import type { ReportView, Zones } from "../model";
import { ReportVisual } from "./report-visual";

const viewOptions: { value: ReportView; label: string; icon: typeof ChartLine }[] = [
  { value: "TABLE", label: "Bảng", icon: TableProperties },
  { value: "BAR", label: "Cột", icon: ChartColumnBig },
  { value: "LINE", label: "Đường", icon: ChartLine },
  { value: "PIE", label: "Tròn", icon: ChartPie }
];

export const ViewSwitch = ({
  value,
  onChange
}: {
  value: ReportView;
  onChange: (view: ReportView) => void;
}) => (
  <ToggleGroup
    value={[value]}
    onValueChange={(next: string[]) => {
      const picked = next[0] as ReportView | undefined;
      if (picked) onChange(picked);
    }}
    variant="outline"
    size="sm"
    spacing={0}
    aria-label="Kiểu hiển thị"
  >
    {viewOptions.map((option) => (
      <ToggleGroupItem
        key={option.value}
        value={option.value}
        aria-label={option.label}
        className="gap-1 px-2.5 pointer-coarse:min-h-10 max-sm:min-w-10"
      >
        <option.icon aria-hidden="true" />
        <span className="max-sm:sr-only">{option.label}</span>
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);

const ResultSkeleton = () => (
  <div className="flex flex-col gap-2 p-4" aria-hidden="true">
    <Skeleton className="h-8" />
    {Array.from({ length: 7 }, (_, index) => (
      <Skeleton key={index} className="h-7" style={{ opacity: 1 - index * 0.1 }} />
    ))}
  </div>
);

/**
 * The result card of the report builder: resolved range, row count, view switch, chart measure,
 * the "truncated" warning, and the table / chart (or the state explaining why there is none).
 */
export const ResultPanel = ({
  config,
  zones,
  view,
  onViewChange,
  chartMeasure,
  onChartMeasureChange,
  result,
  isPending,
  isFetching,
  error,
  onRetry,
  problem,
  onSort,
  catalog = emptyCatalog,
  actions
}: {
  config: ReportConfig;
  zones: Zones;
  view: ReportView;
  onViewChange: (view: ReportView) => void;
  chartMeasure: ReportMeasure | null;
  onChartMeasureChange: (measure: ReportMeasure) => void;
  result: ReportResult | undefined;
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
  /** Why the config cannot run (shown instead of the result). */
  problem: string | null;
  onSort: (key: DimensionKey | ReportMeasure) => void;
  /** Custom-field definitions (multi-value fields and their labels). */
  catalog?: FieldCatalog;
  actions?: ReactNode;
}) => {
  const multiValue = useMemo(
    () => multiValueDimensions(config.dimensions, catalog),
    [config.dimensions, catalog]
  );
  const measures = zones.values;
  const measure =
    chartMeasure && measures.includes(chartMeasure) ? chartMeasure : (measures[0] ?? null);
  const measureItems = measures.map((item) => ({
    value: item,
    label: reportMeasureInfo[item].label
  }));
  // A result for an older config stays on screen while the new one loads (placeholder data).
  const stale = result !== undefined && isFetching;
  const rowCount = result?.rows.length ?? 0;

  return (
    <section
      aria-labelledby="report-result-title"
      className="min-w-0 rounded-xl border bg-surface shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        {/* min-w-48: on phones the controls wrap below instead of squeezing the range into 4 lines. */}
        <div className="flex min-w-48 flex-1 flex-col gap-0.5">
          <h2 id="report-result-title" className="flex items-center gap-2 text-sm font-semibold">
            Kết quả
            {isFetching ? <Spinner className="size-3.5 text-foreground-muted" /> : null}
          </h2>
          <p className="text-xs text-foreground-muted tabular-nums" aria-live="polite">
            {result
              ? `${formatRange(result.from, result.to)} · ${formatInteger(rowCount)} dòng${result.config.limit ? ` (top ${result.config.limit})` : ""}`
              : problem
                ? "Chưa chạy"
                : "Đang tính…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view !== "TABLE" && measures.length > 1 && measure ? (
            <Select
              items={measureItems}
              value={measure}
              onValueChange={(next: ReportMeasure | null) => next && onChartMeasureChange(next)}
            >
              <SelectTrigger size="sm" className="max-w-48" aria-label="Chỉ số trên biểu đồ">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {measureItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <ViewSwitch value={view} onChange={onViewChange} />
          {actions}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {result?.truncated ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <p
              role="status"
              className="flex items-start gap-2 border-b bg-warning-soft px-4 py-2.5 text-xs text-foreground"
            >
              <TriangleAlert className="mt-px size-4 shrink-0 text-warning" aria-hidden="true" />
              <span>
                Kết quả có hơn {formatInteger(result.rowLimit)} nhóm nên chỉ hiện{" "}
                {formatInteger(result.rowLimit)} nhóm đầu; tổng cộng vẫn tính trên toàn bộ. Hãy thu
                hẹp khoảng ngày, bớt chiều hoặc thêm bộ lọc.
              </span>
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {multiValue.size > 0 && !problem ? (
        <p className="flex items-start gap-2 border-b px-4 py-2 text-xs text-foreground-muted">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {[...multiValue]
              .map((dimension) => `"${dimensionLabel(dimension, catalog)}"`)
              .join(", ")}{" "}
            chọn được nhiều giá trị: một bản ghi được đếm cho mỗi lựa chọn, dòng Tổng đếm một lần.
          </span>
        </p>
      ) : null}
      <div className={cn("min-w-0 transition-opacity duration-200", stale && "opacity-60")}>
        {problem ? (
          <EmptyState icon={SheetIcon} title="Báo cáo chưa sẵn sàng" description={problem} />
        ) : error && !result ? (
          <div role="alert">
            <EmptyState
              icon={TriangleAlert}
              title="Không chạy được báo cáo"
              description={reportErrorMessage(error, "Không chạy được báo cáo. Thử lại sau.")}
              action={
                isApiError(error) && error.status >= 400 && error.status < 500 ? undefined : (
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    <RefreshCw />
                    Thử lại
                  </Button>
                )
              }
            />
          </div>
        ) : isPending || !result ? (
          <ResultSkeleton />
        ) : rowCount === 0 ? (
          <EmptyState
            icon={SheetIcon}
            title="Không có dữ liệu trong khoảng này"
            description="Thử khoảng ngày khác, bỏ bớt bộ lọc hoặc đổi cách tính ngày của task."
          />
        ) : (
          <ReportVisual
            result={result}
            rows={zones.rows}
            columns={zones.columns}
            measures={measures}
            multiValue={multiValue}
            view={view}
            chartMeasure={measure}
            sort={config.sort}
            onSort={onSort}
          />
        )}
        {error && result ? (
          <p role="alert" className="border-t px-4 py-2 text-xs text-danger">
            Không chạy được cấu hình mới — đang hiện kết quả trước đó.
          </p>
        ) : null}
      </div>
    </section>
  );
};
