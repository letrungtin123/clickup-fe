import { cn } from "cn";
import { Bot, History, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { KpiSettlementRun } from "@/contracts/production-scores";

import { formatCredit, formatInteger, formatMoney } from "../../format";
import { Panel } from "../../scores/components/kit";
import { formatDayRange, periodLabel } from "../../scores/periods";
import { useKpiSettlementRuns } from "../hooks";

const dateTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh"
});

/** Settlement run history (SPEC Phase 6 §5 "lịch sử các lần chạy"), newest first. */
export const SettlementRuns = () => {
  const runs = useKpiSettlementRuns(null);
  return (
    <Panel
      title="Lịch sử chạy chốt"
      description="Mỗi lần chạy (tự động hoặc chạy tay) được lưu lại; kết quả hiện hành của kỳ lấy từ lần chạy mới nhất."
    >
      {runs.isPending ? (
        <div className="flex flex-col gap-2 p-4" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : runs.isError ? (
        <ErrorState size="sm" error={runs.error} onRetry={() => void runs.refetch()} />
      ) : runs.data.items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={History}
          title="Chưa chạy chốt lần nào"
          description="Lần chốt tự động đầu tiên diễn ra vào ngày chốt của kỳ."
        />
      ) : (
        <ol className="flex max-h-[28rem] flex-col divide-y overflow-y-auto">
          {runs.data.items.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </ol>
      )}
    </Panel>
  );
};

const RunRow = ({ run }: { run: KpiSettlementRun }) => (
  <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="font-semibold">{periodLabel(run.period)}</span>
        <span className="text-xs text-foreground-muted tabular-nums">
          {formatDayRange(run.from, run.to)}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium",
            run.trigger === "AUTO" ? "bg-muted text-foreground-muted" : "bg-brand-soft text-brand-text"
          )}
        >
          {run.trigger === "AUTO" ? (
            <Bot className="size-3" aria-hidden="true" />
          ) : (
            <UserRound className="size-3" aria-hidden="true" />
          )}
          {run.trigger === "AUTO" ? "Tự động" : (run.runBy?.displayName ?? "Chạy tay")}
        </span>
        {run.current ? (
          <span className="rounded bg-success-soft px-1.5 py-px text-[11px] font-medium text-success">
            Đang áp dụng
          </span>
        ) : (
          <span className="rounded bg-muted px-1.5 py-px text-[11px] text-foreground-subtle">Đã thay thế</span>
        )}
      </p>
      {run.reason ? (
        <p className="text-xs text-foreground-muted">
          Lý do: <span className="text-foreground">{run.reason}</span>
        </p>
      ) : null}
      <p className="text-[11px] text-foreground-subtle">
        {dateTime.format(new Date(run.startedAt))}
        {run.finishedAt ? "" : " · đang chạy"}
        {run.prorateLeave ? " · trừ ngày nghỉ" : ""}
      </p>
    </div>
    <dl className="grid shrink-0 grid-cols-4 gap-x-4 text-right text-xs tabular-nums sm:w-[26rem]">
      <RunFigure label="Người" value={formatInteger(run.userCount)} />
      <RunFigure
        label="Đạt / không"
        value={
          <>
            <span className="text-success">{formatInteger(run.metCount)}</span> /{" "}
            <span className="text-danger">{formatInteger(run.notMetCount)}</span>
          </>
        }
      />
      <RunFigure label="Tiền Khoán" value={formatMoney(run.khoanMoneyTotal)} />
      <RunFigure label="Quy điểm" value={formatCredit(run.khoanPointsConvertedTotal)} />
    </dl>
  </li>
);

const RunFigure = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-foreground-muted">{label}</dt>
    <dd className="font-medium">{value}</dd>
  </div>
);
