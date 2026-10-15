import { cn } from "cn";
import { ChevronRight, FileText, Folder, FolderOpen, GitBranch, Plus, Trash2 } from "lucide-react";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Link } from "@/components/shared/router-link";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionSubtask, ProductionTask } from "@/contracts/production-jobs";
import { toneClass } from "@/lib/colors";

import { formatInteger } from "../../format";
import { useProcesses } from "../../hooks";
import { useSubtaskMutations } from "../../jobs-hooks";
import { formatDateTime } from "../../jobs-model";
import {
  lineQtyLeft,
  subtaskDraftProblems,
  subtaskProcessOptions,
  subtaskQtyMax,
  subtaskQtyProblem,
  subtaskReasonValue,
  taskEditErrorMessage,
  wholeNumber,
  type SubtaskDraft
} from "../../task-edit-model";
import { ConfirmDialog, FormAlert } from "../settings-kit";
import { NumberEditor } from "./inline-editors";
import { useInlineEditActive } from "./inline-edit-context";
import { InlineField } from "./inline-field";
import { OptionSelect } from "./pickers";

const sectionTitle = "text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase";

/**
 * "Subtask" of a task (PD-044): part of the task's images done in another process ("Công đoạn"), split off by the
 * worker, with an optional reason (PD-045). The quantity is taken from the task (the total the Leader gave stays the
 * same) and the status follows the task; its code is the task's number + a letter ("#1216a"). Shown as a small file tree
 * (owner, 2026-10-14): the task is the folder (collapsible, count, "Số lượng 11 · Tổng 20": its own part, then the
 * total with its subtasks — PD-048), each subtask a leaf with only its "Số lượng", the task's status colour and its
 * actions on hover, "Thêm subtask" the last leaf. Before Done a subtask's process and quantity are edited in place
 * (click the number; the name opens the subtask, its pencil edits the process) and it can be deleted (its images go
 * back to the task). Its Done quantity is not shown here (PD-048: the task's "Số tấm đã xong" counts it); it is
 * corrected on the subtask's own page.
 */
export const TaskSubtasks = ({
  task,
  archived,
  timeZone,
  onOpenTask
}: {
  task: ProductionTask;
  archived: boolean;
  timeZone: string;
  onOpenTask?: ((taskId: string) => void) | undefined;
}) => {
  const titleId = useId();
  const mutations = useSubtaskMutations();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<ProductionSubtask | null>(null);
  const [open, setOpen] = useState(true);
  const caps = task.capabilities;
  const done = task.doneAt !== null;
  const canCreate = !archived && !done && caps.canCreateSubtask;
  // Without loading each subtask, the task's rights stand for its subtasks (the API checks each one again). Never the
  // task's own canDelete: staff may not delete a task the Leader split, yet they delete their own subtasks before Done
  // (PD-047) — canCreateSubtask is true for the task's worker before Done.
  const canManage = !archived && !done && (caps.canCreateSubtask || caps.canEdit);
  if (task.subtasks.length === 0 && !canCreate) return null;

  const remove = () => {
    if (!removing) return;
    mutations.remove.mutate(
      { subtaskId: removing.id, lineId: task.id },
      {
        onSuccess: () => {
          toast.success(
            `Đã xoá subtask #${removing.code} — ${formatInteger(removing.qtyAssigned)} tấm trả về task #${task.code}`
          );
          setRemoving(null);
        },
        onError: (failure) => toast.error(taskEditErrorMessage(failure))
      }
    );
  };

  const count = task.subtasks.length;
  const listId = `${titleId}-tree`;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={titleId} className={cn(sectionTitle, "flex items-center gap-1.5")}>
          <GitBranch className="size-3.5" aria-hidden="true" />
          Subtask
          <span className="rounded-full bg-muted px-1.5 text-[11px] text-foreground-muted tabular-nums normal-case">
            {count}
          </span>
        </h3>
        <p className="text-xs text-foreground-muted">
          Tách một phần số tấm sang công đoạn khác; trạng thái đi theo task này.
        </p>
      </div>
      <div className="rounded-xl border bg-surface p-1.5 shadow-xs">
        {/* The task itself: the tree's folder (collapsible). */}
        <div className="flex min-h-10 flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg px-1.5 py-1">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={listId}
            aria-label={
              open ? `Thu gọn subtask của task #${task.code}` : `Mở subtask của task #${task.code}`
            }
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-foreground-subtle outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:size-10"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn("size-4 transition-transform duration-150", open && "rotate-90")}
            />
          </button>
          {open ? (
            <FolderOpen aria-hidden="true" className="size-4 shrink-0 text-warning" />
          ) : (
            <Folder aria-hidden="true" className="size-4 shrink-0 text-warning" />
          )}
          <span
            className="min-w-0 truncate text-[13px] font-semibold"
            title={`#${task.code} · ${task.process.name}`}
          >
            #{task.code} · {task.process.name}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] font-medium text-foreground-muted tabular-nums">
            {count}
          </span>
          {/* PD-048: its own part, then the total with its subtasks ("Số lượng 11 · Tổng 20"), in the shared columns. */}
          <div className={rowColumns}>
            <span className="flex items-center justify-end whitespace-nowrap text-foreground-muted">
              {/* One inline run: a flex container would drop the space before the number. */}
              <span>
                Số lượng{" "}
                <span className="font-medium text-foreground">{formatInteger(task.qtyAssigned)}</span>
              </span>
              {canManage && count > 0 ? <PencilRoom /> : null}
            </span>
            <span className="text-right whitespace-nowrap text-foreground-muted">
              {count > 0 ? (
                <>
                  Tổng{" "}
                  <span className="font-medium text-foreground">
                    {formatInteger(task.allocatedQty)}
                  </span>
                </>
              ) : null}
            </span>
            <StatusDot status={task.status} title={`Trạng thái: ${task.status.name}`} />
            <span aria-hidden="true" />
          </div>
        </div>
        {open ? (
          <div id={listId} className="ml-[1.375rem] max-sm:ml-[1.625rem]">
            {count > 0 ? (
              <ul className="flex flex-col" aria-label={`Subtask của task #${task.code}`}>
                {task.subtasks.map((subtask, index) => (
                  <SubtaskRow
                    key={subtask.id}
                    line={task}
                    subtask={subtask}
                    timeZone={timeZone}
                    canManage={canManage}
                    onOpenTask={onOpenTask}
                    onRemove={() => setRemoving(subtask)}
                    last={index === count - 1 && !canCreate && !creating}
                  />
                ))}
              </ul>
            ) : null}
            {creating ? (
              <TreeBranch last>
                <SubtaskCreateForm task={task} onClose={() => setCreating(false)} />
              </TreeBranch>
            ) : canCreate ? (
              <TreeBranch last>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-foreground-muted outline-none hover:bg-surface-hover hover:text-brand-text focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-10"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Thêm subtask
                </button>
              </TreeBranch>
            ) : null}
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => !next && !mutations.remove.isPending && setRemoving(null)}
        title={`Xoá subtask #${removing?.code ?? ""}?`}
        description={`${formatInteger(removing?.qtyAssigned ?? 0)} tấm của subtask trả về task #${task.code}. Việc xoá được ghi vào lịch sử của task.`}
        confirmLabel="Xoá subtask"
        destructive
        pending={mutations.remove.isPending}
        onConfirm={remove}
      />
    </section>
  );
};

/**
 * The right-hand columns of every tree row, the same fixed widths on the task row and on each subtask row so the
 * numbers line up (owner, 2026-10-15): Số lượng · Tổng · status dot · action. Right-aligned (`ml-auto`), so they stay
 * aligned whatever the row's indent; on phones they wrap under the name, still at the right edge.
 */
const rowColumns =
  "ml-auto grid shrink-0 grid-cols-[7rem_5rem_1rem_2.5rem] items-center text-[13px] tabular-nums";

/** Room the subtask quantity's pencil takes after its number (gap + icon), kept on the task row to align the numbers. */
const PencilRoom = () => <span aria-hidden="true" className="inline-block w-5 shrink-0" />;

/** The task's status as a dot (its subtasks follow it). */
const StatusDot = ({ status, title }: { status: ProductionTask["status"]; title: string }) => (
  <span
    title={title}
    className={cn(
      toneClass(status.color),
      "inline-flex size-4 items-center justify-center justify-self-center"
    )}
  >
    <span aria-hidden="true" className="size-2 rounded-full bg-(--tone)" />
    <span className="sr-only">Trạng thái {status.name}</span>
  </span>
);

/**
 * One branch of the subtask tree: the vertical guide on the left (stopping at the middle of the last branch) and the
 * short connector into the row, like a file tree. Children are the row content.
 */
const TreeBranch = ({
  last = false,
  as: Tag = "div",
  className,
  children
}: {
  last?: boolean;
  as?: "div" | "li";
  className?: string;
  children: ReactNode;
}) => (
  <Tag className={cn("relative pl-5", className)}>
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-0 left-0 w-px bg-border",
        last ? "h-[1.125rem] max-sm:h-5" : "h-full"
      )}
    />
    <span
      aria-hidden="true"
      className="absolute top-[1.125rem] left-0 h-px w-3.5 bg-border max-sm:top-5"
    />
    {children}
  </Tag>
);

const SubtaskRow = ({
  line,
  subtask,
  timeZone,
  canManage,
  onOpenTask,
  onRemove,
  last
}: {
  line: ProductionTask;
  subtask: ProductionSubtask;
  timeZone: string;
  canManage: boolean;
  onOpenTask?: ((taskId: string) => void) | undefined;
  onRemove: () => void;
  /** The tree's last branch (its guide stops halfway). */
  last: boolean;
}) => {
  const processes = useProcesses();
  const mutations = useSubtaskMutations();
  const max = subtaskQtyMax(line.qtyAssigned, subtask.qtyAssigned);
  const name = `#${subtask.code} · ${subtask.process.name}`;
  const qtyKey = `sub-${subtask.id}-qty`;
  const editingQty = useInlineEditActive(qtyKey);
  const openClass =
    "inline-flex max-w-full min-w-0 items-center rounded text-[13px] font-medium text-foreground outline-none hover:text-brand-text hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-10";

  const meta = [
    subtask.reason,
    `Tách bởi ${subtask.createdBy?.displayName ?? "—"} · ${formatDateTime(subtask.createdAt, timeZone)}`
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TreeBranch as="li" last={last}>
      <div className="group/leaf flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-surface-hover focus-within:bg-surface-hover">
        <FileText aria-hidden="true" className="size-4 shrink-0 text-brand-text" />
        {/* The name opens the subtask; its pencil changes the process. */}
        <InlineField
          variant="inline"
          trigger="pencil"
          editKey={`sub-${subtask.id}-process`}
          label={`Công đoạn subtask #${subtask.code}`}
          canEdit={canManage}
          className="min-w-0 flex-1"
          initial={(): string | null => subtask.process.id}
          renderEditor={({ id, value, onChange, invalid, disabled, label }) => (
            <OptionSelect
              id={id}
              aria-label={label}
              options={subtaskProcessOptions(
                processes.data?.items ?? [],
                line.process.id,
                subtask.process.id
              )}
              value={value}
              onChange={onChange}
              invalid={invalid}
              disabled={disabled}
              placeholder="Chọn công đoạn"
            />
          )}
          validate={(value) => (value ? null : "Chọn công đoạn.")}
          isUnchanged={(value) => value === subtask.process.id}
          onSave={(value) =>
            mutations.update.mutateAsync({
              subtaskId: subtask.id,
              input: { processId: value ?? subtask.process.id }
            })
          }
          successMessage={`Đã đổi công đoạn của subtask #${subtask.code}`}
        >
          {onOpenTask ? (
            <button type="button" className={openClass} onClick={() => onOpenTask(subtask.id)}>
              <span className="truncate">{name}</span>
            </button>
          ) : (
            <Link to={`/production/tasks/${subtask.id}`} className={openClass}>
              <span className="truncate">{name}</span>
            </Link>
          )}
        </InlineField>
        <div className={editingQty ? "w-full basis-full pl-6 text-[13px]" : rowColumns}>
          <div className={editingQty ? undefined : "flex justify-end"}>
            <InlineField
              variant="inline"
              editKey={qtyKey}
              label={`Số lượng của subtask #${subtask.code}`}
              editorLabel="Số lượng của subtask"
              canEdit={canManage}
              initial={() => String(subtask.qtyAssigned)}
              renderEditor={(props) => <NumberEditor {...props} />}
              validate={(value) => subtaskQtyProblem(value, max)}
              isUnchanged={(value) => wholeNumber(value) === subtask.qtyAssigned}
              hint={(value) => {
                const left = lineQtyLeft(line.qtyAssigned, subtask.qtyAssigned, value);
                return `Task gốc còn ${left === null ? "…" : formatInteger(left)} tấm · Tổng Leader giao vẫn là ${formatInteger(line.allocatedQty)}`;
              }}
              onSave={(value) =>
                mutations.update.mutateAsync({
                  subtaskId: subtask.id,
                  input: { qtyAssigned: wholeNumber(value) ?? subtask.qtyAssigned }
                })
              }
              successMessage={(value) =>
                `Đã sửa số tấm của subtask #${subtask.code}: ${formatInteger(subtask.qtyAssigned)} → ${value.trim()}`
              }
            >
              {/* PD-048: only its quantity (its Done quantity counts in the task's "Số tấm đã xong"). */}
              <span className="text-foreground-muted">
                Số lượng{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatInteger(subtask.qtyAssigned)}
                </span>
              </span>
            </InlineField>
          </div>
          {editingQty ? null : (
            <>
              <span aria-hidden="true" />
              {/* Status follows the task: its colour, the name on hover. */}
              <StatusDot
                status={line.status}
                title={`Trạng thái theo task #${line.code}: ${line.status.name}`}
              />
              <span className="flex justify-end">
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Xoá subtask #${subtask.code}`}
                    title={`Xoá subtask #${subtask.code}`}
                    onClick={onRemove}
                    className="shrink-0 text-foreground-subtle hover:text-danger pointer-fine:opacity-0 pointer-fine:group-hover/leaf:opacity-100 pointer-fine:group-focus-within/leaf:opacity-100 max-sm:size-10"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </span>
            </>
          )}
        </div>
        <p className="w-full truncate pl-6 text-[11px] text-foreground-subtle" title={meta}>
          {subtask.reason ? <span className="text-foreground-muted">{subtask.reason}</span> : null}
          {subtask.reason ? " · " : null}
          Tách bởi {subtask.createdBy?.displayName ?? "—"} ·{" "}
          {formatDateTime(subtask.createdAt, timeZone)}
        </p>
      </div>
    </TreeBranch>
  );
};

/**
 * "Tạo subtask": Công đoạn (active, not QC, not the task's), Số tấm (the task keeps at least 1) and Lý do (optional,
 * PD-045: an empty reason is not sent).
 * Live hint: what the task keeps; the total the Leader gave does not change.
 */
const SubtaskCreateForm = ({ task, onClose }: { task: ProductionTask; onClose: () => void }) => {
  const ids = useId();
  const processes = useProcesses();
  const mutations = useSubtaskMutations();
  const [draft, setDraft] = useState<SubtaskDraft>({ processId: null, qty: "", reason: "" });
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const max = subtaskQtyMax(task.qtyAssigned);
  const problems = subtaskDraftProblems(draft, max);
  const shown = showErrors ? problems : {};
  const left = lineQtyLeft(task.qtyAssigned, 0, draft.qty);
  const options = subtaskProcessOptions(processes.data?.items ?? [], task.process.id);
  const busy = mutations.create.isPending;
  const set = (patch: Partial<SubtaskDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const submit = () => {
    setShowErrors(true);
    if (Object.keys(problems).length > 0 || !draft.processId) return;
    const qty = wholeNumber(draft.qty) ?? 0;
    const processName = options.find((option) => option.id === draft.processId)?.label ?? "";
    mutations.create.mutate(
      {
        taskId: task.id,
        input: {
          processId: draft.processId,
          qtyAssigned: qty,
          reason: subtaskReasonValue(draft.reason)
        }
      },
      {
        onSuccess: () => {
          toast.success(`Đã tách ${formatInteger(qty)} tấm của #${task.code} sang ${processName}`);
          onClose();
        },
        onError: (failure) => setError(taskEditErrorMessage(failure))
      }
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Escape" || busy) return;
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  const qtyHint =
    left !== null && !shown.qty
      ? `Task gốc còn ${formatInteger(Math.max(left, 0))} tấm · Tổng Leader giao vẫn là ${formatInteger(task.allocatedQty)}`
      : null;

  return (
    <form
      noValidate
      aria-label={`Tạo subtask cho task #${task.code}`}
      className="my-1 flex flex-col gap-3 rounded-lg border border-dashed bg-canvas/50 p-3"
      onKeyDown={onKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field data-invalid={Boolean(shown.process)}>
          <FieldLabel htmlFor={`${ids}-process`}>Công đoạn</FieldLabel>
          <OptionSelect
            id={`${ids}-process`}
            options={options}
            value={draft.processId}
            onChange={(processId) => set({ processId })}
            placeholder={options.length === 0 ? "Không có công đoạn khác" : "Chọn công đoạn"}
            invalid={Boolean(shown.process)}
            disabled={busy}
          />
          {shown.process ? <FieldError className="text-xs">{shown.process}</FieldError> : null}
        </Field>
        <Field data-invalid={Boolean(shown.qty)}>
          <FieldLabel htmlFor={`${ids}-qty`}>Số tấm</FieldLabel>
          <Input
            id={`${ids}-qty`}
            inputMode="numeric"
            autoComplete="off"
            value={draft.qty}
            disabled={busy}
            placeholder={max >= 1 ? `1–${formatInteger(max)}` : undefined}
            aria-invalid={Boolean(shown.qty)}
            aria-describedby={`${ids}-qty-hint`}
            onChange={(event) => set({ qty: event.target.value })}
            className="tabular-nums"
          />
          {shown.qty ? (
            <FieldError id={`${ids}-qty-hint`} className="text-xs">
              {shown.qty}
            </FieldError>
          ) : (
            <FieldDescription id={`${ids}-qty-hint`} className="text-xs">
              {qtyHint ??
                `Task gốc có ${formatInteger(task.qtyAssigned)} tấm · Tổng Leader giao vẫn là ${formatInteger(task.allocatedQty)}`}
            </FieldDescription>
          )}
        </Field>
      </div>
      <Field data-invalid={Boolean(shown.reason)}>
        <FieldLabel htmlFor={`${ids}-reason`}>Lý do (tùy chọn)</FieldLabel>
        <Textarea
          id={`${ids}-reason`}
          rows={2}
          maxLength={2000}
          value={draft.reason}
          disabled={busy}
          aria-invalid={Boolean(shown.reason)}
          placeholder="Ví dụ: 5 tấm cần cắt nền thay vì retouch…"
          onChange={(event) => set({ reason: event.target.value })}
        />
        {shown.reason ? <FieldError className="text-xs">{shown.reason}</FieldError> : null}
      </Field>
      <FormAlert>{error}</FormAlert>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Hủy
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Spinner /> : <Plus aria-hidden="true" />}
          Tạo subtask
        </Button>
      </div>
    </form>
  );
};
