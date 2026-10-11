import { ChartNoAxesCombined, ChevronLeft, LayoutDashboard, Pin, ScanSearch } from "lucide-react";
import { Link } from "react-router";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { RequireProductionRole } from "@/features/production/components/production-gate";
import { formatDay } from "@/features/production/format";
import { useProductionMe } from "@/features/production/hooks";
import {
  AdminCards,
  AdminCardsSkeleton,
  PinnedReportCard
} from "@/features/production/reports/components/admin-cards";
import { AdminExportMenu } from "@/features/production/reports/components/admin-export";
import { formatRange } from "@/features/production/reports/format";
import { useAdminDashboard, useLiveReports } from "@/features/production/reports/hooks";
import { PageBody } from "@/features/production/scores/components/kit";
import { periodLabel } from "@/features/production/scores/periods";
import { touchTargets } from "@/features/production/ui";
import { useBreakpoint } from "@/hooks/use-breakpoint";

/**
 * /production/admin — Admin dashboard (SPEC Phase 5 §3, PLAN §7): the six fixed cards (points today, late
 * jobs, FB rate by worker / client, productivity by shift, KPI attainment), each opening the report builder
 * with its config (the KPI card opens the KPI report: % per person), "Xuất" (CSV of the six cards or one
 * card's Excel), then the saved reports an Admin pinned. ADMIN only (the API answers 403 otherwise).
 */
export const ProductionAdminDashboardRoute = () => (
  <RequireProductionRole roles={["ADMIN"]}>
    <AdminDashboardPage />
  </RequireProductionRole>
);

const AdminDashboardPage = () => {
  const me = useProductionMe();
  const breakpoint = useBreakpoint();
  const dashboard = useAdminDashboard();
  useLiveReports();
  const data = dashboard.data;
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";

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
        title="Quản trị số liệu"
        description={
          breakpoint === "mobile"
            ? undefined
            : data
              ? `Số liệu tức thì ngày ${formatDay(data.today)} · ${periodLabel(data.period.key)} (${formatRange(data.period.from, data.period.to)}). Bấm "Mở báo cáo" để xem chi tiết.`
              : "Số liệu tức thì của bộ phận sản xuất."
        }
        actions={
          <div className={`flex items-center gap-1.5 ${touchTargets}`}>
            {dashboard.isFetching && !dashboard.isPending ? (
              <Spinner className="size-4 text-foreground-muted" />
            ) : null}
            <AdminExportMenu data={data} timeZone={timeZone} />
            <Button
              variant="outline"
              render={<Link to="/production/dashboard" />}
              nativeButton={false}
            >
              <LayoutDashboard />
              <span className="max-md:sr-only">Dashboard Leader</span>
            </Button>
            <Button
              variant="outline"
              render={<Link to="/production/anomalies" />}
              nativeButton={false}
            >
              <ScanSearch />
              <span className="max-md:sr-only">Bất thường</span>
            </Button>
            <Button render={<Link to="/production/reports" />} nativeButton={false}>
              <ChartNoAxesCombined />
              <span className="max-sm:sr-only">Báo cáo</span>
            </Button>
          </div>
        }
      />
      <PageBody className="max-w-7xl">
        {dashboard.isPending ? (
          <AdminCardsSkeleton />
        ) : dashboard.isError || !data ? (
          <div className="rounded-xl border bg-surface">
            <ErrorState
              error={dashboard.error}
              onRetry={() => void dashboard.refetch()}
              retrying={dashboard.isFetching}
            />
          </div>
        ) : (
          <>
            <AdminCards cards={data.cards} timeZone={timeZone} />
            <section aria-labelledby="pinned-title" className="flex min-w-0 flex-col gap-3">
              <div className="flex items-end justify-between gap-3 pt-2">
                <div className="flex flex-col gap-0.5">
                  <h2
                    id="pinned-title"
                    className="flex items-center gap-1.5 text-base font-semibold"
                  >
                    <Pin className="size-4 text-foreground-muted" aria-hidden="true" />
                    Báo cáo đã ghim
                  </h2>
                  <p className="text-xs text-foreground-muted">
                    Báo cáo lưu sẵn được Quản trị ghim, chạy lại mỗi lần mở trang.
                  </p>
                </div>
              </div>
              {data.pinned.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-surface">
                  <EmptyState
                    size="sm"
                    icon={Pin}
                    title="Chưa ghim báo cáo nào"
                    description='Dựng báo cáo, bấm "Lưu" và bật "Ghim lên trang Quản trị số liệu" để thấy nó ở đây.'
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        className="max-sm:min-h-10"
                        render={<Link to="/production/reports" />}
                        nativeButton={false}
                      >
                        <ChartNoAxesCombined />
                        Mở trình dựng báo cáo
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                  {data.pinned.map((report, index) => (
                    <PinnedReportCard key={report.id} report={report} index={index} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </PageBody>
    </div>
  );
};
