import { cn } from "cn";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ShieldCheck, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/shared/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { anomalyKindLabels, anomalyKinds, type AnomalyKind } from "@/contracts/production-reports";
import { RequireProductionRole } from "@/features/production/components/production-gate";
import { formatDay } from "@/features/production/format";
import { useProductionAccess, useProductionMe } from "@/features/production/hooks";
import { anomalyDescriptions } from "@/features/production/reports/anomalies";
import { AnomalyRow } from "@/features/production/reports/components/anomalies";
import { useAnomalies, useLiveReports } from "@/features/production/reports/hooks";
import { PageBody } from "@/features/production/scores/components/kit";
import { touchTargets } from "@/features/production/ui";
import { useBreakpoint } from "@/hooks/use-breakpoint";

const windows = [7, 30, 90, 180] as const;
const isKind = (value: string | null): value is AnomalyKind =>
  anomalyKinds.includes(value as AnomalyKind);

/** Short tab labels (the contract labels are sentences). */
const tabLabels: Record<AnomalyKind, string> = {
  QTY_MISMATCH: "Lệch số lượng",
  QC_FAIL_REPEAT: "QC trả lại ≥ 2 lần",
  WORKER_FAIL_RATE: "Tỉ lệ lỗi cao",
  FAST_DONE: "Xong quá nhanh",
  MISSING_CREDIT_RULE: "Thiếu đơn giá"
};

/**
 * /production/anomalies — anomalies report (SPEC Phase 5 §5, PLAN §10). LEADER: tasks of the jobs they
 * lead; ADMIN: every job. Tabs per kind with unreviewed counts, rows link to the task / job, "Đã xem"
 * (optional note) hides a row until it changes again, with undo. Filters in the URL.
 */
export const ProductionAnomaliesRoute = () => (
  <RequireProductionRole roles={["LEADER"]}>
    <AnomaliesPage />
  </RequireProductionRole>
);

const AnomaliesPage = () => {
  const access = useProductionAccess();
  const me = useProductionMe();
  const breakpoint = useBreakpoint();
  const [params, setParams] = useSearchParams();
  const daysParam = Number(params.get("days"));
  const days = (windows as readonly number[]).includes(daysParam) ? daysParam : 30;
  const includeReviewed = params.get("reviewed") === "1";
  const kindParam = params.get("kind");
  const list = useAnomalies(days, includeReviewed);
  useLiveReports();
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const data = list.data;

  const kind: AnomalyKind = isKind(kindParam)
    ? kindParam
    : (anomalyKinds.find((item) => (data?.counts[item] ?? 0) > 0) ?? "QTY_MISMATCH");
  const items = useMemo(
    () => (data?.items ?? []).filter((item) => item.kind === kind),
    [data, kind]
  );
  const reviewedCount = items.filter((item) => item.reviewed).length;

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );

  const windowItems = windows.map((value) => ({
    value: String(value),
    label: `${value} ngày qua`
  }));

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
        title="Bất thường"
        description={
          breakpoint === "mobile"
            ? undefined
            : access.isAdmin
              ? "Những điểm cần kiểm tra trên mọi job. Bấm “Đã xem” để ẩn mục đã xử lý."
              : "Những điểm cần kiểm tra trên các job bạn phụ trách. Bấm “Đã xem” để ẩn mục đã xử lý."
        }
        actions={
          list.isFetching && !list.isPending ? (
            <Spinner className="size-4 text-foreground-muted" />
          ) : null
        }
      >
        <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", touchTargets)}>
          <Select
            items={windowItems}
            value={String(days)}
            onValueChange={(next: string | null) =>
              update({ days: !next || next === "30" ? null : next })
            }
          >
            <SelectTrigger size="sm" className="min-w-36" aria-label="Khoảng xem">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {windowItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground-muted max-sm:min-h-10">
            <Switch
              checked={includeReviewed}
              onCheckedChange={(checked) => update({ reviewed: checked ? "1" : null })}
              aria-label="Hiện cả mục đã xem"
            />
            Hiện cả mục đã xem
          </label>
          {data ? (
            <span className="text-xs text-foreground-subtle">
              Từ {formatDay(data.since.slice(0, 10))}
            </span>
          ) : null}
        </div>
      </PageHeader>
      <PageBody>
        <Tabs value={kind} onValueChange={(next) => update({ kind: next as string })}>
          <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            <TabsList
              className={cn(
                "h-auto! w-max min-w-full justify-start gap-1 p-1 md:min-w-0",
                touchTargets
              )}
            >
              {anomalyKinds.map((item) => {
                const count = data?.counts[item] ?? 0;
                return (
                  <TabsTrigger
                    key={item}
                    value={item}
                    className="h-9 flex-none gap-1.5 px-3 pointer-coarse:h-10"
                    title={anomalyKindLabels[item]}
                  >
                    {tabLabels[item]}
                    <span
                      className={cn(
                        "min-w-5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                        count > 0 ? "bg-danger-soft text-danger" : "bg-muted text-foreground-subtle"
                      )}
                      aria-label={`${count} mục chưa xem`}
                    >
                      {data ? count : "·"}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </Tabs>

        <section
          aria-labelledby="anomaly-kind-title"
          className="min-w-0 rounded-xl border bg-surface shadow-xs"
        >
          <header className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2 id="anomaly-kind-title" className="text-sm font-semibold">
                {anomalyKindLabels[kind]}
              </h2>
              <p className="text-xs text-foreground-muted">
                {anomalyDescriptions[kind](data?.threshold ?? 0.15)}
              </p>
            </div>
            {data ? (
              <span className="text-xs text-foreground-subtle tabular-nums">
                {items.length} mục
                {includeReviewed && reviewedCount > 0 ? ` · ${reviewedCount} đã xem` : ""}
              </span>
            ) : null}
          </header>
          {data?.truncated ? (
            <p className="flex items-start gap-2 border-b bg-warning-soft px-4 py-2 text-xs">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
              Có loại bất thường vượt 500 mục; chỉ hiện 500 mục mới nhất. Thu hẹp khoảng xem để thấy
              đủ.
            </p>
          ) : null}
          {list.isPending ? (
            <SkeletonRows rows={6} className="p-4" />
          ) : list.isError ? (
            <ErrorState
              error={list.error}
              onRetry={() => void list.refetch()}
              retrying={list.isFetching}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Không có bất thường"
              description={`Không có mục "${tabLabels[kind].toLowerCase()}" nào${includeReviewed ? "" : " chưa xem"} trong ${days} ngày qua.`}
            />
          ) : (
            // Keyed by kind: switching tabs replaces the list instead of animating 500 rows out.
            <ul key={kind} className="divide-y">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.li
                    key={`${item.kind}:${item.key}`}
                    layout="position"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <AnomalyRow
                      item={item}
                      threshold={data?.threshold ?? 0.15}
                      timeZone={timeZone}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </PageBody>
    </div>
  );
};
