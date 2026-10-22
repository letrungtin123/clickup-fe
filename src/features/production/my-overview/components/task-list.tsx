import { cn } from "cn";
import { CheckCircle2, FolderOpen, Inbox, Play } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { ProductionStatus } from "@/contracts/production-catalog";
import type {
  MyOverview,
  MyOverviewStatusCount,
  MyOverviewTask
} from "@/contracts/production-my-overview";

import { copyText, dialogAround } from "../../clipboard";
import { StatusChip } from "../../components/jobs/job-bits";
import { myOverviewCopy as copy } from "../copy";
import {
  deadlineHint,
  deadlineText,
  imagesText,
  myTaskActions,
  parseDoneQty,
  withQcText,
  type MyOverviewFilter
} from "../model";
import { hintTone, rowGrid } from "../styles";
import type { useMyMoves } from "../use-my-moves";

type Moves = ReturnType<typeof useMyMoves>;

/** "#1361 · AXP · Batch 07" — opens the task sheet. */
export const TaskTitle = ({
  task,
  onOpen
}: {
  task: MyOverviewTask["task"];
  onOpen: (taskId: string) => void;
}) => (
  <button
    type="button"
    onClick={() => onOpen(task.id)}
    aria-label={copy.list.openTask(task.code)}
    className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span className="font-semibold tabular-nums hover:underline">#{task.code}</span>
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11.5px] font-semibold">
      {task.project.code}
    </span>
    <span className="min-w-0 truncate font-medium">{task.jobCode}</span>
  </button>
);

/** "Copy folder": the job's drive / folder link (else the line's "Link chia việc"). */
export const CopyFolderButton = ({ link, code }: { link: string | null; code: string }) => (
  <Button
    type="button"
    variant="outline"
    size="xs"
    disabled={!link}
    title={link ?? copy.list.noFolder}
    aria-label={copy.list.copyFolderLabel(code)}
    onClick={(event) => {
      if (!link) return;
      void copyText(link, dialogAround(event.currentTarget)).then((copied) =>
        copied ? toast.success(copy.list.copied) : toast.error(copy.list.copyFailed)
      );
    }}
  >
    <FolderOpen aria-hidden="true" />
    {copy.list.copyFolder}
  </Button>
);

/** One of my lines: task, detail, deadline, status and its quick action; a sent-back line shows the QC's note. */
const MyTaskRow = ({
  line,
  now,
  timeZone,
  today,
  statuses,
  moves,
  onOpen
}: {
  line: MyOverviewTask;
  now: Date;
  timeZone: string;
  today: string;
  statuses: readonly ProductionStatus[];
  moves: Moves;
  onOpen: (taskId: string) => void;
}) => {
  const task = line.task;
  const ids = useId();
  const [doneOpen, setDoneOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const actions = moves.lookup.isError
    ? { start: null, done: null }
    : myTaskActions(task, statuses);
  const busy = moves.busyId === task.id;
  const hint = deadlineHint(line, now, timeZone);
  const openDone = () => {
    setQty(task.qtyAssigned === null ? "" : String(task.qtyAssigned));
    setError(null);
    setDoneOpen(true);
  };
  const confirm = async () => {
    if (!actions.done) return;
    const parsed = parseDoneQty(qty, task);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    if (await moves.done(task, actions.done, parsed.value)) setDoneOpen(false);
  };
  let action: ReactNode = null;
  if (actions.start) {
    const start = actions.start;
    action = (
      <Button
        size="sm"
        disabled={busy}
        onClick={() => void moves.simple(task, start, copy.actions.startToast(task.code))}
      >
        <Play aria-hidden="true" />
        {copy.actions.start}
      </Button>
    );
  } else if (actions.done && !doneOpen) {
    action = (
      <Button size="sm" disabled={busy} onClick={openDone}>
        <CheckCircle2 aria-hidden="true" />
        {copy.actions.done}
      </Button>
    );
  } else if (line.withQc) {
    action = (
      <span className="text-xs text-foreground-muted">{withQcText(line, timeZone, today)}</span>
    );
  } else if (task.jobArchived) {
    action = <span className="text-xs text-foreground-subtle">{copy.actions.archived}</span>;
  }
  const qcName = task.lastQcFail?.by?.displayName ?? null;
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-2.5 border-t px-4 py-3 first:border-t-0 sm:px-5",
        line.rework && "shadow-[inset_3px_0_0_var(--danger)]"
      )}
    >
      <div className={rowGrid}>
        <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
          <TaskTitle task={task} onOpen={onOpen} />
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] text-foreground-muted">
            <span className="min-w-0">
              {task.process.name} · <span className="tabular-nums">{imagesText(line)}</span>
            </span>
            <CopyFolderButton link={line.folderLink} code={task.code} />
          </div>
        </div>
        <div className="flex flex-[0_0_auto] flex-col gap-0.5 sm:min-w-[9rem]">
          <span className="text-[13px] font-medium tabular-nums">
            {deadlineText(task.deadline, timeZone, today)}
          </span>
          <span className={cn("text-xs font-semibold", hintTone[hint.tone])}>{hint.text}</span>
        </div>
        <div className="min-w-0">
          <StatusChip status={task.status} />
        </div>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-2 text-right md:ml-0">
          {action}
        </div>
      </div>
      {line.rework && task.lastQcFail ? (
        <p className="flex min-w-0 items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <b className="shrink-0 font-semibold">
            {qcName ? copy.list.qcNote(qcName) : copy.list.qcNoteAnonymous}
          </b>
          <span className="min-w-0 break-words">
            {task.lastQcFail.note ? `“${task.lastQcFail.note}”` : copy.list.noNote}
          </span>
        </p>
      ) : null}
      {doneOpen && actions.done ? (
        <form
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-brand/40 bg-muted/40 px-3 py-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <label htmlFor={`${ids}-qty`} className="text-[13px] font-medium">
            {copy.actions.doneField}
          </label>
          <Input
            id={`${ids}-qty`}
            autoFocus
            inputMode="numeric"
            value={qty}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${ids}-hint`}
            onChange={(event) => {
              setQty(event.target.value);
              setError(null);
            }}
            className="h-8 w-20 text-right tabular-nums"
          />
          <span
            id={`${ids}-hint`}
            className={cn(
              "min-w-0 flex-1 basis-40 text-xs",
              error ? "text-danger" : "text-foreground-muted"
            )}
          >
            {error ??
              (task.subtasks.length > 0
                ? copy.actions.doneHintSubtasks
                : copy.actions.doneHint(task.qc?.displayName ?? null))}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDoneOpen(false)}
              disabled={busy}
            >
              {copy.actions.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {copy.actions.confirmDone}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
};

const ALL = "all";

/** The list's "Trạng thái" filter: the statuses present in the chosen tag, with their counts. */
const StatusFilter = ({
  counts,
  total,
  value,
  onChange
}: {
  counts: readonly MyOverviewStatusCount[];
  total: number;
  value: string | null;
  onChange: (statusId: string | null) => void;
}) => {
  const items = [
    { value: ALL, label: copy.list.allStatuses(total) },
    ...counts.map((entry) => ({
      value: entry.status.id,
      label: `${entry.status.name} (${entry.count})`
    }))
  ];
  const current = value && items.some((item) => item.value === value) ? value : ALL;
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground-muted">
      <span className="shrink-0">{copy.list.status}</span>
      <Select
        items={items}
        value={current}
        onValueChange={(next: string | null) => onChange(!next || next === ALL ? null : next)}
      >
        <SelectTrigger
          aria-label={copy.list.status}
          size="sm"
          className="w-44 max-w-full min-w-0 text-[13px] font-medium text-foreground"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
};

/** "Việc của tôi": my shown lines, flat, in the server's order, filtered by the chosen tag and status. */
export const MyTaskList = ({
  overview,
  lines,
  filter,
  title,
  onFilter,
  now,
  statuses,
  moves,
  onOpen
}: {
  overview: MyOverview;
  lines: readonly MyOverviewTask[];
  filter: MyOverviewFilter;
  title: string;
  onFilter: (next: MyOverviewFilter) => void;
  now: Date;
  statuses: readonly ProductionStatus[];
  moves: Moves;
  onOpen: (taskId: string) => void;
}) => {
  const tag = filter.tag === "qc" ? "mine" : filter.tag;
  const filtered = filter.tag !== "mine" || filter.statusId !== null;
  return (
    <section
      aria-labelledby="my-overview-list"
      className="min-w-0 overflow-hidden rounded-xl border bg-surface shadow-xs"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="my-overview-list" className="text-[15px] font-semibold">
            {title}
            <span className="ml-1.5 text-[13px] font-normal text-foreground-muted tabular-nums">
              · {lines.length}
            </span>
          </h2>
          <p className="text-xs text-foreground-muted">{copy.list.order}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusFilter
            counts={overview.statusCounts[tag]}
            total={overview.tags[tag].count}
            value={filter.statusId}
            onChange={(statusId) => onFilter({ tag, statusId })}
          />
          {filtered ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onFilter({ tag: "mine", statusId: null })}
            >
              {copy.list.clear}
            </Button>
          ) : null}
        </div>
      </div>
      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-foreground-muted">
          <Inbox className="size-5" aria-hidden="true" />
          {filtered ? copy.list.emptyFiltered : copy.list.empty}
        </div>
      ) : (
        <ul className="min-w-0">
          {lines.map((line) => (
            <MyTaskRow
              key={line.task.id}
              line={line}
              now={now}
              timeZone={overview.timeZone}
              today={overview.today}
              statuses={statuses}
              moves={moves}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
      {overview.truncated ? (
        <p className="border-t px-4 py-2.5 text-xs text-foreground-muted sm:px-5">
          {copy.list.truncated(overview.tasks.length, overview.tags.mine.count)}
        </p>
      ) : null}
    </section>
  );
};
