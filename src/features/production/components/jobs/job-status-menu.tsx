import { cn } from "cn";
import { ChevronDown, RotateCw } from "lucide-react";
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
import { JobStatusChip } from "./job-bits";

/** Open statuses first, then the closed ones ("Đã đóng"), each in catalog order. */
const splitByClosed = <T extends Pick<JobStatus, "isClosed">>(statuses: readonly T[]) => ({
  open: statuses.filter((status) => !status.isClosed),
  closed: statuses.filter((status) => status.isClosed)
});

// Menu rows: ≥ 40px on phones (and on any touch screen, from the item itself).
const rowClass = "max-sm:min-h-10";

/**
 * A job's manual status (PD-038) in the job header. With `editable` (capabilities.canChangeStatus) the chip opens a
 * menu of every status of the organization — the current one checked, closed ones under "Đã đóng" — and picking one
 * saves it right away; otherwise it is the plain chip (full name in the tooltip).
 */
export const JobStatusMenu = ({
  jobId,
  status,
  editable,
  align = "end",
  className
}: {
  jobId: string;
  status: JobStatusRef;
  editable: boolean;
  align?: "start" | "end";
  className?: string;
}) =>
  editable ? (
    <EditableJobStatus jobId={jobId} status={status} align={align} className={className} />
  ) : (
    <JobStatusChip status={status} className={cn("max-w-48", className)} />
  );

const EditableJobStatus = ({
  jobId,
  status,
  align,
  className
}: {
  jobId: string;
  status: JobStatusRef;
  align: "start" | "end";
  className?: string | undefined;
}) => {
  const statuses = useJobStatuses();
  const change = useChangeJobStatus(jobId);
  const { open, closed } = splitByClosed(statuses.data?.items ?? []);
  const pending = change.isPending;

  const pick = (statusId: string) => {
    if (statusId === status.id || pending) return;
    change.mutate(statusId, {
      onSuccess: (saved) => toast.success(`Đã chuyển job sang ${saved.jobStatus.name}`),
      onError: (error) => toast.error(productionErrorMessage(error))
    });
  };

  const rows = (items: readonly JobStatus[]) =>
    items.map((item) => (
      <DropdownMenuRadioItem
        key={item.id}
        value={item.id}
        label={item.name}
        closeOnClick
        className={rowClass}
      >
        <JobStatusChip status={item} />
      </DropdownMenuRadioItem>
    ));

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
 * "Đã đóng". `value` null shows the placeholder (catalog still loading).
 */
export const JobStatusSelect = ({
  statuses,
  value,
  onChange,
  placeholder = "Chọn trạng thái",
  disabled,
  id,
  className
}: {
  statuses: readonly JobStatus[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) => {
  const { open, closed } = splitByClosed(statuses);
  const items = statuses.map((status) => ({ value: status.id, label: status.name }));
  const selected = statuses.find((status) => status.id === value) ?? null;
  const option = (status: JobStatus) => (
    <SelectItem key={status.id} value={status.id} label={status.name}>
      {/* The item text never wraps: a long name ends in "…" (full name in the chip's tooltip). */}
      <JobStatusChip status={status} className="max-w-60" />
    </SelectItem>
  );
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
