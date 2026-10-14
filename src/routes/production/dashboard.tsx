import {
  AlarmClock,
  ChartNoAxesCombined,
  ChevronLeft,
  CircleCheckBig,
  Flame,
  Hourglass,
  ScanSearch
} from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { Link } from "@/components/shared/router-link";

import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireProductionRole } from "@/features/production/components/production-gate";
import { formatDay, formatInteger } from "@/features/production/format";
import {
  useProductionAccess,
  useProductionMe,
  useProductionMembers
} from "@/features/production/hooks";
import {
  DashboardTaskList,
  TeamPointsPanel,
  WorkloadPanel
} from "@/features/production/reports/components/leader-dashboard";
import { leaderAnomalyDays, unreviewedTotal } from "@/features/production/reports/anomalies";
import { LeaderAnomaliesPanel } from "@/features/production/reports/components/leader-anomalies";
import { workloadTotals } from "@/features/production/reports/dashboard";
import {
  useAnomalies,
  useLeaderDashboard,
  useLiveReports
} from "@/features/production/reports/hooks";
import { PageBody, StatCard } from "@/features/production/scores/components/kit";
import { touchTargets } from "@/features/production/ui";
import { useBreakpoint } from "@/hooks/use-breakpoint";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL = "__all";

/**
 * /production/dashboard — Leader dashboard (SPEC Phase 5 §2): late (red) and due-soon (amber) tasks of
 * the jobs the leader leads, today's workload of every worker, team points per week. ADMIN sees every
 * job or picks a leader (`?leader=`). "Bất thường" tab (`?tab=anomalies`, SPEC Phase 5.5): the unreviewed
 * anomalies of the leader's jobs. Refreshes every minute and on `production:changed`.
 */
export const ProductionDashboardRoute = () => (
  <RequireProductionRole roles={["LEADER"]}>
    <LeaderDashboardPage />
  </RequireProductionRole>
);

const LeaderDashboardPage = () => {
  const access = useProductionAccess();
  const me = useProductionMe();
  const breakpoint = useBreakpoint();
  const [params, setParams] = useSearchParams();
  const isAdmin = access.isAdmin;
  const leaderParam = params.get("leader");
  const leaderId = isAdmin && leaderParam && uuidPattern.test(leaderParam) ? leaderParam : null;
  const tab = params.get("tab") === "anomalies" ? "anomalies" : "overview";
  const dashboard = useLeaderDashboard(leaderId, tab === "overview");
  const anomalies = useAnomalies(leaderAnomalyDays, false);
  const anomalyCount = unreviewedTotal(anomalies.data?.counts);
  const members = useProductionMembers(isAdmin);
  useLiveReports();

  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const data = dashboard.data;
  const totals = useMemo(() => workloadTotals(data?.workload ?? []), [data]);
  const leaders = useMemo(
    () =>
      (members.data?.items ?? [])
        .filter((member) => member.active && member.roles.includes("LEADER"))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "vi")),
    [members.data]
  );
  const leaderItems = [
    { value: ALL, label: "Mọi job" },
    ...leaders.map((leader) => ({ value: leader.userId, label: leader.displayName }))
  ];
  const selectedLeader = leaders.find((leader) => leader.userId === leaderId) ?? null;

  const scope = isAdmin
    ? selectedLeader
      ? `các job do ${selectedLeader.displayName} phụ trách`
      : "mọi job"
    : "các job bạn phụ trách";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow={
          <Link
            to="/production"
            className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-3 max-sm:py-3 max-sm:pr-3"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Photo Retouch
          </Link>
        }
        title="Bảng điều khiển"
        description={
          breakpoint === "mobile"
            ? undefined
            : `Task trễ và sắp đến hạn của ${scope}, tải việc hôm nay${data ? ` (${formatDay(data.today)})` : ""} và điểm team.`
        }
        actions={
          <div className={`flex items-center gap-1.5 ${touchTargets}`}>
            {dashboard.isFetching && !dashboard.isPending ? (
              <Spinner className="size-4 text-foreground-muted" aria-label="Đang cập nhật" />
            ) : null}
            <Button
              variant="outline"
              render={<Link to="/production/anomalies" />}
              nativeButton={false}
            >
              <ScanSearch />
              <span className="max-sm:sr-only">Bất thường</span>
            </Button>
            <Button
              variant="outline"
              render={<Link to="/production/reports" />}
              nativeButton={false}
            >
              <ChartNoAxesCombined />
              <span className="max-sm:sr-only">Báo cáo</span>
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          {isAdmin ? (
            <div className={`flex items-center gap-2 ${touchTargets}`}>
              <span className="text-xs text-foreground-muted">Xem theo Leader</span>
              <Select
                items={leaderItems}
                value={leaderId ?? ALL}
                onValueChange={(next: string | null) =>
                  setParams(
                    (previous) => {
                      const nextParams = new URLSearchParams(previous);
                      if (!next || next === ALL) nextParams.delete("leader");
                      else nextParams.set("leader", next);
                      return nextParams;
                    },
                    { replace: true }
                  )
                }
              >
                <SelectTrigger size="sm" className="min-w-44" aria-label="Chọn Leader">
                  <SelectValue>
                    {selectedLeader ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <UserAvatar
                          user={{
                            id: selectedLeader.userId,
                            displayName: selectedLeader.displayName,
                            avatarUrl: selectedLeader.avatarUrl
                          }}
                          size="xs"
                        />
                        <span className="truncate">{selectedLeader.displayName}</span>
                      </span>
                    ) : (
                      "Mọi job"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {leaderItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Tabs
            value={tab}
            onValueChange={(value) =>
              setParams(
                (previous) => {
                  const nextParams = new URLSearchParams(previous);
                  if (value === "anomalies") nextParams.set("tab", "anomalies");
                  else nextParams.delete("tab");
                  return nextParams;
                },
                { replace: true }
              )
            }
          >
            <TabsList variant="line" className="-mb-3 h-9">
              <TabsTrigger value="overview" className="max-sm:min-h-10">
                Tổng quan
              </TabsTrigger>
              <TabsTrigger value="anomalies" className="gap-1.5 max-sm:min-h-10">
                Bất thường
                {anomalyCount > 0 ? (
                  <span
                    className="min-w-5 rounded-full bg-danger-soft px-1.5 text-[11px] font-semibold text-danger tabular-nums"
                    aria-label={`${anomalyCount} mục chưa xem`}
                  >
                    {anomalyCount}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </PageHeader>
      <PageBody className="max-w-7xl">
        {tab === "anomalies" ? (
          <LeaderAnomaliesPanel
            timeZone={timeZone}
            scope={isAdmin ? "mọi job" : "các job bạn phụ trách"}
            note={
              isAdmin && selectedLeader
                ? "Danh sách này chưa lọc theo Leader đang chọn."
                : undefined
            }
          />
        ) : dashboard.isPending ? (
          <DashboardSkeleton />
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Task trễ hạn"
                icon={Flame}
                value={
                  <span className={data.counts.late > 0 ? "text-danger" : undefined}>
                    {formatInteger(data.counts.late)}
                  </span>
                }
                unit="task"
                className={data.counts.late > 0 ? "border-danger/30" : ""}
              >
                <span>Quá hạn mà chưa xong</span>
              </StatCard>
              <StatCard
                label="Sắp đến hạn"
                icon={AlarmClock}
                value={formatInteger(data.counts.dueSoon)}
                unit="task"
                className={data.counts.dueSoon > 0 ? "border-warning/40" : ""}
              >
                <span>Trong {data.dueSoonHours} giờ tới</span>
              </StatCard>
              <StatCard
                label="Đang làm"
                icon={Hourglass}
                value={formatInteger(totals.processing)}
                unit="tấm"
              >
                <span>
                  {formatInteger(totals.notStarted)} tấm chưa làm · {totals.busy} người có việc
                </span>
              </StatCard>
              <StatCard
                label="Xong hôm nay"
                icon={CircleCheckBig}
                value={formatInteger(totals.doneToday)}
                unit="tấm"
                accent
              >
                <span>
                  {totals.tasksDoneToday} task
                  {totals.onLeave > 0 ? ` · ${totals.onLeave} người nghỉ` : ""}
                </span>
              </StatCard>
            </div>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <DashboardTaskList
                tone="late"
                tasks={data.late}
                total={data.counts.late}
                dueSoonHours={data.dueSoonHours}
                timeZone={timeZone}
              />
              <DashboardTaskList
                tone="soon"
                tasks={data.dueSoon}
                total={data.counts.dueSoon}
                dueSoonHours={data.dueSoonHours}
                timeZone={timeZone}
              />
            </div>
            <WorkloadPanel rows={data.workload} mobile={breakpoint === "mobile"} />
            <TeamPointsPanel teamPoints={data.teamPoints} />
          </>
        )}
      </PageBody>
    </div>
  );
};

const DashboardSkeleton = () => (
  <div className="flex flex-col gap-4" aria-hidden="true">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-24 rounded-xl" />
      ))}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
    <Skeleton className="h-80 rounded-xl" />
  </div>
);
