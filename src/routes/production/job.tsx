import { cn } from "cn";
import { motion } from "motion/react";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  Ellipsis,
  MessageSquare,
  MessagesSquare,
  ListPlus,
  PencilLine,
  Split,
  Trash2
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { Link } from "@/components/shared/router-link";
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
import type { JobDetail } from "@/contracts/production-jobs";
import { useSessionContext } from "@/features/auth/hooks";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import {
  Fact,
  LateBadge,
  MiniBar,
  Person,
  ProcessTotalChips
} from "@/features/production/components/jobs/job-bits";
import { JobFormDialog } from "@/features/production/components/jobs/job-form-dialog";
import { JobLog } from "@/features/production/components/jobs/job-log";
import { JobStatusMenu } from "@/features/production/components/jobs/job-status-menu";
import { JobTasks } from "@/features/production/components/jobs/job-tasks";
import { SplitTasksDialog } from "@/features/production/components/jobs/split-tasks-dialog";
import { WorkEntryDialog } from "@/features/production/components/jobs/work-entry-dialog";
import { ProductionTimeline } from "@/features/production/components/jobs/timeline";
import { useTaskMover } from "@/features/production/components/jobs/use-task-mover";
import { WorkLinkValue } from "@/features/production/components/jobs/work-link";
import { CustomFieldValue } from "@/features/production/components/custom-field-input";
import { ConfirmDialog } from "@/features/production/components/settings-kit";
import { TagChips } from "@/features/production/components/tag-picker";
import { fieldsFor, isEmptyValue } from "@/features/production/custom-fields";
import { productionErrorMessage } from "@/features/production/errors";
import { formatInteger } from "@/features/production/format";
import {
  useCustomFields,
  useProductionAccess,
  useProductionMe,
  useTags
} from "@/features/production/hooks";
import {
  useDeleteJob,
  useJob,
  useOpenJobChat,
  useUpdateJob
} from "@/features/production/jobs-hooks";
import {
  assignedNormalQty,
  canSeeJob,
  formatWorkDay,
  jobDeadlineCountdown,
  jobLines,
  jobProgress
} from "@/features/production/jobs-model";
import { useProductionPeople } from "@/features/production/people";
import { useOpenTask } from "@/features/production/task-link";
import { touchTargets } from "@/features/production/ui";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * /production/jobs/:jobId — the work package (PD-035: Dự án + Gói công việc, Ngày nhận / Ngày giao, optional leader,
 * Tổng tấm), progress, its lines with their status dropdowns and nested subtasks, the lines' history ("Nhật ký",
 * PD-044) and the timeline. PD-045: the job's status chip in the header is the only job-level status action — no line
 * bulk moves, no separate feedback ("Đã xong" waits there, disabled, until every line is checked). What the caller may
 * change follows the job permission matrix (job.capabilities, PD-036).
 */
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

type Dialogs = "split" | "entry" | "edit" | "archive" | "delete" | null;

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
  const chat = useOpenJobChat();
  const update = useUpdateJob(job.id);
  const remove = useDeleteJob(job.id);
  const access = useProductionAccess();
  const myId = useSessionContext().user.id;
  // Mirrors the API: the job's leader (any Leader when it has none, PD-035), an Account or an Admin creates the job
  // chat.
  const actsAsLeader = job.leader
    ? job.leader.id === myId && access.can("LEADER")
    : access.can("LEADER");
  const canCreateChat = actsAsLeader || access.can("ACCOUNT");
  const people = useProductionPeople([
    job.leader,
    job.createdBy,
    ...job.tasks.flatMap((task) => [task.assignee, task.qc])
  ]);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const progress = jobProgress(job);
  // Over-allocation is about the client's images: feedback redo tasks are extra work, not extra images. An automatic
  // Tổng tấm follows the lines (PD-035), so only a typed one can be exceeded.
  const overBy = job.totalImagesManual ? assignedNormalQty(job.tasks) - job.totalImages : 0;
  // An archived job is parked: a countdown ("trễ 8 giờ") means nothing there.
  const deadline = job.archived ? null : jobDeadlineCountdown(job, mover.lookup.statuses);
  const late = job.lateTaskCount > 0;
  const caps = job.capabilities;
  // Archived jobs are read-only: only restoring (and reading the chat) stays available.
  const active = !job.archived;
  // Subtasks sit inside their line: the count is of lines.
  const lineCount = jobLines(job.tasks).length;
  const desktop = breakpoint === "desktop";
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

  // PD-044: the job's subtasks — their own status / create rows repeat their line's in the side timeline.
  const subtaskIds = new Set(job.tasks.filter((task) => task.isSubtask).map((task) => task.id));
  const timeline = (
    <ProductionTimeline
      entity="jobs"
      id={job.id}
      people={people}
      mentionable={(personId) => canSeeJob(personId, people.roles.get(personId), job)}
      readOnly={job.archived}
      hiddenTaskIds={subtaskIds}
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
            {/* Phones: the chips drop under the title. From sm: they sit at the right, centred on the code's first
                line (the 11px label + gap above it ≈ 1.25rem), and never squeeze the title into a sliver. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase">
                  Gói công việc
                </span>
                <h1 className="text-xl leading-tight font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">
                  {job.code}
                </h1>
                <p className="text-[13px] text-foreground-muted">
                  <span className="font-mono">{job.project.code}</span>
                  {subtitle.length > 0 ? ` · ${subtitle.join(" · ")}` : ""}
                </p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:mt-5 sm:max-w-[50%] sm:shrink-0 sm:justify-end">
                {job.archived ? (
                  <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 text-xs whitespace-nowrap text-foreground-muted">
                    <Archive className="size-3.5" aria-hidden="true" />
                    Đã lưu trữ
                  </span>
                ) : null}
                {/* PD-038 / PD-045: the job's only status (the line workflow stays on each line below); "Đã xong"
                    is offered once every line is checked. */}
                <JobStatusMenu
                  jobId={job.id}
                  status={job.jobStatus}
                  readiness={job}
                  editable={caps.canChangeStatus && active}
                  align={breakpoint === "mobile" ? "start" : "end"}
                />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-surface p-3 shadow-xs md:grid-cols-4">
              <Fact label="Leader">
                {job.leader ? (
                  <Person user={job.leader} />
                ) : (
                  <span className="text-foreground-muted">Chưa có leader</span>
                )}
              </Fact>
              <Fact label="Ngày nhận">
                <span className="tabular-nums">{formatWorkDay(job.receivedAt, timeZone)}</span>
              </Fact>
              <Fact label="Ngày giao">
                <span className={cn("tabular-nums", late && "font-medium text-danger")}>
                  {formatWorkDay(job.deadline, timeZone)}
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
                {/* PD-046: a web link opens, a folder path is shown with "Sao chép" (like "Link chia việc"). */}
                <WorkLinkValue value={job.driveLink} />
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

            {/* Tổng tấm leads with its breakdown per process (PD-048; full width on phones, a wider first column
                from sm), then the three progress figures measured against it. */}
            <section
              aria-label="Tiến độ"
              className="grid grid-cols-3 gap-3 rounded-xl border bg-surface p-3 shadow-xs sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]"
            >
              <ProgressStat
                label="Tổng tấm"
                value={job.totalImages}
                hint={job.totalImagesManual ? undefined : "tự tính"}
                hintTone="muted"
                className={cn(
                  "col-span-3 sm:col-span-1",
                  job.processTotals.length > 0 && "max-sm:border-b max-sm:pb-3"
                )}
              >
                <ProcessTotalChips totals={job.processTotals} size="md" />
              </ProgressStat>
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
                    Job đã lưu trữ nên chỉ xem được: không thêm task, chuyển trạng thái, sửa hay xoá
                    job.
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
                caps.splitOwnOnly ? (
                  // "create: own" (PD-036): one's own work-log rows, straight into this package.
                  <Button onClick={() => setDialog("entry")}>
                    <ListPlus />
                    Nhập công việc
                  </Button>
                ) : (
                  <Button onClick={() => setDialog("split")}>
                    <Split />
                    Chia task
                  </Button>
                )
              ) : null}
              {(canCreateChat && active) || job.channelId ? (
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
              {active && (caps.canEdit || caps.canArchive || caps.canDelete) ? (
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
                    {caps.canDelete ? (
                      <>
                        {caps.canEdit || caps.canArchive ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
                          <Trash2 />
                          Xoá job
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </header>

          <section aria-labelledby="job-tasks" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 id="job-tasks" className="text-sm font-semibold">
                Task
              </h2>
              <span className="text-xs text-foreground-muted tabular-nums">{lineCount}</span>
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
              canAdd={caps.canSplit && active}
            />
          </section>

          {/* PD-044: the lines' history under the table, on every layout (the desktop aside keeps comments + history). */}
          <JobLog job={job} nameOf={people.nameOf} timeZone={timeZone} onOpenTask={openTask} />
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
        <SplitTasksDialog
          key={`split-${dialog === "split"}`}
          open={dialog === "split"}
          job={job}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {caps.canSplit && caps.splitOwnOnly ? (
        <WorkEntryDialog
          key={`entry-${dialog === "entry"}`}
          open={dialog === "entry"}
          // PD-038: the entry starts in this job (and its project).
          initial={{
            projectId: job.project.id,
            job: {
              id: job.id,
              code: job.code,
              projectId: job.project.id,
              deadline: job.deadline,
              jobStatus: job.jobStatus
            }
          }}
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
        open={dialog === "delete"}
        onOpenChange={(open) => !open && !remove.isPending && setDialog(null)}
        title={`Xoá job ${job.code}?`}
        description={`Job và ${job.tasks.length} task bị ẩn khỏi mọi danh sách nhưng vẫn giữ trong lịch sử. Điểm / tiền đã ghi cho các task được trừ lại bằng dòng điều chỉnh. Gói công việc này có thể được nhập lại sau.`}
        confirmLabel="Xoá job"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: (result) => {
              toast.success(
                result.reversedEntries > 0
                  ? `Đã xoá job và trừ lại điểm của ${result.deletedTasks} task`
                  : "Đã xoá job"
              );
              setDialog(null);
              void navigate("/production/jobs", { replace: true });
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
  hint,
  hintTone = "warning",
  className,
  children
}: {
  label: string;
  value: number;
  percent?: number;
  tone?: "brand" | "success" | "muted" | "warning";
  hint?: string | undefined;
  hintTone?: "warning" | "muted";
  className?: string | undefined;
  /** Under the number (Tổng tấm: its breakdown per process). */
  children?: ReactNode;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
    <span className="truncate text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase">
      {label}
    </span>
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-lg font-semibold tabular-nums">{formatInteger(value)}</span>
      {percent !== undefined ? (
        <span className="text-xs text-foreground-muted tabular-nums">{percent}%</span>
      ) : null}
      {hint ? (
        <span
          className={cn(
            "text-xs",
            hintTone === "warning" ? "font-medium text-warning" : "text-foreground-muted"
          )}
        >
          {hint}
        </span>
      ) : null}
    </span>
    {percent !== undefined ? <MiniBar value={percent} tone={tone} className="h-1.5" /> : null}
    {children}
  </div>
);
