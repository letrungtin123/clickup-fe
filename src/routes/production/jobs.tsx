import { Briefcase, ClipboardPen, Crown, Plus, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { RouteFallback } from "@/components/layout/route-fallback";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { JobFiltersBar } from "@/features/production/components/jobs/job-filters";
import { JobFormDialog } from "@/features/production/components/jobs/job-form-dialog";
import { JobScopeTabs } from "@/features/production/components/jobs/job-scope-tabs";
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
  jobQueryFromFilters,
  landingJobScope,
  listPersonOf,
  sanitizeJobStatusIds,
  scopeTabsShown,
  withJobScope,
  type JobFilters
} from "@/features/production/jobs-model";
import { useProductionPeople } from "@/features/production/people";
import { touchTargets } from "@/features/production/ui";
import { useBreakpoint } from "@/hooks/use-breakpoint";

/**
 * /production/jobs — jobs (one per Job Code of a Project, PD-035 / PD-078) with their work lines, filters in the URL.
 * Who sees what is the "view" scope of the job permission matrix (PD-036): "all" every job, "own" the jobs I
 * work on (the API filters), "none" no list. Choosing a staff member turns it into their view (PD-034). Holders of
 * LEADER or ADMIN get the "Tất cả" / "Tôi quản lý" tabs (PD-073, PD-078): `?scope=all|mine`, "Tôi quản lý" = the jobs
 * of the Projects I own; a Leader lands on "Tôi quản lý", an Admin without LEADER on "Tất cả".
 */
export const ProductionJobsRoute = () => {
  const me = useProductionMe();
  const { jobScopes, taskCreate } = useProductionAccess();
  // The production layout waits for /production/me; never flash "no permission" before the scopes are known.
  if (!me.data) return <RouteFallback />;
  return jobScopes.view === "none" ? (
    <JobsForbidden canEnter={taskCreate !== "none"} />
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
  const { jobScopes, roles, taskCreate } = useProductionAccess();
  // PD-078: the tabs are for whoever can own Projects (LEADER or ADMIN; the superadmin holds ADMIN).
  const scopeTabs = scopeTabsShown(roles);
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const phone = breakpoint === "mobile";
  const [params, setParams] = useSearchParams();
  // Opening the list without ?scope= lands on the role's tab (a Leader: "Tôi quản lý"; an Admin, or a ?leader= link:
  // "Tất cả"), written into the URL so it stays chosen while other filters change. PD-073's ?leader=all becomes
  // ?scope=all.
  const leaderLink = params.get("leader");
  const landingScope =
    scopeTabs && !params.has("scope")
      ? leaderLink === allLeadersParam
        ? "all"
        : landingJobScope(roles, leaderLink !== null)
      : null;
  useEffect(() => {
    if (!landingScope) return;
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (next.get("leader") === allLeadersParam) next.delete("leader");
        next.set("scope", landingScope);
        return next;
      },
      { replace: true }
    );
  }, [landingScope, setParams]);
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
  // PD-079: "Nhập Task" needs a task-creating role — an Account creates Projects and Job Codes only.
  const canEnter = taskCreate !== "none";
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
      // Until the URL says so (effect above): the first request already asks for the landing tab.
      ...(landingScope ? { scope: landingScope } : {}),
      // Without the tabs there is no scope (a shared ?scope=mine link reads as "Tất cả").
      ...(scopeTabs ? {} : { scope: null })
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
  }, [params, landingScope, scopeTabs, customFields.data, jobFields, tags.data, jobStatuses.data]);
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
  const filtering = activeFilterCount(filters) > 0 || filters.q.trim() !== "";
  const scope = scopeTabs ? (filters.scope ?? "all") : null;
  // Per-person view ("Mọi nhân viên"): the person whose share the loaded rows carry.
  const totals = jobs.data?.pages[0]?.personTotals ?? null;
  const person = useMemo(
    () => listPersonOf(jobs.data?.pages[0], items, people.nameOf),
    [jobs.data, items, people.nameOf]
  );

  const setFilters = useCallback(
    (next: JobFilters) => setParams(jobFiltersToSearch(next), { replace: true }),
    [setParams]
  );
  const projectList = {
    projects: facets.data?.projects,
    isPending: facets.isPending,
    isError: facets.isError,
    onRetry: () => void facets.refetch(),
    selectedId: filters.projectId,
    onSelect: (projectId: string | null) => setFilters({ ...filters, projectId }),
    myId: scopeTabs ? userId : null
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
            ? "Các job có task của bạn — mỗi job là một Job Code của Project."
            : "Project > Job Code > Task > Subtask: mỗi job là một Job Code của Project, gồm các task — trạng thái, tiến độ và trễ hạn."
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
        {scope ? (
          <div className="-mx-4 -mt-1 border-b px-4 md:-mx-6 md:px-6">
            <JobScopeTabs
              value={scope}
              counts={facets.data?.leaderTabs}
              onChange={(next) => setFilters(withJobScope(filters, next))}
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
              scope === "mine" && !filtering ? (
                <EmptyState
                  icon={Crown}
                  title="Chưa có job trong Project bạn phụ trách"
                  description="Tab Tôi quản lý gồm mọi Job Code, task và subtask của các Project do bạn phụ trách."
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilters(withJobScope(filters, "all"))}
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
                  // The "Tất cả" / "Tôi quản lý" tab stays (a tab, not a filter).
                  onReset={() => setFilters({ ...clearedJobFilters(filters), q: "" })}
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
