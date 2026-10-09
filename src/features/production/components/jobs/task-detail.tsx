import { cn } from "cn";
import {
  ExternalLink,
  FolderOpen,
  PencilLine,
  SlidersHorizontal,
  UserRoundCog
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
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
import { formatNumber, todayIn } from "../../format";
import { useCustomFields, useProcesses, useProductionMe, useShifts, useTags } from "../../hooks";
import { useCachedJob, useProductionTask, useTaskMutations } from "../../jobs-hooks";
import { canSeeTask, formatDateTime, relativeDeadline } from "../../jobs-model";
import { useProductionPeople } from "../../people";
import { sheetOnPhone } from "../../ui";
import { CustomFieldsForm, CustomFieldValue } from "../custom-field-input";
import { FormAlert } from "../settings-kit";
import { TagChips, TagPicker } from "../tag-picker";
import { DateTimeField } from "./date-time-field";
import { Fact, KindBadge, LateBadge, Person, StatusChip } from "./job-bits";
import { OptionSelect, PersonSelect } from "./pickers";
import { ProductionTimeline } from "./timeline";
import { TaskScoresSection } from "./task-scores";
import { TransitionButtons } from "./transition-controls";
import { useTaskMover } from "./use-task-mover";

/**
 * Production task detail (side sheet or /production/tasks/:id): facts, the moves the API offers,
 * leader tools (reassign, quantity correction after Done, edit) and the task timeline.
 */
export const TaskDetailView = ({
  taskId,
  variant,
  onOpenTask
}: {
  taskId: string;
  variant: "sheet" | "page";
  onOpenTask?: (taskId: string) => void;
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
  return <TaskDetailBody task={task.data} variant={variant} onOpenTask={onOpenTask} />;
};

const TaskDetailBody = ({
  task,
  variant,
  onOpenTask
}: {
  task: ProductionTask;
  variant: "sheet" | "page";
  onOpenTask?: ((taskId: string) => void) | undefined;
}) => {
  const me = useProductionMe();
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const people = useProductionPeople([task.assignee, task.qc]);
  const fields = useCustomFields();
  const tags = useTags();
  const mover = useTaskMover();
  const [dialog, setDialog] = useState<"assign" | "qty" | "edit" | null>(null);
  const taskFields = useMemo(() => fieldsFor(fields.data?.items ?? [], "TASK"), [fields.data]);
  const job = useCachedJob(task.jobId);
  const deadline = relativeDeadline(task.deadline);
  const late = task.isLate;
  // Tasks of an archived job are read-only (the API refuses changes too).
  const archived = task.jobArchived || (job?.archived ?? false);
  const caps = archived
    ? { transitions: [], canAssign: false, canEdit: false, canEditQty: false }
    : task.capabilities;
  const { canAssign, canEdit, canEditQty } = caps;
  const jobLeaderId = job?.leader.id ?? null;
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
        <Fact label="Người làm">
          <Person user={task.assignee} />
        </Fact>
        <Fact label="QC">
          <Person user={task.qc} fallback="Chưa gán" />
        </Fact>
        <Fact label="Ca">{task.shift.name}</Fact>
        <Fact label="Số tấm">
          <span className="tabular-nums">
            {task.qtyDone !== null ? `${task.qtyDone} / ` : ""}
            {task.qtyAssigned}
          </span>
          <span className="text-xs text-foreground-muted">
            {" "}
            {task.qtyDone !== null ? "xong / giao" : "được giao"}
          </span>
        </Fact>
        <Fact label="Deadline">
          <span className={cn(late && "font-medium text-danger")}>
            {formatDateTime(task.deadline, timeZone)}
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
        <Fact label="Giao lúc">{formatDateTime(task.assignedAt, timeZone)}</Fact>
        {task.doneAt ? <Fact label="Xong lúc">{formatDateTime(task.doneAt, timeZone)}</Fact> : null}
        {task.checkedAt ? (
          <Fact label="Kiểm lúc">{formatDateTime(task.checkedAt, timeZone)}</Fact>
        ) : null}
        {task.otHours !== null ? (
          <Fact label="Giờ OT">{formatNumber(task.otHours)} giờ</Fact>
        ) : null}
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

      {canAssign || canEdit || (canEditQty && task.doneAt) ? (
        <div className="flex flex-wrap gap-2">
          {canAssign ? (
            <Button variant="outline" size="sm" onClick={() => setDialog("assign")}>
              <UserRoundCog />
              Đổi người làm / QC
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
              Sửa task
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
        onClose={() => setDialog(null)}
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
  onClose
}: {
  open: boolean;
  task: ProductionTask;
  onClose: () => void;
}) => {
  const ids = useId();
  const people = useProductionPeople([task.assignee, task.qc]);
  const mutations = useTaskMutations();
  const [assigneeId, setAssigneeId] = useState<string | null>(task.assignee.id);
  const [qcId, setQcId] = useState<string | null>(task.qc?.id ?? null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const workers = people.withRole("STAFF", "LEADER");
  const checkers = people.withRole("QC");
  const done = task.doneAt !== null;

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
      <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
        <DialogHeader>
          <DialogTitle>Đổi người làm / QC · #{task.number}</DialogTitle>
          <DialogDescription>
            Người được giao và QC mới sẽ nhận thông báo. QC phải khác người làm.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={`${ids}-assignee`}>Người làm</FieldLabel>
          <PersonSelect
            id={`${ids}-assignee`}
            people={workers}
            value={assigneeId}
            onChange={setAssigneeId}
            disabled={done}
          />
          {done ? (
            <FieldDescription className="text-xs">
              Task đã xong nên không đổi người làm.
            </FieldDescription>
          ) : null}
        </Field>
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
        <DialogFooter>
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
      <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
        <DialogHeader>
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
        <DialogFooter>
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
  const [qty, setQty] = useState(String(task.qtyAssigned));
  const [processId, setProcessId] = useState<string | null>(task.process.id);
  const [shiftId, setShiftId] = useState<string | null>(task.shift.id);
  const [deadline, setDeadline] = useState<string | null>(task.deadline);
  const [note, setNote] = useState(task.note ?? "");
  const [values, setValues] = useState<CustomValues>(task.customValues);
  const [tagIds, setTagIds] = useState<string[]>(task.tagIds);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [valuesTouched, setValuesTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taskFields = useMemo(() => fieldsFor(fields.data?.items ?? [], "TASK"), [fields.data]);
  const processOptions = (processes.data?.items ?? [])
    .filter((process) => (process.active && !process.isQc) || process.id === task.process.id)
    .map((process) => ({ id: process.id, label: process.name }));
  const shiftOptions = (shifts.data?.items ?? [])
    .filter((shift) => shift.active || shift.id === task.shift.id)
    .map((shift) => ({ id: shift.id, label: shift.name }));

  const submit = () => {
    const problems = validateCustomValues(taskFields, values, { enforceRequired: false });
    setFieldErrors(problems);
    const qtyValue = Number(qty);
    if (!done && (!/^\d+$/.test(qty.trim()) || qtyValue < 1)) {
      setError("Số tấm giao nguyên ≥ 1.");
      return;
    }
    if (!deadline) {
      setError("Chọn deadline.");
      return;
    }
    if (Object.keys(problems).length > 0) return;
    const input = {
      ...(!done && qtyValue !== task.qtyAssigned ? { qtyAssigned: qtyValue } : {}),
      ...(!done && processId && processId !== task.process.id ? { processId } : {}),
      ...(!done && shiftId && shiftId !== task.shift.id ? { shiftId } : {}),
      ...(deadline !== task.deadline ? { deadline } : {}),
      ...((note.trim() || null) !== task.note ? { note: note.trim() || null } : {}),
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
          className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col max-sm:max-h-[92dvh]"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader className="border-b px-4 pt-4 pb-3">
            <DialogTitle>Sửa task #{task.number}</DialogTitle>
            <DialogDescription>
              {done
                ? "Task đã xong: chỉ sửa được deadline, ghi chú, trường tùy chỉnh và tag."
                : "Mọi thay đổi được ghi vào lịch sử task."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor={`${ids}-qty`}>Số tấm giao</FieldLabel>
                <Input
                  id={`${ids}-qty`}
                  inputMode="numeric"
                  value={qty}
                  disabled={done}
                  onChange={(event) => setQty(event.target.value)}
                  className="tabular-nums"
                />
              </Field>
              <Field>
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
              <Field>
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
            </div>
            <Field>
              <FieldLabel htmlFor={`${ids}-deadline`}>Deadline</FieldLabel>
              <DateTimeField
                id={`${ids}-deadline`}
                value={deadline}
                onChange={setDeadline}
                timeZone={timeZone}
                today={todayIn(timeZone)}
                aria-label="Deadline"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${ids}-note`}>Ghi chú</FieldLabel>
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
                aria-label="Tag của task"
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
                today={todayIn(timeZone)}
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
