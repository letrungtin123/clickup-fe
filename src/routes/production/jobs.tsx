import { Briefcase, ClipboardPen, Crown, Plus, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { RouteFallback } from "@/components/layout/route-fallback";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { JobFiltersBar } from "@/features/production/components/jobs/job-filters";
import { JobFormDialog } from "@/features/production/components/jobs/job-form-dialog";
import { JobLeaderTabs } from "@/features/production/components/jobs/job-leader-tabs";
import { JobsExportMenu } from "@/features/production/components/jobs/jobs-export-menu";
import {
  JobProjectSelect,
  JobProjectSidebar,
  ShowProjectsButton
} from "@/features/production/components/jobs/job-project-sidebar";
import { JobsEmpty, JobsList } from "@/features/production/components/jobs/jobs-list";
import { WorkEntryDialog } from "@/features/production/components/jobs/work-entry-dialog";
import { fieldsFor } from "@/features/production/custom-fields";
import { formatInteger, todayIn } from "@/features/production/format";
import {
  useCustomFields,
  useJobStatuses,
  useProductionAccess,
  useProductionMe,
  useTags
} from "@/features/production/hooks";
import { useSessionContext } from "@/features/auth/hooks";
import {
  monthCounts,
  monthDefaultDays,
  readSidebarHidden,
  writeSidebarHidden
} from "@/features/production/job-list-model";
import { useJobFacets, useJobs } from "@/features/production/jobs-hooks";
import { sanitizeListFilters } from "@/features/production/list-filters";
import {
  activeFilterCount,
  allLeadersParam,
  clearedJobFilters,
  jobFiltersFromSearch,
  jobFiltersToSearch,
  jobLeaderTabOf,
  jobQueryFromFilters,
  listPersonOf,
  sanitizeJobStatusIds,
  withJobLeaderTab,
  type JobFilters
} from "@/features/production/jobs-model";
import { useProductionPeople } from "@/features/production/people";
import { touchTargets } from "@/features/production/ui";
import { useBreakpoint } from "@/hooks/use-breakpoint";

/**
 * /production/jobs — jobs (one per Gói công việc of a project, PD-035) with their work lines, filters in the URL.
 * Who sees what is the "view" scope of the job permission matrix (PD-036): "all" every job, "own" the jobs I
 * work on (the API filters), "none" no list. Choosing a staff member turns it into their view (PD-034). Holders of
 * LEADER get the "Tất cả" / "Tôi quản lý" tabs (PD-073): the `?leader=<me>` filter, opened on "Tất cả".
 */
export const ProductionJobsRoute = () => {
  const me = useProductionMe();
  const { jobScopes } = useProductionAccess();
  // The production layout waits for /production/me; never flash "no permission" before the scopes are known.
  if (!me.data) return <RouteFallback />;
  return jobScopes.view === "none" ? (
    <JobsForbidden canEnter={jobScopes.create !== "none"} />
  ) : (
    <JobsPage />
  );
};

/** "view: none": no job list; whoever may enter work still gets "Nhập công việc" here. */
const JobsForbidden = ({ canEnter }: { canEnter: boolean }) => {
  const [entering, setEntering] = useState(false);
  return (
    <div className={`flex h-full items-center justify-center p-4 ${touchTargets}`}>
      <EmptyState
        icon={ShieldAlert}
        title="Bạn không có quyền xem trang này"
        description="Danh sách job chỉ mở cho người được cấp quyền xem job. Liên hệ Quản trị Photo Retouch nếu bạn cần quyền."
        action={
          canEnter ? (
            <Button size="sm" onClick={() => setEntering(true)}>
              <ClipboardPen />
              Nhập Task
            </Button>
          ) : undefined
        }
      />
      {canEnter ? (
        <WorkEntryDialog
          key={entering ? "open" : "closed"}
          open={entering}
          onClose={() => setEntering(false)}
        />
      ) : null}
    </div>
  );
};

const JobsPage = () => {
  const me = useProductionMe();
  const userId = useSessionContext().user.id;
  const { jobScopes, roles } = useProductionAccess();
  // PD-073: the tabs are a Leader's (holding LEADER itself; the superadmin holds every role), never ADMIN alone.
  const leaderTabs = roles.includes("LEADER");
  const tabLeaderId = leaderTabs ? userId : null;
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const phone = breakpoint === "mobile";
  const [params, setParams] = useSearchParams();
  // A Leader lands on "Tôi quản lý" (owner, 2026-10-20): opening the list without any leader filter means ?leader=<me>;
  // their "Tất cả" is written as ?leader=all so it stays chosen while other filters change.
  const landsOnMine = leaderTabs && !params.has("leader");
  useEffect(() => {
    if (!landsOnMine) return;
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("leader", userId);
        return next;
      },
      { replace: true }
    );
  }, [landsOnMine, setParams, userId]);
  // "Tạo job": from the header (no month) or from a month group of the list (PD-067).
  const [creating, setCreating] = useState<{ month: string | null } | null>(null);
  const [entering, setEntering] = useState(false);
  // PD-067 project sidebar: the user's choice, else shown on desktop and folded on tablets (room for the table).
  const [sidebarChoice, setSidebarChoice] = useState(() => readSidebarHidden(userId));
  const sidebarHidden = sidebarChoice ?? breakpoint === "tablet";
  const setSidebarHidden = (hidden: boolean) => {
    setSidebarChoice(hidden);
    writeSidebarHidden(userId, hidden);
  };
  const canCreateJob = jobScopes.create === "all";
  const canEnter = jobScopes.create !== "none";
  const customFields = useCustomFields();
  const tags = useTags();
  const jobStatuses = useJobStatuses();
  const people = useProductionPeople();
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const jobFields = useMemo(
    () => fieldsFor(customFields.data?.items ?? [], "JOB"),
    [customFields.data]
  );
  const filters = useMemo(() => {
    const fromUrl = {
      ...jobFiltersFromSearch(params),
      // Until the URL says so (effect above): the first request already asks for the Leader's own jobs.
      ...(landsOnMine ? { leaderId: userId } : {})
    };
    // A shared link may name a job status, field / option / tag that no longer exists: drop it (no 400, no
    // "1 trạng thái" filter that matches nothing).
    const parsed = {
      ...fromUrl,
      jobStatusIds: sanitizeJobStatusIds(
        fromUrl.jobStatusIds,
        jobStatuses.data ? new Set(jobStatuses.data.items.map((status) => status.id)) : undefined
      )
    };
    return customFields.data
      ? {
          ...parsed,
          custom: sanitizeListFilters(
            parsed.custom,
            jobFields,
            tags.data ? new Set(tags.data.items.map((tag) => tag.id)) : undefined
          )
        }
      : parsed;
  }, [params, landsOnMine, userId, customFields.data, jobFields, tags.data, jobStatuses.data]);
  const facetQuery = useMemo(() => jobQueryFromFilters(filters, timeZone), [filters, timeZone]);
  // PD-067: the List view groups by month of Ngày nhận, so rows come newest Ngày nhận first (the export follows).
  const query = useMemo(() => ({ ...facetQuery, sort: "received" }), [facetQuery]);
  // Custom-field filters from a link wait for the field catalog (a stale one would answer 400).
  const ready = Object.keys(filters.custom.fields).length === 0 || !customFields.isPending;
  const jobs = useJobs(query, ready);
  const facets = useJobFacets(facetQuery, ready);
  const items = useMemo(() => jobs.data?.pages.flatMap((page) => page.items) ?? [], [jobs.data]);
  const counts = useMemo(() => monthCounts(facets.data), [facets.data]);
  const total = facets.data
    ? facets.data.months.reduce((sum, month) => sum + month.count, 0)
    : null;
  const filtering = activeFilterCount(filters, tabLeaderId) > 0 || filters.q.trim() !== "";
  // "Tôi quản lý" ⇔ ?leader=<me>; "Tất cả" ⇔ no leader filter; another leader / "none" (a link): neither, chip shown.
  const leaderTab = leaderTabs ? jobLeaderTabOf(filters, userId) : null;
  // Per-person view ("Mọi nhân viên"): the person whose share the loaded rows carry.
  const totals = jobs.data?.pages[0]?.personTotals ?? null;
  const person = useMemo(
    () => listPersonOf(jobs.data?.pages[0], items, people.nameOf),
    [jobs.data, items, people.nameOf]
  );

  const setFilters = useCallback(
    (next: JobFilters) => {
      const search = jobFiltersToSearch(next);
      // A Leader's "Tất cả" stays explicit, else the page would land on "Tôi quản lý" again.
      if (leaderTabs && next.leaderId === null) search.set("leader", allLeadersParam);
      setParams(search, { replace: true });
    },
    [setParams, leaderTabs]
  );
  const projectList = {
    projects: facets.data?.projects,
    isPending: facets.isPending,
    isError: facets.isError,
    onRetry: () => void facets.refetch(),
    selectedId: filters.projectId,
    onSelect: (projectId: string | null) => setFilters({ ...filters, projectId })
  };
  // A new job starts in the list's project when it is an active one, and in the month it was asked from (PD-067).
  const selectedProject = facets.data?.projects.find(
    (project) => project.projectId === filters.projectId
  );
  const monthDays = creating?.month ? monthDefaultDays(creating.month, todayIn(timeZone)) : null;
  const createInitial = {
    projectId: selectedProject?.active ? selectedProject.projectId : null,
    ...(monthDays ? { receivedDay: monthDays.received, dueDay: monthDays.due } : {})
  };

  return (
    <div className={`flex h-full min-h-0 flex-col ${touchTargets}`}>
      <PageHeader
        eyebrow="Photo Retouch"
        title="Job"
        description={
          jobScopes.view === "own"
            ? "Các job có task của bạn — mỗi job là một gói công việc của dự án."
            : "Mỗi job là một gói công việc của dự án, gồm các task: trạng thái, tiến độ và trễ hạn."
        }
        actions={
          <>
            {/* Danh sách job (one row per job) or the work log (one row per line). */}
            <JobsExportMenu query={query} disabled={!jobs.data} />
            {canCreateJob ? (
              <Button variant="outline" onClick={() => setCreating({ month: null })}>
                <Plus />
                <span className="max-sm:sr-only">Tạo job</span>
              </Button>
            ) : null}
            {canEnter ? (
              <Button onClick={() => setEntering(true)}>
                <ClipboardPen />
                Nhập Task
              </Button>
            ) : null}
          </>
        }
      >
        {leaderTabs ? (
          <div className="-mx-4 -mt-1 border-b px-4 md:-mx-6 md:px-6">
            <JobLeaderTabs
              value={leaderTab}
              counts={facets.data?.leaderTabs}
              onChange={(tab) => setFilters(withJobLeaderTab(filters, tab, userId))}
            />
          </div>
        ) : null}
        <JobFiltersBar
          filters={filters}
          onChange={setFilters}
          today={todayIn(timeZone)}
          fields={jobFields}
          tags={tags.data?.items ?? []}
          // PD-067: the project is picked in the sidebar (phones: the select above the list).
          showProject={false}
          tabLeaderId={tabLeaderId}
        />
      </PageHeader>
      <div className="flex min-h-0 flex-1">
        {!phone && !sidebarHidden ? (
          <JobProjectSidebar {...projectList} onHide={() => setSidebarHidden(true)} />
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3 md:overflow-hidden md:px-5">
          {phone ? <JobProjectSelect {...projectList} /> : null}
          <div className="flex min-h-7 items-center gap-2">
            {!phone && sidebarHidden ? (
              <ShowProjectsButton onShow={() => setSidebarHidden(false)} />
            ) : null}
            <p
              className="min-w-0 flex-1 text-xs text-foreground-muted tabular-nums"
              aria-live="polite"
            >
              {person && totals ? (
                // Over every matching job (the API sums them), not only the loaded rows.
                <>
                  {formatInteger(totals.jobCount)} job ·{" "}
                  <b className="font-semibold text-foreground">{person.displayName}</b> làm{" "}
                  <b className="font-semibold text-foreground">
                    {formatInteger(totals.qtyAssigned)}
                  </b>{" "}
                  tấm · xong{" "}
                  <b className="font-semibold text-foreground">{formatInteger(totals.qtyDone)}</b> ·
                  đã kiểm{" "}
                  <b className="font-semibold text-foreground">
                    {formatInteger(totals.qtyChecked)}
                  </b>
                </>
              ) : total !== null ? (
                `${formatInteger(total)} job`
              ) : jobs.data ? (
                `${items.length}${jobs.hasNextPage ? "+" : ""} job`
              ) : (
                " "
              )}
              {jobs.isFetching && !jobs.isPending ? " · đang cập nhật…" : ""}
            </p>
          </div>
          <JobsList
            jobs={items}
            isPending={jobs.isPending}
            error={jobs.isError ? jobs.error : null}
            onRetry={() => void jobs.refetch()}
            hasNextPage={jobs.hasNextPage}
            isFetchingNextPage={jobs.isFetchingNextPage}
            fetchNextPage={() => void jobs.fetchNextPage()}
            timeZone={timeZone}
            fields={jobFields}
            person={person}
            filtering={filtering}
            monthCounts={counts}
            onCreateJob={canCreateJob ? (month) => setCreating({ month }) : undefined}
            empty={
              leaderTab === "mine" && !filtering ? (
                <EmptyState
                  icon={Crown}
                  title="Bạn chưa quản lý job nào"
                  description="Job có bạn là Leader hiện ở đây. Job chưa có Leader nằm ở tab Tất cả."
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilters(withJobLeaderTab(filters, "all", userId))}
                    >
                      Xem tất cả
                    </Button>
                  }
                />
              ) : jobScopes.view === "own" && !filtering ? (
                <EmptyState
                  icon={Briefcase}
                  title="Chưa có job nào của bạn"
                  description="Job hiện ở đây khi bạn có task trong đó."
                  action={
                    canEnter ? (
                      <Button size="sm" onClick={() => setEntering(true)}>
                        <ClipboardPen />
                        Nhập Task
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <JobsEmpty
                  filtering={filtering}
                  // The "Tôi quản lý" tab stays (a tab, not a filter).
                  onReset={() => setFilters({ ...clearedJobFilters(filters, tabLeaderId), q: "" })}
                  onCreate={canCreateJob ? () => setCreating({ month: null }) : undefined}
                />
              )
            }
          />
        </div>
      </div>
      {canCreateJob ? (
        <JobFormDialog
          key={creating ? `open-${creating.month ?? "now"}` : "closed"}
          open={creating !== null}
          job={null}
          initial={createInitial}
          onClose={() => setCreating(null)}
          onSaved={(job) => void navigate(`/production/jobs/${job.id}`)}
        />
      ) : null}
      {canEnter ? (
        <WorkEntryDialog
          key={entering ? "entry-open" : "entry-closed"}
          open={entering}
          onClose={() => setEntering(false)}
          // A list narrowed to one project starts the entry in it.
          initial={filters.projectId ? { projectId: filters.projectId } : undefined}
        />
      ) : null}
    </div>
  );
};
