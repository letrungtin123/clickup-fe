import { cn } from "cn";
import {
  ExternalLink,
  FolderOpen,
  MessageSquareWarning,
  PencilLine,
  SlidersHorizontal,
  Trash2,
  UserRoundCog
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Link } from "@/components/shared/router-link";
import { toast } from "sonner";

import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { CustomValues } from "@/contracts/production-catalog";
import type { ProductionTask } from "@/contracts/production-jobs";

import { fieldsFor, toCustomValuesPayload, validateCustomValues } from "../../custom-fields";
import { productionErrorMessage } from "../../errors";
import { formatCredit, formatInteger, formatNumber, todayIn } from "../../format";
import { useCustomFields, useProcesses, useProductionMe, useShifts, useTags } from "../../hooks";
import { useCachedJob, useProductionTask, useTaskMutations } from "../../jobs-hooks";
import {
  canSeeTask,
  dueDayToIso,
  formatDateTime,
  formatWorkDay,
  isoToDay,
  lineOptionalNumbers,
  myCreditSummary,
  receivedDayToIso,
  relativeDeadline,
  taskLineProblems,
  WORK_LINK_MAX,
  workLinkValue
} from "../../jobs-model";
import { useProductionPeople } from "../../people";
import { phoneSheetColumn, sheetOnPhone, touchTargets } from "../../ui";
import { CustomFieldsForm, CustomFieldValue } from "../custom-field-input";
import { DateField } from "../date-field";
import { ConfirmDialog, FormAlert } from "../settings-kit";
import { TagChips, TagPicker } from "../tag-picker";
import { Fact, KindBadge, LateBadge, Person, StatusChip } from "./job-bits";
import { OptionSelect, PersonSelect } from "./pickers";
import { ProductionTimeline } from "./timeline";
import { TaskScoresSection } from "./task-scores";
import { TransitionButtons } from "./transition-controls";
import { useTaskMover } from "./use-task-mover";
import { WorkLinkValue } from "./work-link";

/**
 * Production task detail (side sheet or /production/tasks/:id): the work-log facts (PD-035), the moves the API
 * offers, the tools the job permission matrix allows (edit, change assignee / QC, quantity correction after Done,
 * delete — PD-036) and the task timeline.
 */
export const TaskDetailView = ({
  taskId,
  variant,
  onOpenTask,
  onDeleted
}: {
  taskId: string;
  variant: "sheet" | "page";
  onOpenTask?: (taskId: string) => void;
  /** The line was deleted (leave the sheet / page). */
  onDeleted?: (jobId: string) => void;
}) => {
  const task = useProductionTask(taskId);

  if (task.isPending) {
    return (
      <div className="flex flex-col gap-4 p-5" aria-busy="true" aria-label="Đang tải task">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-2/3" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (task.isError) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <ErrorState
          error={task.error}
          onRetry={() => void task.refetch()}
          retrying={task.isFetching}
        />
      </div>
    );
  }
  return (
    <TaskDetailBody
      task={task.data}
      variant={variant}
      onOpenTask={onOpenTask}
      onDeleted={onDeleted}
    />
  );
};

const TaskDetailBody = ({
  task,
  variant,
  onOpenTask,
  onDeleted
}: {
  task: ProductionTask;
  variant: "sheet" | "page";
  onOpenTask?: ((taskId: string) => void) | undefined;
  onDeleted?: ((jobId: string) => void) | undefined;
}) => {
  const me = useProductionMe();
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const people = useProductionPeople([task.assignee, task.qc]);
  const fields = useCustomFields();
  const tags = useTags();
  const mover = useTaskMover();
  const [dialog, setDialog] = useState<"assign" | "qty" | "edit" | "delete" | null>(null);
  const mutations = useTaskMutations();
  const taskFields = useMemo(() => fieldsFor(fields.data?.items ?? [], "TASK"), [fields.data]);
  const job = useCachedJob(task.jobId);
  const deadline = relativeDeadline(task.deadline);
  const late = task.isLate;
  // "Điểm của tôi" (worker or QC, adjustments included) — PLAN §7.
  const credits = myCreditSummary(task);
  // Tasks of an archived job are read-only (the API refuses changes too).
  const archived = task.jobArchived || (job?.archived ?? false);
  const caps = archived
    ? {
        transitions: [],
        canAssign: false,
        canChangeAssignee: false,
        canEdit: false,
        canEditQty: false,
        canDelete: false
      }
    : task.capabilities;
  const { canEdit, canEditQty, canDelete, canChangeAssignee } = caps;
  // A Checking line has no QC of its own (PD-037): only its assignee can change.
  const checking = task.process.isQc;
  const canAssign = caps.canAssign && (!checking || canChangeAssignee);
  const jobLeaderId = job?.leader?.id ?? null;
  const removeTask = () =>
    mutations.remove.mutate(task.id, {
      onSuccess: (result) => {
        toast.success(
          result.reversedEntries > 0
            ? `Đã xoá dòng #${task.number} và trừ lại điểm đã ghi`
            : `Đã xoá dòng #${task.number}`
        );
        setDialog(null);
        onDeleted?.(result.jobId);
      },
      onError: (failure) => toast.error(productionErrorMessage(failure))
    });
  const mentionable = (personId: string) =>
    canSeeTask(personId, people.roles.get(personId), task, jobLeaderId);

  return (
    <div className={cn("flex flex-col gap-5", variant === "sheet" ? "px-4 pt-1 pb-6 md:px-5" : "")}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
          <Link
            to={`/production/jobs/${task.jobId}`}
            className="inline-flex items-center gap-1 rounded font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-10"
          >
            <FolderOpen className="size-3.5" aria-hidden="true" />
            {task.jobCode}
          </Link>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{task.project.code}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">
            #{task.number} · {task.process.name}
          </h2>
          <KindBadge kind={task.kind} />
          {late ? <LateBadge /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={task.status} />
          {task.qcFailCount > 0 ? (
            <span className="text-xs text-danger">QC trả lại {task.qcFailCount} lần</span>
          ) : null}
        </div>
        {archived ? (
          <p className="text-xs text-foreground-muted">Job đã lưu trữ — task chỉ xem được.</p>
        ) : null}
        {task.lastQcFail ? (
          // PLAN §7 "xem note QC": the latest QC fail, who and when (history keeps every one).
          <div
            className={cn(
              "flex gap-2 rounded-lg px-3 py-2 text-[13px]",
              task.checkedAt === null ? "bg-danger-soft" : "bg-muted/60"
            )}
          >
            <MessageSquareWarning
              className={cn(
                "mt-0.5 size-4 shrink-0",
                task.checkedAt === null ? "text-danger" : "text-foreground-muted"
              )}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground-muted">
                {task.checkedAt === null ? "QC trả lại gần nhất" : "Lần QC trả lại gần nhất"}
                {" · "}
                {task.lastQcFail.by?.displayName ?? "QC"},{" "}
                {formatDateTime(task.lastQcFail.at, timeZone)}
              </span>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                {task.lastQcFail.note ?? "Không ghi lý do."}
              </p>
            </div>
          </div>
        ) : null}
        <TransitionButtons
          task={
            archived ? { ...task, capabilities: { ...task.capabilities, transitions: [] } } : task
          }
          busy={mover.isPending}
          onMove={(option) => mover.start(task, option)}
          size="sm"
          className="pt-1"
        />
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-surface p-3 sm:grid-cols-3">
        <Fact label="Nhân viên thực hiện">
          <Person user={task.assignee} />
        </Fact>
        <Fact label="QC">
          {checking ? (
            <span className="text-foreground-muted">Dòng Checking — không có QC</span>
          ) : (
            <Person user={task.qc} fallback="Chưa gán" />
          )}
        </Fact>
        <Fact label="Ca">{task.shift.name}</Fact>
        <Fact label="Số lượng">
          <span className="tabular-nums">
            {task.qtyDone !== null ? `${formatInteger(task.qtyDone)} / ` : ""}
            {formatInteger(task.qtyAssigned)}
          </span>
          <span className="text-xs text-foreground-muted">
            {" "}
            {task.qtyDone !== null ? "xong / giao" : "được giao"}
          </span>
        </Fact>
        <Fact label="Hình lỗi">
          <span className="tabular-nums">
            {task.errorQty === null ? "—" : formatInteger(task.errorQty)}
          </span>
        </Fact>
        <Fact label="Ngày nhận">{formatWorkDay(task.assignedAt, timeZone)}</Fact>
        <Fact label="Ngày giao">
          <span className={cn(late && "font-medium text-danger")}>
            {formatWorkDay(task.deadline, timeZone)}
          </span>
          {!task.doneAt ? (
            <span
              className={cn(
                "block text-xs",
                deadline.late ? "text-danger" : "text-foreground-muted"
              )}
            >
              {deadline.label}
            </span>
          ) : null}
        </Fact>
        {task.doneAt ? <Fact label="Xong lúc">{formatDateTime(task.doneAt, timeZone)}</Fact> : null}
        {task.checkedAt ? (
          <Fact label="Kiểm lúc">{formatDateTime(task.checkedAt, timeZone)}</Fact>
        ) : null}
        {task.otHours !== null ? (
          <Fact label="Giờ OT">{formatNumber(task.otHours)} giờ</Fact>
        ) : null}
        {credits ? (
          <Fact label="Điểm của tôi">
            <span className="font-medium text-success tabular-nums" title={credits.detail}>
              {formatCredit(credits.credits)} điểm{credits.khoan ? " Khoán" : ""}
            </span>
          </Fact>
        ) : null}
        {/* PD-040: the images given to the person — a web link opens, a folder path is copied. */}
        <Fact label="Link chia việc" className="col-span-full">
          <WorkLinkValue value={task.workLink} />
        </Fact>
      </dl>

      {task.note ? (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase">
            Ghi chú
          </p>
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-[13px] whitespace-pre-wrap">
            {task.note}
          </p>
        </div>
      ) : null}

      {taskFields.length > 0 || task.tagIds.length > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {taskFields.map((field) => (
            <Fact key={field.id} label={field.label}>
              <CustomFieldValue field={field} value={task.customValues[field.key]} />
            </Fact>
          ))}
          {task.tagIds.length > 0 ? (
            <Fact label="Tag">
              <TagChips tags={tags.data?.items ?? []} tagIds={task.tagIds} max={8} />
            </Fact>
          ) : null}
        </dl>
      ) : null}

      <TaskScoresSection task={task} />

      {canAssign || canEdit || canDelete || (canEditQty && task.doneAt) ? (
        <div className="flex flex-wrap gap-2">
          {canAssign ? (
            <Button variant="outline" size="sm" onClick={() => setDialog("assign")}>
              <UserRoundCog />
              {checking ? "Đổi người làm" : canChangeAssignee ? "Đổi người làm / QC" : "Đổi QC"}
            </Button>
          ) : null}
          {canEditQty && task.doneAt ? (
            <Button variant="outline" size="sm" onClick={() => setDialog("qty")}>
              <SlidersHorizontal />
              Sửa số tấm đã xong
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" size="sm" onClick={() => setDialog("edit")}>
              <PencilLine />
              Sửa dòng
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="outline"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={() => setDialog("delete")}
            >
              <Trash2 />
              Xoá dòng
            </Button>
          ) : null}
        </div>
      ) : null}

      {variant === "sheet" ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-foreground-muted max-sm:min-h-10"
          render={<Link to={`/production/tasks/${task.id}`} />}
          nativeButton={false}
        >
          <ExternalLink />
          Mở trang riêng
        </Button>
      ) : null}

      <ProductionTimeline
        entity="tasks"
        id={task.id}
        people={people}
        mentionable={mentionable}
        readOnly={archived}
        onOpenTask={onOpenTask}
        className="border-t pt-4"
      />

      {mover.dialog}
      <AssignDialog
        key={`assign-${task.id}-${dialog === "assign"}`}
        open={dialog === "assign"}
        task={task}
        canChangeAssignee={canChangeAssignee}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(next) => !next && !mutations.remove.isPending && setDialog(null)}
        title={`Xoá dòng #${task.number}?`}
        description={
          task.doneAt
            ? "Dòng bị ẩn khỏi mọi danh sách nhưng vẫn giữ trong lịch sử. Điểm / tiền đã ghi cho dòng này được trừ lại bằng dòng điều chỉnh (sổ điểm không bị sửa)."
            : "Dòng bị ẩn khỏi mọi danh sách nhưng vẫn giữ trong lịch sử của job."
        }
        confirmLabel="Xoá dòng"
        destructive
        pending={mutations.remove.isPending}
        onConfirm={removeTask}
      />
      <QtyDialog
        key={`qty-${task.id}-${dialog === "qty"}`}
        open={dialog === "qty"}
        task={task}
        onClose={() => setDialog(null)}
      />
      <EditTaskDialog
        key={`edit-${task.id}-${dialog === "edit"}`}
        open={dialog === "edit"}
        task={task}
        timeZone={timeZone}
        onClose={() => setDialog(null)}
      />
    </div>
  );
};

const AssignDialog = ({
  open,
  task,
  canChangeAssignee,
  onClose
}: {
  open: boolean;
  task: ProductionTask;
  /** "update: all" before Done (PD-036); otherwise only the QC changes. */
  canChangeAssignee: boolean;
  onClose: () => void;
}) => {
  const ids = useId();
  const people = useProductionPeople([task.assignee, task.qc]);
  const mutations = useTaskMutations();
  const [assigneeId, setAssigneeId] = useState<string | null>(task.assignee.id);
  const [qcId, setQcId] = useState<string | null>(task.qc?.id ?? null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const checking = task.process.isQc;
  const workers = checking ? people.withRole("QC", "LEADER") : people.withRole("STAFF", "LEADER");
  const checkers = people.withRole("QC");
  const done = task.doneAt !== null;
  const assigneeLocked = done || !canChangeAssignee;

  const submit = () => {
    if (!assigneeId) {
      setError("Chọn người làm.");
      return;
    }
    if (qcId && qcId === assigneeId) {
      setError("QC phải khác người làm.");
      return;
    }
    const input = {
      ...(assigneeId !== task.assignee.id ? { assigneeId } : {}),
      ...(qcId !== (task.qc?.id ?? null) ? { qcId } : {}),
      ...(note.trim() ? { note: note.trim() } : {})
    };
    if (!("assigneeId" in input) && !("qcId" in input)) {
      onClose();
      return;
    }
    mutations.assign.mutate(
      { taskId: task.id, input },
      {
        onSuccess: () => {
          toast.success(`Đã cập nhật người làm / QC của #${task.number}`);
          onClose();
        },
        onError: (failure) => setError(productionErrorMessage(failure))
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* Already a bottom sheet on phones (DialogContent); see transition-dialog.tsx. */}
      <DialogContent className={cn("sm:max-w-md", touchTargets)}>
        <DialogHeader className="pr-8">
          <DialogTitle>
            {checking ? "Đổi người làm" : assigneeLocked ? "Đổi QC" : "Đổi người làm / QC"} · #
            {task.number}
          </DialogTitle>
          <DialogDescription>
            {checking
              ? "Dòng Checking là việc của người QC, không có QC riêng."
              : "Người được giao và QC mới sẽ nhận thông báo. QC phải khác người làm."}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={`${ids}-assignee`}>Nhân viên thực hiện</FieldLabel>
          <PersonSelect
            id={`${ids}-assignee`}
            people={workers}
            value={assigneeId}
            onChange={setAssigneeId}
            disabled={assigneeLocked}
          />
          {done ? (
            <FieldDescription className="text-xs">
              Dòng đã xong nên không đổi người làm.
            </FieldDescription>
          ) : !canChangeAssignee ? (
            <FieldDescription className="text-xs">
              Bạn chỉ đổi được QC của dòng của mình.
            </FieldDescription>
          ) : null}
        </Field>
        {checking ? null : (
          <Field>
            <FieldLabel htmlFor={`${ids}-qc`}>QC</FieldLabel>
            <PersonSelect
              id={`${ids}-qc`}
              people={checkers.filter((person) => person.id !== assigneeId)}
              value={qcId}
              onChange={setQcId}
              noneLabel="Chưa gán QC"
              disabled={task.checkedAt !== null}
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor={`${ids}-note`}>
            Ghi chú <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
          </FieldLabel>
          <Textarea
            id={`${ids}-note`}
            rows={2}
            maxLength={5000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <FormAlert>{error}</FormAlert>
        <DialogFooter className="max-sm:-bottom-4">
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={mutations.assign.isPending}>
            {mutations.assign.isPending ? <Spinner /> : null}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const QtyDialog = ({
  open,
  task,
  onClose
}: {
  open: boolean;
  task: ProductionTask;
  onClose: () => void;
}) => {
  const ids = useId();
  const mutations = useTaskMutations();
  const [qty, setQty] = useState(String(task.qtyDone ?? task.qtyAssigned));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const value = Number(qty);
    if (!/^\d+$/.test(qty.trim()) || value > 1_000_000) {
      setError("Nhập số tấm nguyên ≥ 0.");
      return;
    }
    if (!note.trim()) {
      setError("Ghi lý do sửa để người làm biết.");
      return;
    }
    mutations.setQty.mutate(
      { taskId: task.id, input: { qtyDone: value, note: note.trim() } },
      {
        onSuccess: () => {
          toast.success(`Đã sửa số tấm của #${task.number}: ${task.qtyDone ?? "?"} → ${value}`);
          onClose();
        },
        onError: (failure) => setError(productionErrorMessage(failure))
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={cn("sm:max-w-md", touchTargets)}>
        <DialogHeader className="pr-8">
          <DialogTitle>Sửa số tấm hoàn thành · #{task.number}</DialogTitle>
          <DialogDescription>
            Điểm được tính lại theo số mới; bản ghi cũ giữ trong lịch sử và người làm nhận thông
            báo.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={`${ids}-qty`}>
            Số tấm đã xong (hiện tại {task.qtyDone ?? "—"})
          </FieldLabel>
          <Input
            id={`${ids}-qty`}
            autoFocus
            inputMode="numeric"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            className="tabular-nums"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${ids}-note`}>Lý do</FieldLabel>
          <Textarea
            id={`${ids}-note`}
            rows={2}
            maxLength={5000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <FormAlert>{error}</FormAlert>
        <DialogFooter className="max-sm:-bottom-4">
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={mutations.setQty.isPending}>
            {mutations.setQty.isPending ? <Spinner /> : null}
            Lưu số tấm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * "Sửa dòng" (PD-035): the line's work-log fields — Quy trình, Ca, Số lượng (before Done), Ngày nhận, Ngày giao,
 * Hình lỗi, Giờ OT, Ghi chú, Link chia việc (PD-040) — plus tags and TASK custom fields. A process change must fit the
 * line's people (a Checking line is the QC person's, without a QC — the API checks it).
 */
const EditTaskDialog = ({
  open,
  task,
  timeZone,
  onClose
}: {
  open: boolean;
  task: ProductionTask;
  timeZone: string;
  onClose: () => void;
}) => {
  const ids = useId();
  const mutations = useTaskMutations();
  const processes = useProcesses();
  const shifts = useShifts();
  const fields = useCustomFields();
  const tags = useTags();
  const done = task.doneAt !== null;
  const initialReceived = isoToDay(task.assignedAt, timeZone);
  const initialDue = isoToDay(task.deadline, timeZone);
  const [qty, setQty] = useState(String(task.qtyAssigned));
  const [processId, setProcessId] = useState<string | null>(task.process.id);
  const [shiftId, setShiftId] = useState<string | null>(task.shift.id);
  const [receivedDay, setReceivedDay] = useState<string | null>(initialReceived);
  const [dueDay, setDueDay] = useState<string | null>(initialDue);
  const [errorQty, setErrorQty] = useState(task.errorQty === null ? "" : String(task.errorQty));
  const [otHours, setOtHours] = useState(
    task.otHours === null ? "" : String(task.otHours).replace(".", ",")
  );
  const [note, setNote] = useState(task.note ?? "");
  const [workLink, setWorkLink] = useState(task.workLink ?? "");
  const [values, setValues] = useState<CustomValues>(task.customValues);
  const [tagIds, setTagIds] = useState<string[]>(task.tagIds);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [valuesTouched, setValuesTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayIn(timeZone);
  const taskFields = useMemo(() => fieldsFor(fields.data?.items ?? [], "TASK"), [fields.data]);
  const processOptions = (processes.data?.items ?? [])
    .filter((process) => process.active || process.id === task.process.id)
    .map((process) => ({ id: process.id, label: process.name, hint: process.isQc ? "QC" : null }));
  const shiftOptions = (shifts.data?.items ?? [])
    .filter((shift) => shift.active || shift.id === task.shift.id)
    .map((shift) => ({ id: shift.id, label: shift.name }));
  const qcProcessIds = new Set(
    (processes.data?.items ?? []).filter((process) => process.isQc).map((process) => process.id)
  );
  // Only the values typed here are checked (people are the API's to check on a process change).
  const problems = taskLineProblems(
    {
      assigneeId: task.assignee.id,
      qcId: null,
      processId,
      shiftId,
      qty: done ? String(task.qtyAssigned) : qty,
      receivedDay,
      dueDay,
      errorQty,
      otHours,
      workLink
    },
    { roles: new Map(), qcProcessIds }
  );
  const shown = showErrors ? problems : {};

  const submit = () => {
    setShowErrors(true);
    // The API enforces required fields whenever custom values are sent (they are only sent once
    // touched), so a task created before a field became required must fill it then.
    const custom = validateCustomValues(taskFields, values, { enforceRequired: valuesTouched });
    setFieldErrors(custom);
    if (
      Object.keys(problems).length > 0 ||
      Object.keys(custom).length > 0 ||
      !receivedDay ||
      !dueDay
    )
      return;
    const qtyValue = Number(qty);
    const numbers = lineOptionalNumbers({ errorQty, otHours });
    const input = {
      ...(!done && qtyValue !== task.qtyAssigned ? { qtyAssigned: qtyValue } : {}),
      ...(!done && processId && processId !== task.process.id ? { processId } : {}),
      ...(!done && shiftId && shiftId !== task.shift.id ? { shiftId } : {}),
      // Days the user did not change keep their stored time.
      ...(receivedDay !== initialReceived
        ? { assignedAt: receivedDayToIso(receivedDay, timeZone) ?? undefined }
        : {}),
      ...(dueDay !== initialDue ? { deadline: dueDayToIso(dueDay, timeZone) ?? undefined } : {}),
      ...(numbers.errorQty !== task.errorQty ? { errorQty: numbers.errorQty } : {}),
      ...(numbers.otHours !== task.otHours ? { otHours: numbers.otHours } : {}),
      ...((note.trim() || null) !== task.note ? { note: note.trim() || null } : {}),
      ...(workLinkValue(workLink) !== task.workLink ? { workLink: workLinkValue(workLink) } : {}),
      ...(valuesTouched ? { customValues: toCustomValuesPayload(taskFields, values) } : {}),
      ...(tagIds.join() !== task.tagIds.join() ? { tagIds } : {})
    };
    mutations.update.mutate(
      { taskId: task.id, input },
      {
        onSuccess: () => {
          toast.success(`Đã lưu #${task.number}`);
          onClose();
        },
        onError: (failure) => setError(productionErrorMessage(failure))
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl",
          sheetOnPhone
        )}
      >
        <form
          noValidate
          className={cn("flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col", phoneSheetColumn)}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader className="border-b px-4 pt-4 pr-12 pb-3">
            <DialogTitle>Sửa dòng #{task.number}</DialogTitle>
            <DialogDescription>
              {done
                ? "Dòng đã xong: quy trình, ca và số lượng giao không đổi được nữa; các thông tin khác vẫn sửa được."
                : "Mọi thay đổi được ghi vào lịch sử. Hình lỗi chỉ để xem lại, không đổi điểm."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={Boolean(shown.process)}>
                <FieldLabel htmlFor={`${ids}-process`}>Quy trình</FieldLabel>
                <OptionSelect
                  id={`${ids}-process`}
                  options={processOptions}
                  value={processId}
                  onChange={setProcessId}
                  placeholder="Chọn"
                  disabled={done}
                />
              </Field>
              <Field data-invalid={Boolean(shown.shift)}>
                <FieldLabel htmlFor={`${ids}-shift`}>Ca</FieldLabel>
                <OptionSelect
                  id={`${ids}-shift`}
                  options={shiftOptions}
                  value={shiftId}
                  onChange={setShiftId}
                  placeholder="Chọn"
                  disabled={done}
                />
              </Field>
              <Field data-invalid={Boolean(shown.qty)}>
                <FieldLabel htmlFor={`${ids}-qty`}>Số lượng</FieldLabel>
                <Input
                  id={`${ids}-qty`}
                  inputMode="numeric"
                  value={qty}
                  disabled={done}
                  aria-invalid={Boolean(shown.qty)}
                  onChange={(event) => setQty(event.target.value)}
                  className="tabular-nums"
                />
                {shown.qty ? <FieldError className="text-xs">{shown.qty}</FieldError> : null}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(shown.received)}>
                <FieldLabel htmlFor={`${ids}-received`}>Ngày nhận</FieldLabel>
                <DateField
                  id={`${ids}-received`}
                  value={receivedDay}
                  onChange={setReceivedDay}
                  today={today}
                  aria-invalid={Boolean(shown.received)}
                />
                {shown.received ? (
                  <FieldError className="text-xs">{shown.received}</FieldError>
                ) : null}
              </Field>
              <Field data-invalid={Boolean(shown.due)}>
                <FieldLabel htmlFor={`${ids}-due`}>Ngày giao</FieldLabel>
                <DateField
                  id={`${ids}-due`}
                  value={dueDay}
                  onChange={setDueDay}
                  today={today}
                  aria-invalid={Boolean(shown.due)}
                />
                {shown.due ? <FieldError className="text-xs">{shown.due}</FieldError> : null}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(shown.errorQty)}>
                <FieldLabel htmlFor={`${ids}-error`}>
                  Hình lỗi <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
                </FieldLabel>
                <Input
                  id={`${ids}-error`}
                  inputMode="numeric"
                  value={errorQty}
                  aria-invalid={Boolean(shown.errorQty)}
                  onChange={(event) => setErrorQty(event.target.value)}
                  className="tabular-nums"
                />
                {shown.errorQty ? (
                  <FieldError className="text-xs">{shown.errorQty}</FieldError>
                ) : (
                  <FieldDescription className="text-xs">
                    Chỉ để xem lại, không đổi điểm hay tiền.
                  </FieldDescription>
                )}
              </Field>
              <Field data-invalid={Boolean(shown.otHours)}>
                <FieldLabel htmlFor={`${ids}-ot`}>
                  Giờ OT <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
                </FieldLabel>
                <Input
                  id={`${ids}-ot`}
                  inputMode="decimal"
                  value={otHours}
                  aria-invalid={Boolean(shown.otHours)}
                  onChange={(event) => setOtHours(event.target.value)}
                  className="tabular-nums"
                />
                {shown.otHours ? (
                  <FieldError className="text-xs">{shown.otHours}</FieldError>
                ) : null}
              </Field>
            </div>
            <Field data-invalid={Boolean(shown.workLink)}>
              <FieldLabel htmlFor={`${ids}-link`}>
                Link chia việc{" "}
                <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
              </FieldLabel>
              <Input
                id={`${ids}-link`}
                value={workLink}
                maxLength={WORK_LINK_MAX}
                autoComplete="off"
                spellCheck={false}
                placeholder="Dán link hoặc đường dẫn thư mục"
                aria-invalid={Boolean(shown.workLink)}
                onChange={(event) => setWorkLink(event.target.value)}
              />
              {shown.workLink ? (
                <FieldError className="text-xs">{shown.workLink}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${ids}-note`}>
                Ghi chú <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
              </FieldLabel>
              <Textarea
                id={`${ids}-note`}
                rows={3}
                maxLength={5000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Tag</FieldLabel>
              <TagPicker
                tags={tags.data?.items ?? []}
                value={tagIds}
                onChange={setTagIds}
                aria-label="Tag của dòng"
              />
            </Field>
            {taskFields.length > 0 ? (
              <CustomFieldsForm
                fields={taskFields}
                values={values}
                onChange={(next) => {
                  setValues(next);
                  setValuesTouched(true);
                  setFieldErrors({});
                }}
                errors={fieldErrors}
                idPrefix={ids}
                today={today}
              />
            ) : null}
            {Object.keys(fieldErrors).length > 0 ? (
              <FieldError>Kiểm tra các trường tùy chỉnh.</FieldError>
            ) : null}
            <FormAlert>{error}</FormAlert>
          </div>
          <DialogFooter className="mx-0 mb-0 px-4 py-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={mutations.update.isPending}>
              {mutations.update.isPending ? <Spinner /> : null}
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
