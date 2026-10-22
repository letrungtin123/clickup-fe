import { useState } from "react";

import { ErrorState } from "@/components/shared/states";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { JobDetail } from "@/contracts/production-jobs";
import type { OverviewJob } from "@/contracts/production-overview";

import { useJob } from "../../jobs-hooks";
import { SplitTasksDialog } from "../../components/jobs/split-tasks-dialog";
import { assignJobLabel } from "../model";

/** The Job Code picker shown at the top of "Chia task" when it is opened from the Overview (PD-080). */
const JobCodePicker = ({
  projectCode,
  jobs,
  value,
  loading,
  timeZone,
  onChange
}: {
  projectCode: string;
  jobs: readonly OverviewJob[];
  value: string;
  loading: boolean;
  timeZone: string;
  onChange: (jobId: string) => void;
}) => {
  const items = jobs.map((job) => ({ value: job.id, label: assignJobLabel(job, timeZone) }));
  const current = items.find((item) => item.value === value);
  return (
    <Field className="rounded-xl border border-brand/30 bg-brand-soft/40 p-3">
      <FieldLabel htmlFor="overview-assign-job" className="flex items-center gap-2">
        Job Code chưa chia task · {projectCode}
        {loading ? <Spinner className="size-3.5" aria-label="Đang tải job" /> : null}
      </FieldLabel>
      <Select items={items} value={value} onValueChange={(next: string | null) => next && onChange(next)}>
        <SelectTrigger id="overview-assign-job" className="w-full min-w-0 bg-surface">
          <SelectValue>{current?.label ?? "Chọn Job Code"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription className="text-xs">
        Các Job Code của Project chưa có task nào — chọn một để chia; mỗi lần lưu là một Job Code.
      </FieldDescription>
    </Field>
  );
};

/**
 * "Chia task" from a project row of the Overview (PD-080): the existing Chia Task form (`SplitTasksDialog`, unchanged)
 * with a Job Code picker on top listing the project's Job Codes without any task. The picked job's detail is loaded with
 * the job page's query; while the next one loads the form of the previous one stays (no flash). After a split the
 * Overview refreshes by itself (its query sits under the job lists' key).
 */
export const OverviewAssignTasks = ({
  project,
  jobs,
  timeZone,
  onClose
}: {
  project: OverviewJob["project"];
  jobs: readonly OverviewJob[];
  timeZone: string;
  onClose: () => void;
}) => {
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const detail = useJob(jobId || undefined);
  const [shown, setShown] = useState<JobDetail | null>(null);
  if (detail.data && detail.data.id !== shown?.id) setShown(detail.data);
  const visible = detail.data ?? shown;
  const picker = (
    <JobCodePicker
      projectCode={project.code}
      jobs={jobs}
      value={jobId}
      loading={detail.isFetching && !detail.data}
      timeZone={timeZone}
      onChange={setJobId}
    />
  );
  if (visible) {
    return <SplitTasksDialog key={visible.id} open job={visible} header={picker} onClose={onClose} />;
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chia task · {project.code}</DialogTitle>
          <DialogDescription>Chọn Job Code chưa có task của Project để chia.</DialogDescription>
        </DialogHeader>
        {picker}
        {detail.isError ? (
          <ErrorState size="sm" error={detail.error} onRetry={() => void detail.refetch()} retrying={detail.isFetching} />
        ) : (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Đang tải form Chia task">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
