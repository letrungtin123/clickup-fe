import { cn } from "cn";
import { ArrowRight, Check, ChartNoAxesCombined, Eye, Undo2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { Anomaly } from "@/contracts/production-reports";
import { toneClass } from "@/lib/colors";

import { touchTargets } from "../../ui";
import { formatDay, formatInteger } from "../../format";
import { formatDeadline } from "../dashboard";
import { reportErrorMessage } from "../errors";
import { formatReportValue } from "../format";
import { useReviewAnomaly, useUnreviewAnomaly } from "../hooks";
import { reportBuilderHref } from "../model";

/**
 * Rows of the anomalies report (SPEC Phase 5 §5, PLAN §10): what happened, who / which task, and the
 * "Đã xem" action (optional note, undo). A reviewed row disappears until its key changes (a new
 * correction or failure shows it again).
 */

const percent = (value: number) => formatReportValue(value, "percent");

const TaskLink = ({ task }: { task: NonNullable<Anomaly["task"]> }) => (
  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
    <Link
      to={`/production/tasks/${task.id}`}
      className="font-semibold tabular-nums underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:inline-flex max-sm:min-h-10 max-sm:items-center"
    >
      Task #{task.number}
    </Link>
    <span aria-hidden="true" className="text-foreground-subtle">
      ·
    </span>
    <Link
      to={`/production/jobs/${task.jobId}`}
      className="min-w-0 truncate text-foreground-muted underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:inline-flex max-sm:min-h-10 max-sm:items-center"
    >
      {task.jobCode}
    </Link>
  </span>
);

const Person = ({ user, prefix }: { user: Anomaly["user"]; prefix?: string }) =>
  user ? (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground-muted">
      <UserAvatar user={user} size="xs" />
      <span className="truncate">
        {prefix ? `${prefix} ` : ""}
        {user.displayName}
      </span>
    </span>
  ) : null;

const Metric = ({
  label,
  value,
  alert = false
}: {
  label: string;
  value: ReactNode;
  alert?: boolean;
}) => (
  <span className="flex flex-col">
    <span className="text-[11px] text-foreground-subtle">{label}</span>
    <span className={cn("text-sm font-semibold tabular-nums", alert && "text-danger")}>
      {value}
    </span>
  </span>
);

const Details = ({
  item,
  threshold,
  timeZone
}: {
  item: Anomaly;
  threshold: number;
  timeZone: string;
}) => {
  switch (item.kind) {
    case "QTY_MISMATCH":
      return (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          <Metric label="Giao" value={`${formatInteger(item.qtyAssigned)} tấm`} />
          <Metric label="Done" value={`${formatInteger(item.qtyDone)} tấm`} />
          <Metric
            label="Chênh lệch"
            value={`${item.difference > 0 ? "+" : ""}${formatInteger(item.difference)}`}
            alert={item.difference < 0}
          />
          {item.changedBy ? (
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] text-foreground-subtle">
                {item.source === "CORRECTION" ? "Leader sửa số lượng" : "Nhập lúc Done"}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                <UserAvatar user={item.changedBy} size="xs" />
                <span className="truncate">{item.changedBy.displayName}</span>
                {item.changedAt ? (
                  <span className="shrink-0 text-foreground-subtle tabular-nums">
                    {formatDeadline(item.changedAt, timeZone)}
                  </span>
                ) : null}
              </span>
            </span>
          ) : null}
        </div>
      );
    case "QC_FAIL_REPEAT":
      return (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          <Metric label="QC fail" value={`${item.qcFailCount} lần`} alert />
          <span className="flex flex-col">
            <span className="text-[11px] text-foreground-subtle">Trạng thái hiện tại</span>
            <span
              className={cn(
                toneClass(item.status.color),
                "inline-flex h-5 w-fit items-center rounded-md bg-(--tone-soft) px-1.5 text-[11px] font-medium text-(--tone-text)"
              )}
            >
              {item.status.name}
            </span>
          </span>
        </div>
      );
    case "WORKER_FAIL_RATE":
      return (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          <Metric label="Task Done" value={formatInteger(item.taskCount)} />
          <Metric
            label={`Tỉ lệ FB sai (${item.fbWrongCount})`}
            value={percent(item.fbRate)}
            alert={item.fbRate > threshold}
          />
          <Metric
            label={`Tỉ lệ QC fail (${item.qcFailedCount})`}
            value={percent(item.qcFailRate)}
            alert={item.qcFailRate > threshold}
          />
          <Metric label="Ngưỡng" value={percent(item.threshold)} />
        </div>
      );
    case "FAST_DONE":
      return (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          <Metric
            label="Done sau khi giao"
            value={
              item.minutes < 1
                ? "dưới 1 phút"
                : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(item.minutes)} phút`
            }
            alert
          />
          <Metric label="Giao lúc" value={formatDeadline(item.assignedAt, timeZone)} />
          <Metric label="Done lúc" value={formatDeadline(item.doneAt, timeZone)} />
          {item.qtyDone !== null ? (
            <Metric label="Số tấm" value={formatInteger(item.qtyDone)} />
          ) : null}
        </div>
      );
    case "MISSING_CREDIT_RULE":
      return (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          <Metric
            label="Dự án × quy trình"
            value={`${item.projectCode} × ${item.processName ?? "—"}`}
          />
          <Metric label="Vai trò" value={item.role === "QC" ? "QC" : "Người làm"} />
          <Metric label="Số tấm" value={formatInteger(item.qty)} />
          <Metric label="Ngày ghi điểm" value={formatDay(item.businessDay)} />
        </div>
      );
  }
};

/** Report-builder link that digs into one worker's FB / QC rates over the last 30 days. */
const workerReportHref = (userId: string, name: string) =>
  reportBuilderHref(
    {
      dimensions: ["week"],
      measures: ["fb_rate", "qc_fail_rate", "task_count", "fb_wrong_count"],
      filters: { user: [userId] },
      preset: "LAST_30_DAYS",
      view: { type: "TABLE", rows: ["week"], columns: [] }
    },
    `Tỉ lệ lỗi · ${name}`
  );

const ReviewButton = ({ item }: { item: Anomaly }) => {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const review = useReviewAnomaly();
  const unreview = useUnreviewAnomaly();

  const undo = async () => {
    try {
      await unreview.mutateAsync({ kind: item.kind, key: item.key });
      toast.success("Đã bỏ đánh dấu đã xem");
    } catch (cause) {
      toast.error(reportErrorMessage(cause, "Không hoàn tác được."));
    }
  };

  const submit = async () => {
    try {
      const trimmed = note.trim();
      await review.mutateAsync({
        kind: item.kind,
        key: item.key,
        ...(trimmed ? { note: trimmed } : {})
      });
      setOpen(false);
      setNote("");
      toast.success("Đã đánh dấu đã xem", {
        action: { label: "Hoàn tác", onClick: () => void undo() }
      });
    } catch (cause) {
      toast.error(reportErrorMessage(cause, "Không đánh dấu được. Thử lại sau."));
    }
  };

  if (item.reviewed) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={unreview.isPending}
        onClick={() => void undo()}
        className="text-foreground-muted"
      >
        {unreview.isPending ? <Spinner /> : <Undo2 />}
        Hoàn tác
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <Eye />
        Đã xem
      </PopoverTrigger>
      <PopoverContent align="end" className={cn("w-72", touchTargets)}>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={`${id}-note`} className="text-sm font-medium">
            Ghi chú <span className="font-normal text-foreground-muted">(không bắt buộc)</span>
          </label>
          <Textarea
            id={`${id}-note`}
            value={note}
            rows={2}
            maxLength={500}
            autoFocus
            placeholder="Ví dụ: đã hỏi NV, khách gửi thiếu ảnh"
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="text-xs text-foreground-muted">
            Mục này sẽ ẩn cho đến khi có thay đổi mới.
          </p>
          <Button type="submit" disabled={review.isPending}>
            {review.isPending ? <Spinner /> : <Check />}
            Đánh dấu đã xem
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
};

export const AnomalyRow = ({
  item,
  threshold,
  timeZone
}: {
  item: Anomaly;
  threshold: number;
  timeZone: string;
}) => (
  <article
    className={cn(
      "flex min-w-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center",
      item.reviewed && "bg-muted/40"
    )}
  >
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {item.task ? <TaskLink task={item.task} /> : null}
        {item.kind === "WORKER_FAIL_RATE" && item.user ? (
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <UserAvatar user={item.user} size="sm" />
            <span className="truncate">{item.user.displayName}</span>
          </span>
        ) : (
          <Person user={item.user} />
        )}
      </div>
      <Details item={item} threshold={threshold} timeZone={timeZone} />
      {item.reviewed ? (
        <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-foreground-muted">
          <Check className="size-3.5 text-success" aria-hidden="true" />
          Đã xem bởi {item.reviewed.by?.displayName ?? "người dùng đã rời"} lúc{" "}
          {formatDeadline(item.reviewed.at, timeZone)}
          {item.reviewed.note ? (
            <span className="text-foreground">— “{item.reviewed.note}”</span>
          ) : null}
        </p>
      ) : null}
    </div>
    <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end">
      <time dateTime={item.at} className="text-xs text-foreground-subtle tabular-nums">
        {formatDeadline(item.at, timeZone)}
      </time>
      <div className="flex items-center gap-1">
        {item.kind === "WORKER_FAIL_RATE" && item.user ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-foreground-muted max-sm:min-h-10"
            render={<Link to={workerReportHref(item.user.id, item.user.displayName)} />}
            nativeButton={false}
          >
            <ChartNoAxesCombined />
            <span className="max-sm:sr-only">Báo cáo</span>
          </Button>
        ) : null}
        {item.kind === "MISSING_CREDIT_RULE" ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-foreground-muted max-sm:min-h-10"
            render={<Link to="/production/settings/credit-rules" />}
            nativeButton={false}
          >
            Đơn giá
            <ArrowRight />
          </Button>
        ) : null}
        <ReviewButton item={item} />
      </div>
    </div>
  </article>
);
