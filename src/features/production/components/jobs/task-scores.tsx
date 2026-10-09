import { cn } from "cn";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductionTask } from "@/contracts/production-jobs";
import type { TaskScoreEntry, TaskScores } from "@/contracts/production-scores";

import { formatCredit, formatDay, formatMoney } from "../../format";
import { useTaskScores } from "../../jobs-hooks";
import { Person } from "./job-bits";

const ROLE_LABEL = { WORKER: "Người làm", QC: "QC" } as const;
const KIND_LABEL = { NORMAL: null, FB_WRONG: "Feedback sai", FB_EXTRA: "Feedback thêm" } as const;

const sectionTitle = "text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase";

/**
 * Points (and money when the API shows it) recorded for a task: current total per role, then the
 * ledger rows (originals, adjustments after a quantity correction or feedback). Rows appear once the
 * task is Done (worker) and checked (QC).
 */
export const TaskScoresSection = ({ task }: { task: ProductionTask }) => {
  const scores = useTaskScores(task.id, task.doneAt !== null);
  if (task.doneAt === null) return null;

  return (
    <section aria-labelledby={`task-scores-${task.id}`} className="flex flex-col gap-2">
      <h3 id={`task-scores-${task.id}`} className={sectionTitle}>
        Điểm
      </h3>
      {task.kind === "FB_WRONG" ? (
        <p className="text-xs text-foreground-muted">
          Task làm lại theo feedback sai: ghi số tấm nhưng không tính điểm.
        </p>
      ) : null}
      {scores.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Đang tải điểm">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : scores.isError ? (
        <ErrorState
          size="sm"
          error={scores.error}
          onRetry={() => void scores.refetch()}
          retrying={scores.isFetching}
        />
      ) : scores.data.totals.length === 0 ? (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-foreground-muted">
          Chưa có điểm ghi nhận cho task này.
        </p>
      ) : (
        <ScoresBody scores={scores.data} />
      )}
    </section>
  );
};

const ScoresBody = ({ scores }: { scores: TaskScores }) => {
  const [open, setOpen] = useState(false);
  const missingRule = scores.items.some((item) => item.missingRule);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y rounded-xl border bg-surface">
        {scores.totals.map((total) => (
          <li
            key={`${total.role}-${total.user.id}`}
            className="flex items-center gap-3 px-3 py-2.5 text-[13px]"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[11px] text-foreground-muted">{ROLE_LABEL[total.role]}</span>
              <Person user={total.user} size="xs" />
            </span>
            <span className="flex shrink-0 flex-col items-end tabular-nums">
              <span className="font-semibold">{formatCredit(total.credits)} credit</span>
              <span className="text-[11px] text-foreground-muted">
                {total.qty} tấm
                {total.money ? ` · ${formatMoney(total.money)}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {missingRule ? (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Có dòng chưa có đơn giá lúc ghi nhận nên tính 0 credit.
        </p>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-8 items-center gap-1 self-start rounded text-xs font-medium text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-10"
      >
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
        {open ? "Ẩn chi tiết" : `Chi tiết (${scores.items.length} dòng)`}
      </button>
      {open ? (
        <ol aria-label="Các dòng điểm" className="flex flex-col gap-1">
          {scores.items.map((item) => (
            <ScoreRow key={item.id} item={item} />
          ))}
        </ol>
      ) : null}
    </div>
  );
};

/** Money only where it means something: Khoán rows (provisional) or any non-zero visible amount. */
const ScoreRow = ({ item }: { item: TaskScoreEntry }) => {
  const adjustment = item.adjustsEntryId !== null;
  const kind = KIND_LABEL[item.kind];
  return (
    <li
      className={cn(
        "flex flex-col gap-1 rounded-lg px-2.5 py-2 text-xs",
        adjustment ? "border border-dashed" : "bg-muted/50"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-medium">{ROLE_LABEL[item.role]}</span>
        <span className="min-w-0 truncate text-foreground-muted">{item.user.displayName}</span>
        {adjustment ? (
          <span className="rounded bg-muted px-1.5 py-px text-[11px]">Điều chỉnh</span>
        ) : null}
        {kind ? <span className="rounded bg-muted px-1.5 py-px text-[11px]">{kind}</span> : null}
        <span className="ml-auto text-foreground-muted tabular-nums">
          {formatDay(item.businessDay)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-foreground-muted tabular-nums">
        <span>
          {item.qty > 0 ? "+" : ""}
          {item.qty} tấm × {formatCredit(item.unitCredits)}
        </span>
        <span className="font-medium text-foreground">
          {item.credits > 0 ? "+" : ""}
          {formatCredit(item.credits)} credit
        </span>
        {item.money !== null && (item.money !== 0 || item.payMode === "MONEY_IF_KPI") ? (
          <span>{formatMoney(item.money)}</span>
        ) : null}
        <span>
          {item.shift.name}
          {item.process ? ` · ${item.process.name}` : ""}
        </span>
      </div>
      {item.note ? <p className="whitespace-pre-wrap text-foreground-muted">{item.note}</p> : null}
    </li>
  );
};
