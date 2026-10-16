import { cn } from "cn";
import { CalendarCheck2 } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { LeaveRequest } from "@/contracts/production-leave";

import { formatNumber } from "../../format";
import { formatLeaveDates, formatLeaveDays, leavePartLabels, leaveWorkdays } from "../calendar";
import { LeaveStatusBadge } from "./leave-bits";

const shortDate = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh"
});

const EMPTY = "—";

const Approver = ({ request }: { request: LeaveRequest }) =>
  request.decidedBy ? (
    <span className="flex min-w-0 flex-col">
      <span className="break-words">{request.decidedBy.displayName}</span>
      {request.decidedAt ? (
        <span className="text-[11px] text-foreground-subtle tabular-nums">
          {request.status === "REJECTED" ? "Từ chối" : "Duyệt"}{" "}
          {shortDate.format(new Date(request.decidedAt))}
        </span>
      ) : null}
    </span>
  ) : (
    <span className="text-foreground-subtle">{EMPTY}</span>
  );

const Days = ({ request }: { request: LeaveRequest }) => {
  const workdays = leaveWorkdays(request);
  return (
    <span className="flex flex-col">
      <span className="tabular-nums">{formatLeaveDays(request.days)}</span>
      {workdays !== request.days ? (
        <span className="text-[11px] text-foreground-subtle tabular-nums">
          {formatNumber(workdays)} ngày làm việc
        </span>
      ) : null}
    </span>
  );
};

const Reason = ({ note, className }: { note: string | null; className?: string }) =>
  note ? (
    <span title={note} className={cn("line-clamp-2 break-words whitespace-pre-line", className)}>
      {note}
    </span>
  ) : (
    <span className="text-foreground-subtle">{EMPTY}</span>
  );

/**
 * "Khoảng ngày" view of Lịch nghỉ (PD-057): every request overlapping the chosen days. Desktop and
 * tablet get a table (Nhân viên, Team, Từ – đến, Buổi, Số ngày, Lý do, Trạng thái, Người duyệt and the
 * allowed actions); phones get stacked cards. Reasons and approvers are only filled when the caller
 * may read them (owner, LEADER/ADMIN).
 */
export const LeaveRangeList = ({
  rows,
  mobile,
  renderActions
}: {
  rows: readonly LeaveRequest[];
  mobile: boolean;
  renderActions: (request: LeaveRequest) => ReactNode;
}) => {
  if (rows.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={CalendarCheck2}
        title="Không ai nghỉ trong khoảng này"
        description="Đơn nghỉ đã duyệt (và đơn đang chờ duyệt bạn được xem) hiện ở đây."
      />
    );
  }

  if (mobile) {
    return (
      <ul className="flex flex-col divide-y" aria-label="Đơn nghỉ trong khoảng ngày">
        {rows.map((request) => {
          const actions = renderActions(request);
          return (
            <li key={request.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-start gap-3">
                <UserAvatar user={request.user} size="md" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="flex items-start justify-between gap-2 text-[13px]">
                    <span className="min-w-0 font-medium break-words">
                      {request.user.displayName}
                      {request.team ? (
                        <span className="font-normal text-foreground-muted">
                          {" "}
                          · {request.team.name}
                        </span>
                      ) : null}
                    </span>
                    <LeaveStatusBadge status={request.status} />
                  </p>
                  <p className="text-xs text-foreground-muted tabular-nums">
                    <span className="font-medium text-foreground">
                      {formatLeaveDates(request.fromDate, request.toDate)}
                    </span>{" "}
                    · {leavePartLabels[request.part]} · {formatLeaveDays(request.days)}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg bg-muted/60 px-3 py-2 text-xs">
                <dt className="text-foreground-muted">Lý do</dt>
                <dd className="min-w-0">
                  <Reason note={request.note} />
                </dd>
                <dt className="text-foreground-muted">Người duyệt</dt>
                <dd className="min-w-0">
                  <Approver request={request} />
                </dd>
              </dl>
              {actions}
            </li>
          );
        })}
      </ul>
    );
  }

  const withActions = rows.some((request) => renderActions(request) !== null);
  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[56rem] text-[13px]">
        <caption className="sr-only">Đơn nghỉ trong khoảng ngày đã chọn</caption>
        <thead>
          <tr className="border-b text-xs whitespace-nowrap text-foreground-muted">
            <th scope="col" className="py-2.5 pr-3 pl-4 text-left font-medium">
              Nhân viên
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Team
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Từ – đến
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Buổi
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Số ngày
            </th>
            <th scope="col" className="w-[24%] px-3 py-2.5 text-left font-medium">
              Lý do
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Trạng thái
            </th>
            <th
              scope="col"
              className={cn("py-2.5 pl-3 text-left font-medium", withActions ? "pr-3" : "pr-4")}
            >
              Người duyệt
            </th>
            {withActions ? (
              <th scope="col" className="py-2.5 pr-4 pl-3 text-right font-medium">
                <span className="sr-only">Thao tác</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {rows.map((request) => (
            <tr key={request.id} className="align-top transition-colors hover:bg-surface-hover/60">
              <td className="py-2.5 pr-3 pl-4">
                <span className="flex min-w-0 items-center gap-2">
                  <UserAvatar user={request.user} size="sm" />
                  <span className="min-w-0 font-medium break-words">
                    {request.user.displayName}
                  </span>
                </span>
              </td>
              <td className="px-3 py-2.5 text-foreground-muted">
                {request.team?.name ?? <span className="text-foreground-subtle">{EMPTY}</span>}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                {formatLeaveDates(request.fromDate, request.toDate)}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">{leavePartLabels[request.part]}</td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                <Days request={request} />
              </td>
              <td className="px-3 py-2.5 text-foreground-muted">
                <Reason note={request.note} />
              </td>
              <td className="px-3 py-2.5">
                <LeaveStatusBadge status={request.status} />
              </td>
              <td className={cn("py-2.5 pl-3", withActions ? "pr-3" : "pr-4")}>
                <Approver request={request} />
              </td>
              {withActions ? (
                <td className="py-2 pr-4 pl-3 text-right">{renderActions(request)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
