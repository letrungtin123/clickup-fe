import { cn } from "cn";
import { ChevronDown, Lock, RotateCw } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { JobStatus } from "@/contracts/production-catalog";
import type { JobStatusRef } from "@/contracts/production-jobs";
import { toneClass } from "@/lib/colors";

import { productionErrorMessage } from "../../errors";
import { useJobStatuses } from "../../hooks";
import { useChangeJobStatus } from "../../jobs-hooks";
import { jobStatusBlockedReason, NEW_JOB_READINESS, type JobReadiness } from "../../jobs-model";
import { JobStatusChip } from "./job-bits";

/** Open statuses first, then the closed ones ("Đã đóng"), each in catalog order. */
const splitByClosed = <T extends Pick<JobStatus, "isClosed">>(statuses: readonly T[]) => ({
  open: statuses.filter((status) => !status.isClosed),
  closed: statuses.filter((status) => status.isClosed)
});

// Menu rows: ≥ 40px on phones (and on any touch screen, from the item itself).
const rowClass = "max-sm:min-h-10";

/**
 * "Còn 3 task chưa check" under a status that cannot be chosen yet (PD-045): readable at full contrast (only the chip
 * is dimmed), with a lock so the reason does not rely on colour.
 */
const BlockedHint = ({ reason, id }: { reason: string; id?: string }) => (
  <span id={id} className="flex items-center gap-1 text-[11px] leading-tight text-foreground-muted">
    <Lock className="size-3 shrink-0" aria-hidden="true" />
    {reason}
  </span>
);

/**
 * A job's status (PD-038; PD-045: the only one — the job page has no other status action) in the job header. With
 * `editable` (capabilities.canChangeStatus) the chip opens a menu of every status of the organization — the current
 * one checked, closed ones under "Đã đóng" — and picking one saves it right away; otherwise it is the plain chip (full
 * name in the tooltip). A status marked "Cần mọi task đã check" (e.g. "Đã xong") is shown disabled while the job has no
 * line or lines not yet checked (`readiness`: taskCount / uncheckedTaskCount), with the reason under it; if the API
 * still refuses (409 JOB_NOT_READY, counts changed meanwhile) its message is the toast.
 */
export const JobStatusMenu = ({
  jobId,
  status,
  readiness,
  editable,
  align = "end",
  className
}: {
  jobId: string;
  status: JobStatusRef;
  readiness: JobReadiness;
  editable: boolean;
  align?: "start" | "end";
  className?: string;
}) =>
  editable ? (
    <EditableJobStatus
      jobId={jobId}
      status={status}
      readiness={readiness}
      align={align}
      className={className}
    />
  ) : (
    <JobStatusChip status={status} className={cn("max-w-48", className)} />
  );

const EditableJobStatus = ({
  jobId,
  status,
  readiness,
  align,
  className
}: {
  jobId: string;
  status: JobStatusRef;
  readiness: JobReadiness;
  align: "start" | "end";
  className?: string | undefined;
}) => {
  const statuses = useJobStatuses();
  const change = useChangeJobStatus(jobId);
  const { open, closed } = splitByClosed(statuses.data?.items ?? []);
  const pending = change.isPending;
  const blockedReason = (item: JobStatus) => jobStatusBlockedReason(item, readiness, status.id);

  const pick = (statusId: string) => {
    if (statusId === status.id || pending) return;
    const target = statuses.data?.items.find((item) => item.id === statusId);
    if (target && blockedReason(target)) return;
    change.mutate(statusId, {
      onSuccess: (saved) => toast.success(`Đã chuyển job sang ${saved.jobStatus.name}`),
      onError: (error) => toast.error(productionErrorMessage(error))
    });
  };

  const rows = (items: readonly JobStatus[]) =>
    items.map((item) => {
      const blocked = blockedReason(item);
      return (
        <DropdownMenuRadioItem
          key={item.id}
          value={item.id}
          label={item.name}
          closeOnClick
          disabled={blocked !== null}
          // Disabled: only the chip dims, so the reason under it stays readable (light and dark).
          className={cn(rowClass, blocked && "data-disabled:opacity-100")}
        >
          {blocked ? (
            <span className="flex min-w-0 flex-col items-start gap-0.5 py-0.5">
              <JobStatusChip status={item} className="opacity-60" />
              <BlockedHint reason={blocked} />
            </span>
          ) : (
            <JobStatusChip status={item} />
          )}
        </DropdownMenuRadioItem>
      );
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label={`Trạng thái job: ${status.name}${status.isClosed ? " (đã đóng)" : ""}. Đổi trạng thái`}
        // The button is the touch target (40px tall on phones via touchTargets, without growing the row); the pill
        // inside is what shows.
        className={cn(
          "group/status inline-flex max-w-48 min-w-0 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-progress max-sm:-my-2",
          className
        )}
      >
        <span
          className={cn(
            toneClass(status.color),
            "inline-flex h-6 max-w-full min-w-0 items-center rounded-full bg-(--tone-soft) pr-2 text-(--tone-text) transition-shadow group-hover/status:ring-1 group-hover/status:ring-(--tone)/40 group-data-popup-open/status:ring-1 group-data-popup-open/status:ring-(--tone)/40"
          )}
        >
          <JobStatusChip status={status} className="bg-transparent pr-1" />
          {pending ? (
            <Spinner className="size-3" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
          )}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60 max-w-[calc(100vw-2rem)]">
        {statuses.isPending ? (
          <p className="flex items-center gap-2 px-1.5 py-2 text-sm text-foreground-muted">
            <Spinner className="size-3.5" />
            Đang tải trạng thái…
          </p>
        ) : statuses.isError ? (
          <>
            <p className="px-1.5 py-1.5 text-sm text-danger">
              Không tải được danh sách trạng thái.
            </p>
            <DropdownMenuItem
              closeOnClick={false}
              className={rowClass}
              onClick={() => void statuses.refetch()}
            >
              {statuses.isFetching ? <Spinner /> : <RotateCw />}
              Thử lại
            </DropdownMenuItem>
          </>
        ) : (
          <>
            {open.length > 0 ? (
              <DropdownMenuRadioGroup value={status.id} onValueChange={pick}>
                <DropdownMenuLabel>Trạng thái job</DropdownMenuLabel>
                {rows(open)}
              </DropdownMenuRadioGroup>
            ) : null}
            {closed.length > 0 ? (
              <>
                {open.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuRadioGroup value={status.id} onValueChange={pick}>
                  <DropdownMenuLabel>Đã đóng</DropdownMenuLabel>
                  {rows(closed)}
                </DropdownMenuRadioGroup>
              </>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * "Trạng thái" of the create-job form (PD-038): every status as its chip, open ones first and the closed ones under
 * "Đã đóng". `value` null shows the placeholder (catalog still loading). `readiness` (default: a job being created, no
 * line yet) disables the statuses that need every line checked (PD-045), with the reason under them.
 */
export const JobStatusSelect = ({
  statuses,
  value,
  onChange,
  readiness = NEW_JOB_READINESS,
  placeholder = "Chọn trạng thái",
  disabled,
  id,
  className
}: {
  statuses: readonly JobStatus[];
  value: string | null;
  onChange: (id: string) => void;
  readiness?: JobReadiness;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) => {
  const { open, closed } = splitByClosed(statuses);
  const items = statuses.map((status) => ({ value: status.id, label: status.name }));
  const selected = statuses.find((status) => status.id === value) ?? null;
  const option = (status: JobStatus) => {
    const blocked = jobStatusBlockedReason(status, readiness, value);
    return (
      <SelectItem
        key={status.id}
        value={status.id}
        label={status.name}
        disabled={blocked !== null}
        className={cn(blocked && "data-disabled:opacity-100")}
      >
        {/* The item text never wraps: a long name ends in "…" (full name in the chip's tooltip). */}
        {blocked ? (
          <span className="flex min-w-0 flex-col items-start gap-0.5 py-0.5">
            <JobStatusChip status={status} className="max-w-60 opacity-60" />
            <BlockedHint reason={blocked} />
          </span>
        ) : (
          <JobStatusChip status={status} className="max-w-60" />
        )}
      </SelectItem>
    );
  };
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next: string | null) => next && onChange(next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn("w-full min-w-0", className)}>
        <SelectValue>
          {selected ? (
            <JobStatusChip status={selected} size="sm" />
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72 w-auto max-w-[min(20rem,var(--available-width))] min-w-(--anchor-width)">
        {open.length > 0 ? <SelectGroup>{open.map(option)}</SelectGroup> : null}
        {closed.length > 0 ? (
          <>
            {open.length > 0 ? <SelectSeparator /> : null}
            <SelectGroup>
              <SelectLabel>Đã đóng</SelectLabel>
              {closed.map(option)}
            </SelectGroup>
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
};
