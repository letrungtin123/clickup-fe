import { cn } from "cn";
import { CalendarCheck } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OverviewDueList, OverviewDueTask } from "@/contracts/production-overview";

import { StatusChip } from "../../components/jobs/job-bits";
import { formatInteger } from "../../format";
import { isoToZoned, relativeDeadline } from "../../jobs-model";
import { useOpenTask } from "../../task-link";
import { dayMonth, weekdayOf } from "../model";

type DueTab = "today" | "week";

/**
 * PD-076 "Task sắp đến hạn": open (not finished) lines due today / this week (Monday – Sunday), soonest first. Lines of
 * the window already past their Ngày giao and not Done are marked "trễ …" in red; a Done line waiting for QC shows its
 * status and due time. A row opens the task (`?ptask=`). Not tied to the date filter.
 */
export const DueTasks = ({
  dueToday,
  dueThisWeek,
  timeZone
}: {
  dueToday: OverviewDueList;
  dueThisWeek: OverviewDueList;
  timeZone: string;
}) => {
  const [tab, setTab] = useState<DueTab>("today");
  const list = tab === "today" ? dueToday : dueThisWeek;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Tabs value={tab} onValueChange={(next) => setTab(next === "week" ? "week" : "today")}>
        <TabsList variant="line" aria-label="Hạn task" className="h-9 gap-4">
          <TabsTrigger value="today" className="group/due-tab flex-none px-0.5 max-sm:min-h-10">
            Hôm nay <DueCount value={dueToday.total} />
          </TabsTrigger>
          <TabsTrigger value="week" className="group/due-tab flex-none px-0.5 max-sm:min-h-10">
            Tuần này <DueCount value={dueThisWeek.total} />
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {list.items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={CalendarCheck}
          title={tab === "today" ? "Không có task nào đến hạn hôm nay" : "Không có task nào đến hạn tuần này"}
          description="Task chưa xong có Ngày giao trong khoảng này sẽ hiện ở đây, sớm nhất trước."
        />
      ) : (
        <>
          <ul className="-mx-2 flex flex-col" aria-label={tab === "today" ? "Task đến hạn hôm nay" : "Task đến hạn tuần này"}>
            {list.items.map((task) => (
              <li key={task.id}>
                <DueRow task={task} timeZone={timeZone} showDay={tab === "week"} />
              </li>
            ))}
          </ul>
          {list.total > list.items.length ? (
            <p className="text-center text-xs text-foreground-muted">
              {formatInteger(list.items.length)} / {formatInteger(list.total)} task có hạn sớm nhất.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};

const DueCount = ({ value }: { value: number }) => (
  <span className="min-w-5 rounded-full bg-muted px-1.5 text-center text-[11px] leading-4 font-semibold text-foreground-muted tabular-nums group-data-active/due-tab:bg-brand-soft group-data-active/due-tab:text-brand-text">
    {formatInteger(value)}
  </span>
);

const DueRow = ({ task, timeZone, showDay }: { task: OverviewDueTask; timeZone: string; showDay: boolean }) => {
  const openTask = useOpenTask();
  const due = isoToZoned(task.deadline, timeZone);
  const relative = relativeDeadline(task.deadline);
  const when = showDay ? `${weekdayOf(due.day)} ${dayMonth(due.day)} · ${due.time}` : due.time;
  return (
    <button
      type="button"
      onClick={() => openTask(task.id)}
      className={cn(
        "relative flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left outline-none",
        "transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
      )}
      aria-label={`#${task.code} ${task.process.name}, ${task.jobCode}, ${task.assignee.displayName}, hạn ${when}${task.overdue ? `, ${relative.label}` : ""}`}
    >
      {task.overdue ? (
        <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-danger" />
      ) : null}
      <UserAvatar user={task.assignee} size="md" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium">
          #{task.code} · {task.process.name}
        </span>
        <span className="truncate text-xs text-foreground-muted">
          {task.assignee.displayName} · {task.jobCode} · {task.project.code}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusChip status={task.status} size="sm" className="max-w-28 max-sm:max-w-24" />
        <span
          className={cn(
            "text-[11px] whitespace-nowrap tabular-nums",
            task.overdue ? "font-semibold text-danger" : "text-foreground-muted"
          )}
        >
          {task.overdue
            ? relative.label
            : relative.late
              ? `hạn ${when}`
              : showDay
                ? when
                : `${relative.label} · ${when}`}
        </span>
      </span>
    </button>
  );
};
