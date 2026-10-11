import { cn } from "cn";
import { motion } from "motion/react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronLeft,
  Ellipsis,
  ExternalLink,
  MessageCircleWarning,
  MessageSquare,
  MessagesSquare,
  PencilLine,
  Split,
  Undo2,
  XCircle
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { Feedback, JobDetail } from "@/contracts/production-jobs";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { CloseFeedbackDialog } from "@/features/production/components/jobs/close-feedback-dialog";
import { FeedbackDialog } from "@/features/production/components/jobs/feedback-dialog";
import {
  Fact,
  FeedbackBadge,
  LateBadge,
  MiniBar,
  Person,
  StatusChip
} from "@/features/production/components/jobs/job-bits";
import { JobFormDialog } from "@/features/production/components/jobs/job-form-dialog";
import { JobTasks } from "@/features/production/components/jobs/job-tasks";
import { SplitTasksDialog } from "@/features/production/components/jobs/split-tasks-dialog";
import { ProductionTimeline } from "@/features/production/components/jobs/timeline";
import { useTaskMover } from "@/features/production/components/jobs/use-task-mover";
import { CustomFieldValue } from "@/features/production/components/custom-field-input";
import { ConfirmDialog } from "@/features/production/components/settings-kit";
import { TagChips } from "@/features/production/components/tag-picker";
import { fieldsFor, isEmptyValue } from "@/features/production/custom-fields";
import { productionErrorMessage } from "@/features/production/errors";
import { formatInteger } from "@/features/production/format";
import { useCustomFields, useProductionMe, useTags } from "@/features/production/hooks";
import {
  useJob,
  useJobTransition,
  useOpenJobChat,
  useUpdateJob
} from "@/features/production/jobs-hooks";
import {
  assignedNormalQty,
  canSeeJob,
  formatDateTime,
  jobDeadlineCountdown,
  jobProgress
} from "@/features/production/jobs-model";
import { useProductionPeople } from "@/features/production/people";
import { useOpenTask } from "@/features/production/task-link";
import { touchTargets } from "@/features/production/ui";

const ease = [0.22, 1, 0.36, 1] as const;

/** /production/jobs/:jobId — job header, progress, tasks with their moves, feedback, timeline. */
export const ProductionJobRoute = () => {
  const { jobId } = useParams();
  const job = useJob(jobId);

  if (job.isPending) return <JobSkeleton />;
  if (job.isError) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <ErrorState
          error={job.error}
          onRetry={() => void job.refetch()}
          retrying={job.isFetching}
        />
      </div>
    );
  }
  return <JobPage job={job.data} />;
};

const JobSkeleton = () => (
  <div className="flex h-full flex-col gap-4 p-4 md:p-6" aria-busy="true" aria-label="Đang tải job">
    <Skeleton className="h-3 w-24" />
    <Skeleton className="h-7 w-72 max-w-full" />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-12" />
      ))}
    </div>
    <Skeleton className="h-16" />
    {[0, 1, 2, 3].map((index) => (
      <Skeleton key={index} className="h-14" />
    ))}
  </div>
);

type Dialogs = "split" | "feedback" | "edit" | "archive" | null;

const JobPage = ({ job }: { job: JobDetail }) => {
  const me = useProductionMe();
  const breakpoint = useBreakpoint();
  const navigate = useNavigate();
  const tags = useTags();
  const customFields = useCustomFields();
  const jobFields = useMemo(
    () => fieldsFor(customFields.data?.items ?? [], "JOB"),
    [customFields.data]
  );
  const taskFields = useMemo(
    () => fieldsFor(customFields.data?.items ?? [], "TASK"),
    [customFields.data]
  );
  const openTask = useOpenTask();
  const mover = useTaskMover();
  const bulk = useJobTransition(job.id);
  const chat = useOpenJobChat();
  const update = useUpdateJob(job.id);
  const people = useProductionPeople([
    job.leader,
    job.createdBy,
    ...job.tasks.flatMap((task) => [task.assignee, task.qc])
  ]);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [bulkTarget, setBulkTarget] = useState<
    JobDetail["capabilities"]["bulkActions"][number] | null
  >(null);
  const [reassignFor, setReassignFor] = useState<Feedback | null>(null);
  const [closingFeedback, setClosingFeedback] = useState<Feedback | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const progress = jobProgress(job);
  // Over-allocation is about the client's images: feedback redo tasks are extra work, not extra images.
  const overBy = assignedNormalQty(job.tasks) - job.totalImages;
  // An archived job is parked: a countdown ("trễ 8 giờ") means nothing there.
  const deadline = job.archived ? null : jobDeadlineCountdown(job, mover.lookup.statuses);
  const late = job.lateTaskCount > 0;
  const caps = job.capabilities;
  // Archived jobs are read-only: only restoring (and reading the chat) stays available.
  const active = !job.archived;
  // "Đóng feedback (không cần làm lại)": Account / Admin on an open feedback of an active job.
  const canCloseFeedback = active && caps.canCloseFeedback;
  const resolvedFeedbacks = job.feedbacks.filter((feedback) => feedback.status === "RESOLVED");
  // Feedback is entered through "Ghi feedback" (and left by the system), never as a bulk move.
  const bulkActions = active
    ? caps.bulkActions.filter(
        (action) => mover.lookup.byId.get(action.toStatusId)?.code !== "FEEDBACK"
      )
    : [];
  const desktop = breakpoint === "desktop";
  const openFeedbacks = job.feedbacks.filter((feedback) => feedback.status !== "RESOLVED");
  // A feedback waiting to be re-assigned is the Leader's next step: "Giao lại" leads, "Chia task" steps back.
  const awaitingReassign =
    caps.canSplit && active && openFeedbacks.some((feedback) => feedback.status === "OPEN");
  // Project name / client often repeat the project code (e.g. "ABC · ABC"): show each part once.
  const subtitle = [job.project.name, job.project.clientName, job.name].filter(
    (part, index, parts): part is string =>
      Boolean(part) && part !== job.project.code && parts.indexOf(part) === index
  );

  // Anyone who can see the job opens its chat through the API (which adds them as a member);
  // creating it stays with Leader / Account / Admin. Archived jobs only reopen an existing chat.
  const openChat = () => {
    if (!active && job.channelId) {
      void navigate(`/c/${job.channelId}`);
      return;
    }
    chat.mutate(job.id, {
      onSuccess: (result) => {
        if (result.created) toast.success("Đã tạo nhóm chat cho job");
        void navigate(`/c/${result.channelId}`);
      },
      onError: (error) => toast.error(productionErrorMessage(error))
    });
  };

  const timeline = (
    <ProductionTimeline
      entity="jobs"
      id={job.id}
      people={people}
      mentionable={(personId) => canSeeJob(personId, people.roles.get(personId), job)}
      readOnly={job.archived}
      onOpenTask={(taskId) => {
        setTimelineOpen(false);
        openTask(taskId);
      }}
    />
  );

  return (
    <div className={cn("flex h-full min-h-0", touchTargets)}>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease }}
          className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:px-6"
        >
          <header className="flex flex-col gap-3">
            <Link
              to="/production/jobs"
              className="inline-flex items-center gap-1 self-start rounded text-xs text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-3 max-sm:py-3 max-sm:pr-3"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              Job
            </Link>
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h1 className="text-xl leading-tight font-semibold tracking-[-0.01em] break-words">
                  {job.code}
                </h1>
                <p className="text-[13px] text-foreground-muted">
                  <span className="font-mono">{job.project.code}</span>
                  {subtitle.length > 0 ? ` · ${subtitle.join(" · ")}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {job.archived ? (
                  <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-foreground-muted">
                    <Archive className="size-3.5" aria-hidden="true" />
                    Đã lưu trữ
                  </span>
                ) : null}
                <StatusChip status={job.status} />
                <FeedbackBadge count={job.openFeedbackCount} />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-surface p-3 shadow-xs md:grid-cols-4">
              <Fact label="Leader">
                <Person user={job.leader} />
              </Fact>
              <Fact label="Deadline">
                <span className={cn("tabular-nums", late && "font-medium text-danger")}>
                  {formatDateTime(job.deadline, timeZone, true)}
                </span>
                {deadline || late ? (
                  <span
                    className={cn(
                      "block text-xs",
                      deadline?.late ? "text-danger" : "text-foreground-muted"
                    )}
                  >
                    {[deadline?.label, late ? `${job.lateTaskCount} task trễ` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </Fact>
              <Fact label="Thư mục ảnh">
                {job.driveLink ? (
                  <a
                    href={job.driveLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 rounded text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-2.5 max-sm:py-2.5 max-sm:pr-3"
                  >
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">Mở link</span>
                  </a>
                ) : (
                  <span className="text-foreground-subtle">—</span>
                )}
              </Fact>
              <Fact label="Tag">
                {job.tagIds.length > 0 ? (
                  <TagChips tags={tags.data?.items ?? []} tagIds={job.tagIds} max={4} />
                ) : (
                  <span className="text-foreground-subtle">—</span>
                )}
              </Fact>
              {/* JOB custom fields with a value (e.g. "Mã đơn hàng", PLAN §8). */}
              {jobFields
                .filter((field) => !isEmptyValue(job.customValues[field.key]))
                .map((field) => (
                  <Fact key={field.id} label={field.label}>
                    <CustomFieldValue
                      field={field}
                      value={job.customValues[field.key]}
                      className="block"
                    />
                  </Fact>
                ))}
            </dl>

            <section
              aria-label="Tiến độ"
              className="grid grid-cols-2 gap-3 rounded-xl border bg-surface p-3 shadow-xs sm:grid-cols-4"
            >
              <ProgressStat label="Tổng tấm" value={job.totalImages} />
              <ProgressStat
                label="Đã giao"
                value={job.qtyAssigned}
                percent={progress.assigned}
                tone={overBy > 0 ? "warning" : "muted"}
                hint={overBy > 0 ? `vượt ${formatInteger(overBy)}` : undefined}
              />
              <ProgressStat
                label="Đã xong"
                value={job.qtyDone}
                percent={progress.done}
                tone="brand"
              />
              <ProgressStat
                label="Đã kiểm"
                value={job.qtyChecked}
                percent={progress.checked}
                tone="success"
              />
            </section>

            {job.archived ? (
              <div
                role="status"
                className="flex flex-col gap-2 rounded-xl border border-border-strong bg-muted/60 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center"
              >
                <p className="flex min-w-0 flex-1 items-start gap-2">
                  <Archive
                    className="mt-0.5 size-4 shrink-0 text-foreground-muted"
                    aria-hidden="true"
                  />
                  <span>
                    Job đã lưu trữ nên chỉ xem được: không chia task, chuyển trạng thái, ghi
                    feedback hay sửa job.
                    {caps.canArchive ? " Khôi phục job để làm tiếp." : ""}
                  </span>
                </p>
                {caps.canArchive ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 self-start bg-surface sm:self-auto"
                    onClick={() => setDialog("archive")}
                  >
                    <ArchiveRestore />
                    Khôi phục job
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {caps.canSplit && active ? (
                <Button
                  variant={awaitingReassign ? "outline" : "default"}
                  onClick={() => setDialog("split")}
                >
                  <Split />
                  Chia task
                </Button>
              ) : null}
              {bulkActions.map((action) => (
                <Button
                  key={action.toStatusId}
                  variant="outline"
                  onClick={() => setBulkTarget(action)}
                  disabled={bulk.isPending}
                >
                  {action.name}
                  <span className="text-foreground-muted tabular-nums">· {action.taskCount}</span>
                </Button>
              ))}
              {caps.canFeedback && active ? (
                <Button variant="outline" onClick={() => setDialog("feedback")}>
                  <MessageCircleWarning />
                  Ghi feedback
                </Button>
              ) : null}
              {(caps.canEdit && active) || job.channelId ? (
                <Button variant="outline" onClick={openChat} disabled={chat.isPending}>
                  {chat.isPending ? <Spinner /> : <MessagesSquare />}
                  Nhóm chat
                </Button>
              ) : null}
              {!desktop ? (
                <Button variant="outline" onClick={() => setTimelineOpen(true)}>
                  <MessageSquare />
                  Hoạt động
                </Button>
              ) : null}
              {/* Archived: "Khôi phục job" sits in the banner above, so no menu with only that. */}
              {active && (caps.canEdit || caps.canArchive) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon" aria-label="Tùy chọn job" />}
                  >
                    <Ellipsis />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {caps.canEdit ? (
                      <DropdownMenuItem onClick={() => setDialog("edit")}>
                        <PencilLine />
                        Sửa job
                      </DropdownMenuItem>
                    ) : null}
                    {caps.canArchive ? (
                      <>
                        {caps.canEdit ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem onClick={() => setDialog("archive")}>
                          <Archive />
                          Lưu trữ job
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </header>

          {openFeedbacks.length > 0 ? (
            <section aria-label="Feedback đang mở" className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Feedback của khách</h2>
              <ul className="flex flex-col gap-2">
                {openFeedbacks.map((feedback) => (
                  <li
                    key={feedback.id}
                    className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 sm:flex-row sm:items-start"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                        {feedback.type === "WRONG" ? "Sai — làm lại" : "Yêu cầu thêm"}
                        <span className="text-xs font-normal text-foreground-muted">
                          {feedback.status === "OPEN"
                            ? "Chờ giao lại"
                            : `Đang làm lại · ${feedback.taskIds.length} task`}
                          {feedback.sourceTaskId
                            ? ` · task gốc #${job.tasks.find((task) => task.id === feedback.sourceTaskId)?.number ?? "?"}`
                            : ""}
                        </span>
                      </p>
                      <p className="text-[13px] whitespace-pre-wrap">{feedback.note}</p>
                      <p className="text-[11px] text-foreground-muted">
                        {feedback.createdBy?.displayName ?? "Account"} ·{" "}
                        {formatDateTime(feedback.createdAt, timeZone, true)}
                      </p>
                    </div>
                    {(caps.canSplit && active) || canCloseFeedback ? (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {caps.canSplit && active ? (
                          <Button
                            size="sm"
                            variant={feedback.status === "OPEN" ? "default" : "outline"}
                            className={feedback.status === "OPEN" ? undefined : "bg-surface"}
                            onClick={() => setReassignFor(feedback)}
                          >
                            <Undo2 />
                            Giao lại
                          </Button>
                        ) : null}
                        {canCloseFeedback ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setClosingFeedback(feedback)}
                          >
                            <XCircle />
                            Đóng feedback (không cần làm lại)
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {resolvedFeedbacks.length > 0 ? (
            <ResolvedFeedbacks feedbacks={resolvedFeedbacks} timeZone={timeZone} />
          ) : null}

          <section aria-labelledby="job-tasks" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 id="job-tasks" className="text-sm font-semibold">
                Task
              </h2>
              <span className="text-xs text-foreground-muted tabular-nums">{job.tasks.length}</span>
              {late ? <LateBadge label={`${job.lateTaskCount} trễ`} /> : null}
            </div>
            <JobTasks
              tasks={job.tasks}
              fields={taskFields}
              timeZone={timeZone}
              onOpen={openTask}
              onMove={(task, option) => mover.start(task, option)}
              busyTaskId={mover.pendingTaskId}
              readOnly={!active}
            />
          </section>
        </motion.div>
      </div>

      {desktop ? (
        <aside
          aria-label="Hoạt động của job"
          className="flex w-[22rem] shrink-0 flex-col overflow-y-auto border-l bg-canvas/40 px-4 py-5 2xl:w-[25rem]"
        >
          {timeline}
        </aside>
      ) : (
        <Sheet open={timelineOpen} onOpenChange={setTimelineOpen}>
          <SheetContent
            side={breakpoint === "mobile" ? "bottom" : "right"}
            className={cn(
              "gap-0 overflow-y-auto p-4 pt-12",
              breakpoint === "mobile"
                ? `data-[side=bottom]:h-[92dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)] ${touchTargets}`
                : "w-full data-[side=right]:sm:max-w-md"
            )}
          >
            <SheetTitle className="sr-only">Hoạt động của job</SheetTitle>
            <SheetDescription className="sr-only">
              Bình luận và lịch sử các task trong job.
            </SheetDescription>
            {timeline}
          </SheetContent>
        </Sheet>
      )}

      {mover.dialog}
      {caps.canSplit ? (
        <>
          <SplitTasksDialog
            key={`split-${dialog === "split"}`}
            open={dialog === "split"}
            job={job}
            onClose={() => setDialog(null)}
          />
          <SplitTasksDialog
            key={`reassign-${reassignFor?.id ?? "none"}`}
            open={reassignFor !== null}
            job={job}
            feedback={reassignFor}
            onClose={() => setReassignFor(null)}
          />
        </>
      ) : null}
      {canCloseFeedback ? (
        <CloseFeedbackDialog
          key={`close-${closingFeedback?.id ?? "none"}`}
          jobId={job.id}
          feedback={closingFeedback}
          onClose={() => setClosingFeedback(null)}
        />
      ) : null}
      {caps.canFeedback ? (
        <FeedbackDialog
          key={`feedback-${dialog === "feedback"}`}
          open={dialog === "feedback"}
          job={job}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {caps.canEdit ? (
        <JobFormDialog
          key={`edit-${dialog === "edit"}`}
          open={dialog === "edit"}
          job={job}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={bulkTarget !== null}
        onOpenChange={(open) => !open && !bulk.isPending && setBulkTarget(null)}
        title={`Chuyển ${bulkTarget?.taskCount ?? 0} task sang ${bulkTarget?.name ?? ""}?`}
        description="Áp dụng cho mọi task của job mà bạn được phép chuyển sang trạng thái này. Lịch sử từng task được ghi lại."
        confirmLabel={`Chuyển sang ${bulkTarget?.name ?? ""}`}
        pending={bulk.isPending}
        onConfirm={() =>
          bulkTarget &&
          bulk.mutate(bulkTarget.toStatusId, {
            onSuccess: (result) => {
              toast.success(`Đã chuyển ${result.moved} task sang ${bulkTarget.name}`);
              setBulkTarget(null);
            },
            onError: (error) => toast.error(productionErrorMessage(error))
          })
        }
      />
      <ConfirmDialog
        open={dialog === "archive"}
        onOpenChange={(open) => !open && !update.isPending && setDialog(null)}
        title={job.archived ? `Khôi phục job ${job.code}?` : `Lưu trữ job ${job.code}?`}
        description={
          job.archived
            ? "Job quay lại danh sách và có thể tiếp tục chia task."
            : "Job ẩn khỏi danh sách mặc định và không sửa được cho tới khi khôi phục. Dữ liệu và điểm giữ nguyên."
        }
        confirmLabel={job.archived ? "Khôi phục" : "Lưu trữ"}
        pending={update.isPending}
        onConfirm={() =>
          update.mutate(
            { archived: !job.archived },
            {
              onSuccess: () => {
                toast.success(job.archived ? "Đã khôi phục job" : "Đã lưu trữ job");
                setDialog(null);
              },
              onError: (error) => toast.error(productionErrorMessage(error))
            }
          )
        }
      />
    </div>
  );
};

const ProgressStat = ({
  label,
  value,
  percent,
  tone = "brand",
  hint
}: {
  label: string;
  value: number;
  percent?: number;
  tone?: "brand" | "success" | "muted" | "warning";
  hint?: string | undefined;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase">
      {label}
    </span>
    <span className="flex items-baseline gap-1.5">
      <span className="text-lg font-semibold tabular-nums">{formatInteger(value)}</span>
      {percent !== undefined ? (
        <span className="text-xs text-foreground-muted tabular-nums">{percent}%</span>
      ) : null}
      {hint ? <span className="text-xs font-medium text-warning">{hint}</span> : null}
    </span>
    {percent !== undefined ? <MiniBar value={percent} tone={tone} className="h-1.5" /> : null}
  </div>
);

/** Client feedback already handled: re-done and checked, or closed without rework (with the reason). */
const ResolvedFeedbacks = ({
  feedbacks,
  timeZone
}: {
  feedbacks: Feedback[];
  timeZone: string;
}) => (
  <details className="group rounded-xl border bg-surface shadow-xs">
    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      <ChevronDown
        className="size-4 text-foreground-muted transition-transform group-open:rotate-180"
        aria-hidden="true"
      />
      Feedback đã xử lý
      <span className="text-xs font-normal text-foreground-muted tabular-nums">
        {feedbacks.length}
      </span>
    </summary>
    <ul className="flex flex-col divide-y border-t">
      {feedbacks.map((feedback) => (
        <li key={feedback.id} className="flex flex-col gap-1 px-3 py-2.5 text-[13px]">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">
              {feedback.type === "WRONG" ? "Sai — làm lại" : "Yêu cầu thêm"}
            </span>
            <span
              className={cn(
                "rounded-md px-1.5 py-px text-[11px] font-medium",
                feedback.resolution === "CLOSED"
                  ? "bg-muted text-foreground-muted"
                  : "bg-success-soft text-success"
              )}
            >
              {feedback.resolution === "CLOSED" ? "Đã đóng, không cần làm lại" : "Đã làm lại xong"}
            </span>
          </p>
          <p className="whitespace-pre-wrap text-foreground-muted">{feedback.note}</p>
          {feedback.resolutionNote ? (
            <p className="text-xs whitespace-pre-wrap">Lý do: {feedback.resolutionNote}</p>
          ) : null}
          <p className="text-[11px] text-foreground-subtle">
            {feedback.resolvedBy ? `${feedback.resolvedBy.displayName} · ` : ""}
            {formatDateTime(feedback.resolvedAt, timeZone, true)}
          </p>
        </li>
      ))}
    </ul>
  </details>
);
