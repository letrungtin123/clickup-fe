import { cn } from "cn";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChartNoAxesCombined, Eye, Undo2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Link } from "@/components/shared/router-link";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { anomalyKinds, type Anomaly, type AnomalyKind } from "@/contracts/production-reports";
import { useSessionContext } from "@/features/auth/hooks";
import { toneClass } from "@/lib/colors";

import { useProductionAccess } from "../../hooks";
import { touchTargets } from "../../ui";
import { formatDay, formatInteger, formatNumber } from "../../format";
import { anomalyKindTitles, anomalyTabLabels, canUndoReview } from "../anomalies";
import { formatDeadline } from "../dashboard";
import { reportErrorMessage } from "../errors";
import { formatReportValue } from "../format";
import { useReviewAnomaly, useUnreviewAnomaly } from "../hooks";
import { reportBuilderHref } from "../model";
import { REPORTS_MODULE_VISIBLE } from "../../nav";

/**
 * Rows of the anomalies report (SPEC Phase 5 §5, PLAN §10): what happened, who / which task, and the
 * "Đã xem" action (optional note, undo). A reviewed row disappears until its key changes (a new
 * correction or failure shows it again). Only the person who marked a row, or an ADMIN, can take it
 * back ("Bỏ đã xem"; API 403 ANOMALY_REVIEW_NOT_OWNER otherwise). Used by /production/anomalies and the
 * "Bất thường" tab of the Leader dashboard (SPEC Phase 5.5).
 */

const percent = (value: number) => formatReportValue(value, "percent");

const TaskLink = ({ task }: { task: NonNullable<Anomaly["task"]> }) => (
  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
    <Link
      to={`/production/tasks/${task.id}`}
      className="font-semibold tabular-nums underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:inline-flex pointer-coarse:min-h-10 pointer-coarse:items-center"
    >
      Task #{task.number}
    </Link>
    <span aria-hidden="true" className="text-foreground-subtle">
      ·
    </span>
    <Link
      to={`/production/jobs/${task.jobId}`}
      className="min-w-0 truncate text-foreground-muted underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:inline-flex pointer-coarse:min-h-10 pointer-coarse:items-center"
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
          <Metric label="Đã xong" value={`${formatInteger(item.qtyDone)} tấm`} />
          <Metric
            label="Chênh lệch"
            value={`${item.difference > 0 ? "+" : ""}${formatInteger(item.difference)}`}
            alert={item.difference < 0}
          />
          {item.changedBy ? (
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] text-foreground-subtle">
                {item.source === "CORRECTION" ? "Leader sửa số lượng" : "Nhập lúc báo xong"}
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
          <Metric label="QC trả lại" value={`${item.qcFailCount} lần`} alert />
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
          <Metric label="Task đã xong" value={formatInteger(item.taskCount)} />
          <Metric
            label={`Tỉ lệ FB sai (${item.fbWrongCount})`}
            value={percent(item.fbRate)}
            alert={item.fbRate > threshold}
          />
          <Metric
            label={`Tỉ lệ QC trả lại (${item.qcFailedCount})`}
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
            label="Xong sau khi giao"
            value={item.minutes < 1 ? "dưới 1 phút" : `${formatNumber(item.minutes)} phút`}
            alert
          />
          <Metric label="Giao lúc" value={formatDeadline(item.assignedAt, timeZone)} />
          <Metric label="Xong lúc" value={formatDeadline(item.doneAt, timeZone)} />
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
  const session = useSessionContext();
  const access = useProductionAccess();
  const canUndo = canUndoReview(item, { userId: session.user.id, isAdmin: access.isAdmin });

  const undo = async () => {
    try {
      await unreview.mutateAsync({ kind: item.kind, key: item.key });
      toast.success("Đã bỏ đánh dấu đã xem");
    } catch (cause) {
      // ANOMALY_REVIEW_NOT_OWNER: the server says who may undo it.
      toast.error(reportErrorMessage(cause, "Không bỏ được đánh dấu đã xem."));
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
        action: { label: "Bỏ đã xem", onClick: () => void undo() }
      });
    } catch (cause) {
      toast.error(reportErrorMessage(cause, "Không đánh dấu được. Thử lại sau."));
    }
  };

  if (item.reviewed) {
    // Someone else's review: only they (or an Admin) can take it back — nothing to offer here.
    if (!canUndo) return null;
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={unreview.isPending}
        onClick={() => void undo()}
        className="text-foreground-muted"
        title="Bỏ đánh dấu đã xem: mục hiện lại trong danh sách"
      >
        {unreview.isPending ? <Spinner /> : <Undo2 />}
        Bỏ đã xem
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

/** Tabs per anomaly kind with the unreviewed count of each. */
export const AnomalyKindTabs = ({
  value,
  onChange,
  counts,
  loaded
}: {
  value: AnomalyKind;
  onChange: (kind: AnomalyKind) => void;
  counts: Partial<Record<AnomalyKind, number>> | undefined;
  loaded: boolean;
}) => (
  <Tabs value={value} onValueChange={(next) => onChange(next as AnomalyKind)}>
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)] md:mx-0 md:px-0 md:[mask-image:none]">
      <TabsList
        className={cn("h-auto! w-max min-w-full justify-start gap-1 p-1 md:min-w-0", touchTargets)}
      >
        {anomalyKinds.map((kind) => {
          const count = counts?.[kind] ?? 0;
          return (
            <TabsTrigger
              key={kind}
              value={kind}
              className="h-9 flex-none gap-1.5 px-3 pointer-coarse:h-10"
              title={anomalyKindTitles[kind]}
            >
              {anomalyTabLabels[kind]}
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  count > 0 ? "bg-danger-soft text-danger" : "bg-muted text-foreground-subtle"
                )}
                aria-label={`${count} mục chưa xem`}
              >
                {loaded ? count : "·"}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </div>
  </Tabs>
);

/** Rows of one kind; reviewed rows leave with a short collapse. */
export const AnomalyList = ({
  kind,
  items,
  threshold,
  timeZone
}: {
  kind: AnomalyKind;
  items: readonly Anomaly[];
  threshold: number;
  timeZone: string;
}) => (
  // Keyed by kind: switching tabs replaces the list instead of animating 500 rows out.
  <ul key={kind} className="divide-y">
    <AnimatePresence initial={false}>
      {items.map((item) => (
        <motion.li
          key={`${item.kind}:${item.key}`}
          layout="position"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
          transition={{ duration: 0.18 }}
          className="overflow-hidden"
        >
          <AnomalyRow item={item} threshold={threshold} timeZone={timeZone} />
        </motion.li>
      ))}
    </AnimatePresence>
  </ul>
);

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
        {REPORTS_MODULE_VISIBLE && item.kind === "WORKER_FAIL_RATE" && item.user ? (
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
