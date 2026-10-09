import { cn } from "cn";
import { AnimatePresence, motion } from "motion/react";
import {
  AlarmClock,
  CalendarOff,
  CheckCheck,
  ChevronDown,
  Clock,
  Flame,
  UsersRound
} from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router";

import { EmptyState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DashboardTask, LeaderDashboard } from "@/contracts/production-reports";
import { toneClass } from "@/lib/colors";

import { formatInteger } from "../../format";
import {
  formatDeadline,
  leaveLabels,
  openLoad,
  sortWorkload,
  teamPointsModel,
  type WorkloadRow,
  type WorkloadSort
} from "../dashboard";
import { formatMinutes } from "../format";
import { ChartSkeleton } from "./report-visual";

const ReportChart = lazy(() =>
  import("./report-chart").then((module) => ({ default: module.ReportChart }))
);

// Late / due-soon tasks --------------------------------------------------------------------------------

const TaskRow = ({
  task,
  tone,
  timeZone
}: {
  task: DashboardTask;
  tone: "late" | "soon";
  timeZone: string;
}) => (
  <Link
    to={`/production/tasks/${task.id}`}
    className="group/task flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-14"
  >
    <span
      aria-hidden="true"
      className={cn("h-9 w-1 shrink-0 rounded-full", tone === "late" ? "bg-danger" : "bg-warning")}
    />
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="shrink-0 font-semibold tabular-nums">#{task.number}</span>
        <span className="truncate text-foreground-muted">{task.job.code}</span>
        <span
          className={cn(
            toneClass(task.status.color),
            "ml-auto inline-flex h-5 shrink-0 items-center rounded-md bg-(--tone-soft) px-1.5 text-[11px] font-medium text-(--tone-text) max-sm:hidden"
          )}
        >
          {task.status.name}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground-muted">
        <UserAvatar user={task.assignee} size="xs" />
        <span className="truncate">{task.assignee.displayName}</span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0 tabular-nums">{formatInteger(task.qtyAssigned)} tấm</span>
      </span>
    </span>
    <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
      <span
        className={cn(
          "text-xs font-semibold tabular-nums",
          tone === "late" ? "text-danger" : "text-warning"
        )}
      >
        {tone === "late"
          ? `Trễ ${formatMinutes(task.minutes)}`
          : `Còn ${formatMinutes(task.minutes)}`}
      </span>
      <span className="text-[11px] text-foreground-subtle tabular-nums">
        {formatDeadline(task.deadline, timeZone)}
      </span>
    </span>
  </Link>
);

const PREVIEW = 6;

export const DashboardTaskList = ({
  tone,
  tasks,
  total,
  dueSoonHours,
  timeZone
}: {
  tone: "late" | "soon";
  tasks: readonly DashboardTask[];
  total: number;
  dueSoonHours: number;
  timeZone: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tasks : tasks.slice(0, PREVIEW);
  const late = tone === "late";
  return (
    <section
      aria-labelledby={`tasks-${tone}`}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-surface shadow-xs",
        late ? "border-danger/25" : "border-warning/30"
      )}
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            late ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
          )}
        >
          {late ? (
            <Flame className="size-4" aria-hidden="true" />
          ) : (
            <AlarmClock className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={`tasks-${tone}`} className="text-sm font-semibold">
            {late ? "Task trễ hạn" : "Task sắp đến hạn"}
          </h2>
          <p className="text-xs text-foreground-muted">
            {late
              ? "Quá hạn chót mà chưa Done — trễ nhất ở trên"
              : `Đến hạn trong ${dueSoonHours} giờ tới — gần nhất ở trên`}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums",
            late ? "bg-danger-soft text-danger" : "bg-warning-soft text-foreground"
          )}
          aria-label={`${total} task`}
        >
          {formatInteger(total)}
        </span>
      </header>
      {tasks.length === 0 ? (
        <EmptyState
          size="sm"
          icon={late ? CheckCheck : Clock}
          title={late ? "Không có task trễ" : "Chưa có task sắp đến hạn"}
          description={
            late
              ? "Mọi task đang mở vẫn còn trong hạn."
              : `Không task nào đến hạn trong ${dueSoonHours} giờ tới.`
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-0.5 p-2">
            <AnimatePresence initial={false}>
              {visible.map((task) => (
                <motion.li
                  key={task.id}
                  layout="position"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                >
                  <TaskRow task={task} tone={tone} timeZone={timeZone} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {tasks.length > PREVIEW || total > tasks.length ? (
            <div className="border-t px-2 py-1.5">
              {tasks.length > PREVIEW ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-foreground-muted"
                  onClick={() => setExpanded((value) => !value)}
                >
                  <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
                  {expanded ? "Thu gọn" : `Xem thêm ${tasks.length - PREVIEW} task`}
                </Button>
              ) : null}
              {total > tasks.length ? (
                <p className="px-2 py-1 text-center text-xs text-foreground-subtle">
                  Đang hiện {tasks.length}/{formatInteger(total)} task.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};

// Workload -------------------------------------------------------------------------------------------

const LoadBar = ({ row, max }: { row: WorkloadRow; max: number }) => {
  const total = openLoad(row);
  const width = (value: number) => `${max > 0 ? (value / max) * 100 : 0}%`;
  return (
    <span
      className="flex h-2 w-full min-w-16 overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`${row.qtyProcessing} tấm đang làm, ${row.qtyNotStarted} tấm chưa làm`}
    >
      {total > 0 ? (
        <>
          <span className="h-full bg-brand" style={{ width: width(row.qtyProcessing) }} />
          <span
            className="h-full border-l-2 border-surface bg-[color-mix(in_oklch,var(--brand)_35%,var(--surface))]"
            style={{ width: width(row.qtyNotStarted) }}
          />
        </>
      ) : null}
    </span>
  );
};

const LeaveBadge = ({ leave }: { leave: WorkloadRow["leaveToday"] }) =>
  leave ? (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-warning-soft px-1.5 text-[11px] font-medium text-foreground">
      <CalendarOff className="size-3 text-warning" aria-hidden="true" />
      {leaveLabels[leave]}
    </span>
  ) : null;

const sortItems: { value: WorkloadSort; label: string }[] = [
  { value: "load", label: "Đang tải" },
  { value: "done", label: "Done hôm nay" },
  { value: "name", label: "Tên" }
];

const ALL_TEAMS = "__all";

export const WorkloadPanel = ({
  rows,
  mobile
}: {
  rows: readonly WorkloadRow[];
  mobile: boolean;
}) => {
  const [sort, setSort] = useState<WorkloadSort>("load");
  const [team, setTeam] = useState<string>(ALL_TEAMS);
  const teams = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of rows) names.set(row.teamId ?? "", row.teamName ?? "Chưa có team");
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1], "vi"));
  }, [rows]);
  const filtered = team === ALL_TEAMS ? rows : rows.filter((row) => (row.teamId ?? "") === team);
  const sorted = sortWorkload(filtered, sort);
  const max = Math.max(0, ...filtered.map(openLoad));
  const teamItems = [
    { value: ALL_TEAMS, label: "Mọi team" },
    ...teams.map(([value, label]) => ({ value, label }))
  ];

  return (
    <section
      aria-labelledby="workload-title"
      className="min-w-0 rounded-xl border bg-surface shadow-xs"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="workload-title" className="text-sm font-semibold">
            Tải việc hôm nay
          </h2>
          <p className="text-xs text-foreground-muted">
            Số tấm chưa làm, đang làm và đã Done hôm nay của từng người (mọi job).
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {teams.length > 1 ? (
            <Select
              items={teamItems}
              value={team}
              onValueChange={(next: string | null) => setTeam(next ?? ALL_TEAMS)}
            >
              <SelectTrigger size="sm" className="min-w-32" aria-label="Lọc theo team">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teamItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <ToggleGroup
            value={[sort]}
            onValueChange={(next: string[]) => next[0] && setSort(next[0] as WorkloadSort)}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Sắp xếp"
          >
            {sortItems.map((item) => (
              <ToggleGroupItem
                key={item.value}
                value={item.value}
                className="px-2.5 max-sm:min-w-10"
              >
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </header>
      {sorted.length === 0 ? (
        <EmptyState
          size="sm"
          icon={UsersRound}
          title="Chưa có ai"
          description="Không có nhân viên nào trong team này."
        />
      ) : mobile ? (
        <ul className="divide-y">
          {sorted.map((row) => (
            <li key={row.user.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <UserAvatar user={row.user} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{row.user.displayName}</span>
                  <span className="truncate text-xs text-foreground-subtle">
                    {row.teamName ?? "Chưa có team"}
                  </span>
                </span>
                <LeaveBadge leave={row.leaveToday} />
              </div>
              <LoadBar row={row} max={max} />
              <dl className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                <div>
                  <dt className="text-foreground-muted">Chưa làm</dt>
                  <dd className="font-medium">{formatInteger(row.qtyNotStarted)} tấm</dd>
                </div>
                <div>
                  <dt className="text-foreground-muted">Đang làm</dt>
                  <dd className="font-medium">{formatInteger(row.qtyProcessing)} tấm</dd>
                </div>
                <div>
                  <dt className="text-foreground-muted">Done hôm nay</dt>
                  <dd className="font-medium">
                    {formatInteger(row.qtyDoneToday)} tấm · {row.tasksDoneToday} task
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <div className="max-h-[32rem] overflow-auto overscroll-contain">
          <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-xs text-foreground-muted">
                {["Nhân viên", "Tải việc", "Chưa làm", "Đang làm", "Task mở", "Done hôm nay"].map(
                  (label, index) => (
                    <th
                      key={label}
                      scope="col"
                      className={cn(
                        "sticky top-0 z-10 border-b bg-surface-raised px-3 py-2 font-medium whitespace-nowrap",
                        index === 0 ? "text-left" : index === 1 ? "w-40 text-left" : "text-right"
                      )}
                    >
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, index) => (
                <tr key={row.user.id} className="hover:bg-surface-hover">
                  <th
                    scope="row"
                    className={cn("px-3 py-2 text-left font-normal", index > 0 && "border-t")}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <UserAvatar user={row.user} size="sm" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{row.user.displayName}</span>
                        <span className="truncate text-xs text-foreground-subtle">
                          {row.teamName ?? "Chưa có team"}
                        </span>
                      </span>
                      <LeaveBadge leave={row.leaveToday} />
                    </span>
                  </th>
                  <td className={cn("px-3 py-2", index > 0 && "border-t")}>
                    <LoadBar row={row} max={max} />
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      index > 0 && "border-t",
                      row.qtyNotStarted === 0 && "text-foreground-subtle"
                    )}
                  >
                    {formatInteger(row.qtyNotStarted)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      index > 0 && "border-t",
                      row.qtyProcessing === 0 && "text-foreground-subtle"
                    )}
                  >
                    {formatInteger(row.qtyProcessing)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      index > 0 && "border-t",
                      row.openTasks === 0 && "text-foreground-subtle"
                    )}
                  >
                    {row.openTasks}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right whitespace-nowrap tabular-nums",
                      index > 0 && "border-t"
                    )}
                  >
                    <span
                      className={row.qtyDoneToday === 0 ? "text-foreground-subtle" : "font-medium"}
                    >
                      {formatInteger(row.qtyDoneToday)} tấm
                    </span>
                    <span className="text-xs text-foreground-subtle">
                      {" "}
                      · {row.tasksDoneToday} task
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-foreground-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-brand" />
          Đang làm
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm bg-[color-mix(in_oklch,var(--brand)_35%,var(--surface))]"
          />
          Chưa làm
        </span>
      </footer>
    </section>
  );
};

// Team points ----------------------------------------------------------------------------------------

export const TeamPointsPanel = ({ teamPoints }: { teamPoints: LeaderDashboard["teamPoints"] }) => {
  const [key, setKey] = useState<"points" | "pointsKhoan">("points");
  const model = useMemo(() => teamPointsModel(teamPoints, key), [teamPoints, key]);
  const empty = teamPoints.series.every((series) => series[key].every((value) => value === 0));
  return (
    <section
      aria-labelledby="team-points-title"
      className="min-w-0 rounded-xl border bg-surface shadow-xs"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="team-points-title" className="text-sm font-semibold">
            Điểm team theo tuần
          </h2>
          <p className="text-xs text-foreground-muted">
            8 tuần gần nhất, tính theo ngày ghi điểm (tuần bắt đầu thứ Hai).
          </p>
        </div>
        <ToggleGroup
          value={[key]}
          onValueChange={(next: string[]) => next[0] && setKey(next[0] as "points" | "pointsKhoan")}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Loại điểm"
        >
          <ToggleGroupItem value="points" className="px-2.5">
            Điểm
          </ToggleGroupItem>
          <ToggleGroupItem value="pointsKhoan" className="px-2.5">
            Điểm khoán
          </ToggleGroupItem>
        </ToggleGroup>
      </header>
      {empty ? (
        <EmptyState
          size="sm"
          icon={UsersRound}
          title="Chưa có điểm trong 8 tuần gần nhất"
          description="Điểm xuất hiện khi task được Done hoặc QC xong."
        />
      ) : (
        <div className="p-4">
          <Suspense fallback={<ChartSkeleton />}>
            <ReportChart
              model={model}
              kind="BAR"
              stacked
              format="points"
              measureLabel={key === "points" ? "Điểm" : "Điểm khoán"}
            />
          </Suspense>
        </div>
      )}
    </section>
  );
};
