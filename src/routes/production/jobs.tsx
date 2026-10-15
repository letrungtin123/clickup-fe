import { Briefcase, ClipboardPen, Plus, ShieldAlert } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { RouteFallback } from "@/components/layout/route-fallback";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { JobFiltersBar } from "@/features/production/components/jobs/job-filters";
import { JobFormDialog } from "@/features/production/components/jobs/job-form-dialog";
import { JobsExportMenu } from "@/features/production/components/jobs/jobs-export-menu";
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
import { useJobs } from "@/features/production/jobs-hooks";
import { sanitizeListFilters } from "@/features/production/list-filters";
import {
  activeFilterCount,
  emptyJobFilters,
  jobFiltersFromSearch,
  jobFiltersToSearch,
  jobQueryFromFilters,
  listPersonOf,
  sanitizeJobStatusIds,
  type JobFilters
} from "@/features/production/jobs-model";
import { useProductionPeople } from "@/features/production/people";
import { touchTargets } from "@/features/production/ui";

/**
 * /production/jobs — jobs (one per Gói công việc of a project, PD-035) with their work lines, filters in the URL.
 * Who sees what is the "view" scope of the job permission matrix (PD-036): "all" every job, "own" the jobs I
 * work on (the API filters), "none" no list. Choosing a staff member turns it into their view (PD-034).
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
              Nhập công việc
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
  const { jobScopes } = useProductionAccess();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [entering, setEntering] = useState(false);
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
    const fromUrl = jobFiltersFromSearch(params);
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
  }, [params, customFields.data, jobFields, tags.data, jobStatuses.data]);
  const query = useMemo(() => jobQueryFromFilters(filters, timeZone), [filters, timeZone]);
  // Custom-field filters from a link wait for the field catalog (a stale one would answer 400).
  const ready = Object.keys(filters.custom.fields).length === 0 || !customFields.isPending;
  const jobs = useJobs(query, ready);
  const items = useMemo(() => jobs.data?.pages.flatMap((page) => page.items) ?? [], [jobs.data]);
  const filtering = activeFilterCount(filters) > 0 || filters.q.trim() !== "";
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
              <Button variant="outline" onClick={() => setCreating(true)}>
                <Plus />
                <span className="max-sm:sr-only">Tạo job</span>
              </Button>
            ) : null}
            {canEnter ? (
              <Button onClick={() => setEntering(true)}>
                <ClipboardPen />
                Nhập công việc
              </Button>
            ) : null}
          </>
        }
      >
        <JobFiltersBar
          filters={filters}
          onChange={setFilters}
          today={todayIn(timeZone)}
          fields={jobFields}
          tags={tags.data?.items ?? []}
        />
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4 md:overflow-hidden md:px-6">
        <p className="text-xs text-foreground-muted tabular-nums" aria-live="polite">
          {person && totals ? (
            // Over every matching job (the API sums them), not only the loaded rows.
            <>
              {formatInteger(totals.jobCount)} job ·{" "}
              <b className="font-semibold text-foreground">{person.displayName}</b> làm{" "}
              <b className="font-semibold text-foreground">{formatInteger(totals.qtyAssigned)}</b>{" "}
              tấm · xong{" "}
              <b className="font-semibold text-foreground">{formatInteger(totals.qtyDone)}</b> · đã
              kiểm{" "}
              <b className="font-semibold text-foreground">{formatInteger(totals.qtyChecked)}</b>
            </>
          ) : jobs.data ? (
            `${items.length}${jobs.hasNextPage ? "+" : ""} job`
          ) : (
            " "
          )}
          {jobs.isFetching && !jobs.isPending ? " · đang cập nhật…" : ""}
        </p>
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
          empty={
            jobScopes.view === "own" && !filtering ? (
              <EmptyState
                icon={Briefcase}
                title="Chưa có job nào của bạn"
                description="Job hiện ở đây khi bạn có task trong đó."
                action={
                  canEnter ? (
                    <Button size="sm" onClick={() => setEntering(true)}>
                      <ClipboardPen />
                      Nhập công việc
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <JobsEmpty
                filtering={filtering}
                onReset={() => setFilters(emptyJobFilters)}
                onCreate={canCreateJob ? () => setCreating(true) : undefined}
              />
            )
          }
        />
      </div>
      {canCreateJob ? (
        <JobFormDialog
          key={creating ? "open" : "closed"}
          open={creating}
          job={null}
          onClose={() => setCreating(false)}
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
