import { Bookmark, BookmarkCheck, ChevronLeft, FilePlus2, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import type {
  ReportConfig,
  ReportDimension,
  ReportMeasure,
  SavedReport
} from "@/contracts/production-reports";
import { reportDimensionInfo, reportMeasureInfo } from "@/contracts/production-reports";
import { useDebouncedValue } from "@/features/command/search-api";
import { RequireProductionRole } from "@/features/production/components/production-gate";
import { todayIn } from "@/features/production/format";
import { useProductionAccess, useProductionMe } from "@/features/production/hooks";
import { ExcelExportButton } from "@/features/production/reports/components/export-button";
import { FieldBuilder } from "@/features/production/reports/components/field-builder";
import {
  FilterBar,
  RangeControl,
  SortControl,
  TaskDateControl
} from "@/features/production/reports/components/report-settings";
import { ResultPanel } from "@/features/production/reports/components/result-panel";
import {
  SaveReportDialog,
  SavedReportsSheet
} from "@/features/production/reports/components/saved-reports";
import { useFilterOptions } from "@/features/production/reports/filter-options";
import {
  useLiveReports,
  useReportResult,
  useSavedReports
} from "@/features/production/reports/hooks";
import {
  configProblem,
  configSignature,
  decodeConfig,
  defaultReportConfig,
  encodeConfig,
  sanitizeForRole,
  viewOfConfig,
  withSort,
  withView,
  withZones,
  zonesFromConfig
} from "@/features/production/reports/model";
import { PageBody } from "@/features/production/scores/components/kit";
import { touchTargets } from "@/features/production/ui";
import { useBreakpoint } from "@/hooks/use-breakpoint";

/**
 * /production/reports — report builder (SPEC Phase 5 §4) for LEADER and ADMIN. The config lives in the
 * URL (`?config=` base64url, `?saved=<id>` for a saved report, `?title=` from a dashboard card), so a
 * refresh or a shared link reopens the same report. Money measures are ADMIN only (API 403 otherwise).
 */
export const ProductionReportsRoute = () => (
  <RequireProductionRole roles={["LEADER"]}>
    <ReportsPage />
  </RequireProductionRole>
);

const ReportsPage = () => {
  const [params] = useSearchParams();
  const location = useLocation();
  // A bare /production/reports (sidebar link, "Báo cáo mới") starts a fresh builder.
  const fresh = !params.has("config") && !params.has("saved");
  return <ReportBuilder key={fresh ? `fresh-${location.key}` : "builder"} />;
};

const dimensionOrMeasureIsDimension = (
  key: ReportDimension | ReportMeasure
): key is ReportDimension => key in reportDimensionInfo;

const ReportBuilder = () => {
  const access = useProductionAccess();
  const me = useProductionMe();
  const breakpoint = useBreakpoint();
  const isAdmin = access.isAdmin;
  const today = todayIn(me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh");
  const [params, setParams] = useSearchParams();
  const savedId = params.get("saved");
  const title = params.get("title");
  useLiveReports();

  const [draft, setDraft] = useState<ReportConfig | null>(() => decodeConfig(params.get("config")));
  const [fallback] = useState(defaultReportConfig);
  const savedList = useSavedReports(savedId !== null);
  const savedReport = savedId
    ? (savedList.data?.items.find((item) => item.id === savedId) ?? null)
    : null;
  const waitingForSaved = savedId !== null && draft === null && savedList.isPending;
  const base = draft ?? savedReport?.config ?? (waitingForSaved ? null : fallback);
  const sanitized = base ? sanitizeForRole(base, isAdmin) : null;
  const config = sanitized?.config ?? null;
  const zones = config ? zonesFromConfig(config) : null;
  const view = config ? viewOfConfig(config) : "TABLE";
  const [chartMeasure, setChartMeasure] = useState<ReportMeasure | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const filterOptions = useFilterOptions();

  // Run the config a moment after the last edit (toggling several filters = one request).
  const signature = config ? configSignature(config) : "";
  const debounced = useDebouncedValue(signature, 300);
  const runConfig = useMemo(
    () => (debounced ? (JSON.parse(debounced) as ReportConfig) : null),
    [debounced]
  );
  const problem = config ? configProblem(config) : null;
  const runnable = runConfig && !configProblem(runConfig) && !problem ? runConfig : null;
  const result = useReportResult(runnable);

  const update = (next: ReportConfig) => {
    setDraft(next);
    setParams(
      (previous) => {
        const nextParams = new URLSearchParams(previous);
        nextParams.set("config", encodeConfig(next));
        return nextParams;
      },
      { replace: true }
    );
  };

  const openSaved = (report: SavedReport) => {
    setDraft(null);
    setChartMeasure(null);
    setParams((previous) => {
      const nextParams = new URLSearchParams(previous);
      nextParams.delete("config");
      nextParams.delete("title");
      nextParams.set("saved", report.id);
      return nextParams;
    });
  };

  const onSaved = (report: SavedReport) => {
    setDraft(null);
    setParams((previous) => {
      const nextParams = new URLSearchParams(previous);
      nextParams.delete("config");
      nextParams.delete("title");
      nextParams.set("saved", report.id);
      return nextParams;
    });
  };

  const onDeleted = (id: string) => {
    if (id !== savedId || !config) return;
    // Keep the open config as an unsaved draft.
    setDraft(config);
    setParams(
      (previous) => {
        const nextParams = new URLSearchParams(previous);
        nextParams.delete("saved");
        nextParams.set("config", encodeConfig(config));
        return nextParams;
      },
      { replace: true }
    );
  };

  const onSort = (key: ReportDimension | ReportMeasure) => {
    if (!config) return;
    const current = config.sort;
    const firstDirection: "asc" | "desc" = dimensionOrMeasureIsDimension(key) ? "asc" : "desc";
    const next =
      current?.key !== key
        ? { key, direction: firstDirection }
        : current.direction === firstDirection
          ? { key, direction: firstDirection === "asc" ? ("desc" as const) : ("asc" as const) }
          : null;
    update(withSort(config, next));
  };

  const dirty =
    savedReport !== null && config !== null && configSignature(savedReport.config) !== signature;
  const heading = savedReport?.name ?? title ?? "Báo cáo";
  const savedMissing =
    savedId !== null && savedList.isSuccess && savedReport === null && draft === null;
  const exportName = savedReport?.name ?? title ?? "Báo cáo sản xuất";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow={
          <Link
            to="/production"
            className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-3 max-sm:py-3 max-sm:pr-3"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Sản xuất
          </Link>
        }
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{heading}</span>
            {dirty ? (
              <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-foreground">
                Chưa lưu
              </span>
            ) : null}
          </span>
        }
        description={
          breakpoint === "mobile"
            ? undefined
            : savedReport?.description ||
              "Kéo chiều và chỉ số vào Hàng, Cột, Giá trị; lọc theo thời gian, dự án, nhân viên… rồi xem dạng bảng hoặc biểu đồ."
        }
        actions={
          <div className={`flex items-center gap-1.5 ${touchTargets}`}>
            <Button
              variant="ghost"
              render={<Link to="/production/reports" />}
              nativeButton={false}
              aria-label="Báo cáo mới"
            >
              <FilePlus2 />
              <span className="max-lg:sr-only">Mới</span>
            </Button>
            <Button variant="outline" onClick={() => setListOpen(true)}>
              <BookmarkCheck />
              <span className="max-sm:sr-only">Đã lưu</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setSaveOpen(true)}
              disabled={!config || problem !== null}
            >
              <Bookmark />
              <span className="max-sm:sr-only">Lưu</span>
            </Button>
            <ExcelExportButton
              request={{
                method: "POST",
                path: "/production/reports/export",
                body: { config: config ?? fallback, name: exportName.slice(0, 120) }
              }}
              fallbackName={exportName}
              disabled={!config || problem !== null}
            />
          </div>
        }
      />
      <PageBody className="max-w-7xl">
        {sanitized && sanitized.removed.length > 0 ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            Đã bỏ chỉ số{" "}
            {sanitized.removed
              .map((measure) => `"${reportMeasureInfo[measure].label}"`)
              .join(", ")}{" "}
            vì chỉ Quản trị được xem tiền.
          </p>
        ) : null}
        {savedMissing ? (
          <p
            role="status"
            className="rounded-lg border bg-muted px-3 py-2 text-sm text-foreground-muted"
          >
            Không tìm thấy báo cáo đã lưu (có thể đã bị xoá hoặc thôi chia sẻ). Đang hiện báo cáo
            mặc định.
          </p>
        ) : null}
        {config && zones ? (
          <>
            <FieldBuilder
              zones={zones}
              onChange={(next) => update(withZones(config, next))}
              isAdmin={isAdmin}
            >
              <section
                aria-label="Thời gian và bộ lọc"
                className="flex min-w-0 flex-col gap-4 rounded-xl border bg-surface p-4 shadow-xs"
              >
                <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-3">
                  <RangeControl config={config} onChange={update} today={today} />
                  <TaskDateControl config={config} onChange={update} />
                </div>
                <FilterBar
                  config={config}
                  onChange={update}
                  options={filterOptions.options}
                  optionsPending={filterOptions.isPending}
                />
                <SortControl config={config} onChange={update} />
              </section>
            </FieldBuilder>
            <ResultPanel
              config={config}
              zones={zones}
              view={view}
              onViewChange={(next) => update(withView(config, next))}
              chartMeasure={chartMeasure}
              onChartMeasureChange={setChartMeasure}
              result={result.data}
              isPending={result.isPending && runnable !== null}
              isFetching={result.isFetching}
              error={result.isError ? result.error : null}
              onRetry={() => void result.refetch()}
              problem={problem}
              onSort={onSort}
            />
          </>
        ) : (
          <div className="flex flex-col gap-4" aria-busy="true">
            <div className="h-64 animate-pulse rounded-xl border bg-muted/40" />
            <div className="h-80 animate-pulse rounded-xl border bg-muted/40" />
          </div>
        )}
      </PageBody>
      {config ? (
        <SaveReportDialog
          key={saveOpen ? `open-${savedReport?.id ?? "new"}` : "closed"}
          open={saveOpen}
          onOpenChange={setSaveOpen}
          config={config}
          current={savedReport}
          suggestedName={title ?? ""}
          isAdmin={isAdmin}
          onSaved={onSaved}
        />
      ) : null}
      <SavedReportsSheet
        open={listOpen}
        onOpenChange={setListOpen}
        activeId={savedId}
        onOpen={openSaved}
        onDeleted={onDeleted}
      />
    </div>
  );
};
