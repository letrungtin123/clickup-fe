import { cn } from "cn";
import { CalendarCheck2, CalendarPlus } from "lucide-react";
import { motion } from "motion/react";

import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import type { LeaveRequest } from "@/contracts/production-leave";

import { formatNumber } from "../../format";
import {
  formatLeaveDates,
  isSunday,
  leaveLoad,
  leavePartLabels,
  type LeaveDayEntry
} from "../calendar";
import { LeaveAvatar, LeaveStatusBadge } from "./leave-bits";

const weekdayHeads = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const weekdayNames = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];

const weekdayOf = (day: string) => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
};
const dayTitle = (day: string) =>
  `${weekdayNames[weekdayOf(day)]}, ${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

const peopleCount = (entries: readonly LeaveDayEntry[]) => {
  const load = leaveLoad(entries);
  return `${entries.length} người nghỉ${load !== entries.length ? ` (${formatNumber(load)} ngày công)` : ""}`;
};

/**
 * Month grid (tablet/desktop): Monday-first weeks, each day shows avatars of people on leave —
 * approved solid, pending dashed, half days marked S/C. Selecting a day opens its detail list.
 */
export const LeaveMonthGrid = ({
  weeks,
  byDay,
  today,
  selected,
  onSelect,
  maxAvatars,
  withNames = false
}: {
  weeks: { day: string; inMonth: boolean }[][];
  byDay: ReadonlyMap<string, LeaveDayEntry[]>;
  today: string;
  selected: string | null;
  onSelect: (day: string) => void;
  maxAvatars: number;
  /** Wide cells: one line per person (avatar + name) instead of an avatar row. */
  withNames?: boolean;
}) => (
  <div role="grid" aria-label="Lịch nghỉ theo tháng" className="flex flex-col">
    <div role="row" className="grid grid-cols-7 border-b">
      {weekdayHeads.map((head, index) => (
        <span
          key={head}
          role="columnheader"
          className={cn(
            "px-2 py-2 text-center text-xs font-medium text-foreground-muted",
            index === 6 && "text-foreground-subtle"
          )}
        >
          {head}
        </span>
      ))}
    </div>
    {weeks.map((week) => (
      <div key={week[0]?.day} role="row" className="grid grid-cols-7 border-b last:border-b-0">
        {week.map(({ day, inMonth }) => {
          const entries = byDay.get(day) ?? [];
          const visible = entries.slice(0, maxAvatars);
          const hidden = entries.length - visible.length;
          const isToday = day === today;
          const isSelected = day === selected;
          return (
            <div key={day} role="gridcell" aria-selected={isSelected} className="min-w-0 border-r last:border-r-0">
              <button
                type="button"
                onClick={() => onSelect(day)}
                aria-label={`${dayTitle(day)}${entries.length > 0 ? `: ${peopleCount(entries)}` : ": không ai nghỉ"}`}
                className={cn(
                  "flex h-24 w-full min-w-0 flex-col gap-1.5 p-1.5 text-left outline-none transition-colors duration-100 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:h-28 lg:p-2",
                  !inMonth && "bg-muted/40 text-foreground-subtle",
                  inMonth && isSunday(day) && "bg-muted/25",
                  isSelected && "bg-brand-soft/60 hover:bg-brand-soft/70"
                )}
              >
                <span className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      isToday ? "bg-brand font-semibold text-brand-foreground" : inMonth ? "font-medium" : ""
                    )}
                  >
                    {Number(day.slice(8, 10))}
                  </span>
                  {entries.length > 0 ? (
                    <span className="text-[10px] text-foreground-muted tabular-nums">{entries.length}</span>
                  ) : null}
                </span>
                {entries.length > 0 && withNames ? (
                  <span className="flex min-w-0 flex-col gap-1">
                    {visible.map((entry) => (
                      <span key={entry.request.id} className="flex min-w-0 items-center gap-2 text-[11px]">
                        <LeaveAvatar
                          user={entry.request.user}
                          part={entry.part}
                          status={entry.request.status}
                          size="xs"
                        />
                        <span
                          className={cn(
                            "truncate",
                            entry.request.status === "PENDING" && "text-foreground-muted italic"
                          )}
                        >
                          {entry.request.user.displayName}
                        </span>
                      </span>
                    ))}
                    {hidden > 0 ? (
                      <span className="pl-0.5 text-[10px] font-medium text-foreground-muted">+{hidden} người</span>
                    ) : null}
                  </span>
                ) : entries.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-1.5 pl-0.5">
                    {visible.map((entry) => (
                      <LeaveAvatar
                        key={entry.request.id}
                        user={entry.request.user}
                        part={entry.part}
                        status={entry.request.status}
                        size="xs"
                      />
                    ))}
                    {hidden > 0 ? (
                      <span className="text-[10px] font-medium text-foreground-muted">+{hidden}</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    ))}
  </div>
);

/** People on leave on one day (with actions for leaders / owners). */
export const LeaveDayDetail = ({
  day,
  entries,
  onRequest,
  renderActions
}: {
  day: string;
  entries: readonly LeaveDayEntry[];
  onRequest: (day: string) => void;
  renderActions: (request: LeaveRequest) => React.ReactNode;
}) => (
  <motion.div
    key={day}
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.15 }}
    className="flex flex-col"
  >
    <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <p className="truncate text-sm font-semibold">{dayTitle(day)}</p>
        <p className="text-xs text-foreground-muted">
          {entries.length > 0 ? peopleCount(entries) : "Không ai nghỉ"}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => onRequest(day)}>
        <CalendarPlus />
        Xin nghỉ ngày này
      </Button>
    </div>
    {entries.length === 0 ? (
      <EmptyState
        size="sm"
        icon={CalendarCheck2}
        title={isSunday(day) ? "Ngày nghỉ cuối tuần" : "Cả team đi làm đủ"}
      />
    ) : (
      <ul className="flex flex-col divide-y">
        {entries.map((entry) => (
          <DayEntry key={entry.request.id} entry={entry} actions={renderActions(entry.request)} />
        ))}
      </ul>
    )}
  </motion.div>
);

const DayEntry = ({ entry, actions }: { entry: LeaveDayEntry; actions: React.ReactNode }) => (
  <li className="flex flex-col gap-2 px-4 py-2.5">
    <div className="flex items-start gap-3">
      <LeaveAvatar user={entry.request.user} part={entry.part} status={entry.request.status} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span className="truncate font-medium">{entry.request.user.displayName}</span>
          <LeaveStatusBadge status={entry.request.status} />
        </p>
        <p className="text-xs text-foreground-muted">
          {leavePartLabels[entry.part]} · {formatLeaveDates(entry.request.fromDate, entry.request.toDate)}
          {entry.request.team ? ` · ${entry.request.team.name}` : ""}
        </p>
        {entry.request.note ? (
          <p className="text-xs break-words whitespace-pre-line text-foreground-muted">{entry.request.note}</p>
        ) : null}
      </div>
    </div>
    {actions}
  </li>
);

/** Phones: a day-by-day agenda of the month instead of a dense grid. */
export const LeaveAgenda = ({
  days,
  byDay,
  today,
  renderActions
}: {
  days: readonly string[];
  byDay: ReadonlyMap<string, LeaveDayEntry[]>;
  today: string;
  renderActions: (request: LeaveRequest) => React.ReactNode;
}) => {
  const withLeave = days.filter((day) => (byDay.get(day)?.length ?? 0) > 0);
  if (withLeave.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={CalendarCheck2}
        title="Tháng này chưa có ai nghỉ"
        description="Đơn nghỉ đã duyệt (và đơn đang chờ duyệt bạn được xem) hiện ở đây."
      />
    );
  }
  return (
    <ol className="flex flex-col divide-y" aria-label="Lịch nghỉ theo ngày">
      {withLeave.map((day) => {
        const entries = byDay.get(day) ?? [];
        return (
          <li key={day} className="flex flex-col">
            <p
              className={cn(
                "sticky top-0 z-10 flex items-center justify-between gap-2 bg-surface/95 px-4 py-2 text-xs font-semibold backdrop-blur-sm",
                day === today && "text-brand-text"
              )}
            >
              <span>
                {dayTitle(day)}
                {day === today ? " · Hôm nay" : ""}
              </span>
              <span className="font-normal text-foreground-muted">{peopleCount(entries)}</span>
            </p>
            <ul className="flex flex-col">
              {entries.map((entry) => (
                <DayEntry key={entry.request.id} entry={entry} actions={renderActions(entry.request)} />
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
};
