import { cn } from "cn";
import { Check, ChevronDownIcon, CircleCheck } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { JobStatus } from "@/contracts/production-catalog";
import type { JobOption } from "@/contracts/production-jobs";
import { useDebouncedValue } from "@/features/tasks/use-debounced-value";
import { toneClass } from "@/lib/colors";

import { productionErrorMessage } from "../../errors";
import { useJobStatuses } from "../../hooks";
import { useJobOptions } from "../../jobs-hooks";
import { formatWorkDay } from "../../jobs-model";
import { touchTargets } from "../../ui";
import { jobOptionsFor, toggleStatusFilter } from "../../work-entry";
import { JobStatusChip } from "./job-bits";

/**
 * "Gói công việc" of "Nhập công việc" (PD-038): picks an EXISTING job of the project — no free text, jobs are created
 * with "Tạo job" only. Looks like the other selects; the list (GET /production/jobs/options) is searched on the server
 * (accents and case ignored) and can be narrowed to some manual statuses. Open statuses come first, then by Ngày giao.
 * Phones: the list is as wide as the field, never wider than the screen, and scrolls inside the popover.
 */
export const JobOptionPicker = ({
  id,
  projectId,
  value,
  onChange,
  timeZone,
  invalid,
  disabled,
  className,
  "aria-label": label = "Gói công việc",
  "aria-describedby": describedBy
}: {
  id?: string;
  /** Nothing to pick before a project is chosen. */
  projectId: string | null;
  value: JobOption | null;
  onChange: (job: JobOption) => void;
  /** Organization timezone (Ngày giao is a work day there). */
  timeZone: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  // Empty = every status ("Tất cả"); kept while the dialog is open.
  const [statusIds, setStatusIds] = useState<string[]>([]);
  const q = useDebouncedValue(term.trim(), 250);
  const inactive = disabled || !projectId;

  const statuses = useJobStatuses(!inactive);
  const query = useMemo(
    () => (projectId ? { projectId, q: q || undefined, statusIds } : null),
    [projectId, q, statusIds]
  );
  // Fetched as soon as a project is chosen, so the list is there when it opens.
  const options = useJobOptions(query, !inactive);
  const items = jobOptionsFor(options.data?.items, projectId);
  // Keyboard highlight: cmdk keeps a value that may have left the list after a new search (filtering is on the
  // server), so Enter would pick nothing. Follow the first option whenever the highlighted one is gone.
  const [highlight, setHighlight] = useState("");
  const highlighted = items.some((item) => item.id === highlight)
    ? highlight
    : (items[0]?.id ?? "");
  // The previous answer (another search or project) stays while the next one loads: dimmed, or "Đang tải…" when
  // nothing of it belongs to this project.
  const stale = options.isPlaceholderData && options.isFetching;
  const loading = options.isPending || (stale && items.length === 0);
  // The trigger shows the freshest copy of the picked job (its status may have changed).
  const shown = value ? (items.find((item) => item.id === value.id) ?? value) : null;

  const pick = (job: JobOption) => {
    onChange(job);
    setOpen(false);
    setTerm("");
  };

  return (
    <Popover
      open={open && !inactive}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTerm("");
      }}
    >
      <PopoverTrigger
        id={id}
        disabled={inactive}
        data-slot="select-trigger"
        data-size="default"
        aria-label={shown ? `${label}: ${shown.code}` : label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-1 pr-2 pl-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 pointer-coarse:h-10 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
      >
        {shown ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span title={shown.code} className="min-w-0 flex-1 truncate">
              {shown.code}
            </span>
            <JobStatusChip status={shown.jobStatus} size="sm" className="max-w-[45%] shrink-0" />
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {projectId ? "Chọn gói công việc" : "Chọn dự án trước"}
          </span>
        )}
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none size-4 shrink-0 text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // As wide as the field (full width in the phone sheet), never wider than the screen; the list scrolls inside.
        className={cn(
          "max-h-[min(22rem,var(--available-height))] w-(--anchor-width) max-w-[min(calc(100vw-2rem),var(--available-width))] gap-0 overflow-hidden p-0",
          touchTargets
        )}
      >
        {/* `label`: the search box's accessible name (cmdk labels its input with it). */}
        <Command
          shouldFilter={false}
          loop
          label="Tìm gói công việc"
          value={highlighted}
          onValueChange={setHighlight}
          className="min-h-0 flex-1"
        >
          {/* The first tabbable element: focused when opened with a mouse or the keyboard (not on touch). */}
          <CommandInput value={term} onValueChange={setTerm} placeholder="Tìm gói công việc…" />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <StatusFilter
              statuses={statuses.data?.items ?? []}
              value={statusIds}
              onChange={setStatusIds}
            />
            {options.isError ? (
              <div role="alert" className="flex flex-col items-center gap-2 px-3 py-5 text-center">
                <p className="text-sm text-destructive">{productionErrorMessage(options.error)}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={options.isFetching}
                  onClick={() => void options.refetch()}
                >
                  {options.isFetching ? <Spinner /> : null}
                  Thử lại
                </Button>
              </div>
            ) : loading ? (
              <p
                role="status"
                className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-foreground-muted"
              >
                <Spinner />
                Đang tải…
              </p>
            ) : items.length === 0 ? (
              <div role="status" className="px-3 py-6 text-center text-sm">
                <p className="text-foreground-muted">Không có job phù hợp</p>
                {q === "" && statusIds.length === 0 ? (
                  <p className="mt-1 text-xs text-foreground-subtle">
                    Dự án chưa có gói nào — Leader / Account tạo bằng “Tạo job”.
                  </p>
                ) : null}
              </div>
            ) : (
              <CommandList
                aria-label="Gói công việc của dự án"
                aria-busy={stale || undefined}
                // The surrounding box scrolls (status chips + list), not the list on its own.
                className={cn(
                  "max-h-none overflow-visible transition-opacity",
                  stale && "opacity-60"
                )}
              >
                <CommandGroup>
                  {items.map((job) => (
                    <CommandItem
                      key={job.id}
                      value={job.id}
                      data-checked={job.id === value?.id}
                      onSelect={() => pick(job)}
                      className="items-start py-2 [&>svg:last-child]:mt-0.5"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span title={job.code} className="line-clamp-2 [overflow-wrap:anywhere]">
                          {job.code}
                        </span>
                        <span className="flex min-w-0 items-center gap-2 text-xs text-foreground-muted">
                          <JobStatusChip status={job.jobStatus} size="sm" className="max-w-[60%]" />
                          <span className="shrink-0 tabular-nums">
                            Giao {formatWorkDay(job.deadline, timeZone)}
                          </span>
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            )}
          </div>
          {options.data?.truncated && !options.isError && !loading && items.length > 0 ? (
            <p className="shrink-0 border-t px-3 py-2 text-xs text-foreground-subtle">
              Còn nhiều gói khác — gõ để tìm thêm.
            </p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

/**
 * The manual statuses as toggle chips (several at once; none = all). They wrap onto more rows instead of scrolling
 * sideways. Keys stay on the chips (Enter / Space toggle) instead of moving through the list below.
 */
const StatusFilter = ({
  statuses,
  value,
  onChange
}: {
  statuses: readonly Pick<JobStatus, "id" | "name" | "color" | "isClosed">[];
  value: readonly string[];
  onChange: (statusIds: string[]) => void;
}) => {
  if (statuses.length === 0) return null;
  const all = value.length === 0;
  const keepKeys = (event: KeyboardEvent) => {
    if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
  };
  // A mouse click keeps the focus in the search box (typing goes on).
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();
  const chip =
    "inline-flex h-7 max-w-full shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring sm:min-w-0 sm:shrink";
  return (
    <div
      role="group"
      aria-label="Lọc theo trạng thái"
      onKeyDown={keepKeys}
      // Phones: one row that scrolls sideways, so the job list keeps most of the popover height.
      className="flex gap-1 overflow-x-auto overscroll-x-contain px-2 pt-2 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-x-visible"
    >
      <button
        type="button"
        aria-pressed={all}
        onMouseDown={keepFocus}
        onClick={() => onChange([])}
        className={cn(
          chip,
          all
            ? "border-transparent bg-brand-soft text-brand-text"
            : "bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground"
        )}
      >
        {all ? <Check className="size-3 shrink-0" aria-hidden="true" /> : null}
        Tất cả
      </button>
      {statuses.map((status) => {
        const pressed = value.includes(status.id);
        return (
          <button
            key={status.id}
            type="button"
            aria-pressed={pressed}
            title={status.isClosed ? `${status.name} (đã đóng)` : status.name}
            onMouseDown={keepFocus}
            onClick={() => onChange(toggleStatusFilter(value, status.id))}
            className={cn(
              toneClass(status.color),
              chip,
              pressed
                ? "border-transparent bg-(--tone-soft) text-(--tone-text)"
                : "bg-surface text-foreground-muted hover:border-(--tone) hover:text-(--tone-text)"
            )}
          >
            {pressed ? (
              <Check className="size-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
            ) : status.isClosed ? (
              <CircleCheck className="size-3 shrink-0 text-(--tone)" aria-hidden="true" />
            ) : (
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--tone)" />
            )}
            <span className="truncate">{status.name}</span>
          </button>
        );
      })}
    </div>
  );
};
