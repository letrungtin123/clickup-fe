import { cn } from "cn";
import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CustomField } from "@/contracts/production-catalog";
import type { ProductionTask } from "@/contracts/production-jobs";

import { fieldsFor, type CustomValue } from "../../custom-fields";
import { formatCredit, formatInteger, formatNumber, todayIn } from "../../format";
import { useCustomFields, useProcesses, useShifts, useTags } from "../../hooks";
import type { UpdateTaskInput } from "../../jobs-api";
import { useProductionTask, useQtyRequestMutations, useTaskMutations } from "../../jobs-hooks";
import {
  dueDayToIso,
  formatDateTime,
  formatWorkDay,
  lineOptionalNumbers,
  myCreditSummary,
  receivedDayToIso,
  relativeDeadline,
  WORK_LINK_MAX,
  workLinkValue
} from "../../jobs-model";
import { useProductionPeople, type Person as PersonOption } from "../../people";
import {
  customFieldPayload,
  customFieldProblem,
  doneQtyNoteRequired,
  doneQtyProblem,
  doneQtyWithSubtasks,
  lineDraftOf,
  lineFieldProblem,
  lineProcessHint,
  lineProcessOptions,
  ownQtyOfTotal,
  qtyRequestMessage,
  qtyRequestProblems,
  requiredQtyProblem,
  subtaskProcessOptions,
  subtasksQty,
  subtasksWithoutQty,
  totalQtyProblem,
  wholeNumber,
  type DoneQtyDraft,
  type QtyRequestDraft,
  type TaskEditRights
} from "../../task-edit-model";
import { CustomFieldInput, CustomFieldValue } from "../custom-field-input";
import { DateField } from "../date-field";
import { TagChips, TagPicker } from "../tag-picker";
import { Fact, NoQtyChip, Person } from "./job-bits";
import { DoneQtyEditor, NumberEditor, QtyRequestEditor } from "./inline-editors";
import { InlineField } from "./inline-field";
import { OptionSelect, PersonSelect } from "./pickers";
import { WorkLinkValue } from "./work-link";

/**
 * The task page's fields (PD-044), each edited in place by clicking it where the viewer may change it (InlineField,
 * PD-047: no dialog — not even for asking the Leader to change "Số lượng giao"). Rights come from `taskEditRights`;
 * values are checked with the work-log rules of "Chia task" and only the changed field is sent.
 */

type FieldProps = { task: ProductionTask; rights: TaskEditRights; timeZone: string };

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** The picker list with the current person kept (they may lack the role now, or the list is not visible to me). */
const withCurrent = (people: readonly PersonOption[], current: PersonOption | null) =>
  current && !people.some((person) => person.id === current.id) ? [current, ...people] : people;

/** "#N · Công đoạn" — the title, click to change the process (a subtask: another non-QC process than its task's). */
export const TaskProcessTitle = ({ task, rights }: Omit<FieldProps, "timeZone">) => {
  const mutations = useTaskMutations();
  const processes = useProcesses();
  // A subtask may not take its line's process: the line tells which one.
  const parent = useProductionTask(task.isSubtask && rights.process ? task.parentTaskId : null);
  const items = processes.data?.items ?? [];
  const options = task.isSubtask
    ? subtaskProcessOptions(items, parent.data?.process.id ?? null, task.process.id)
    : lineProcessOptions(items, task.process.id);
  return (
    <InlineField
      variant="inline"
      editKey="process"
      label="Công đoạn"
      editorLabel="Công đoạn"
      canEdit={rights.process}
      initial={(): string | null => task.process.id}
      renderEditor={({ id, value, onChange, invalid, disabled }) => (
        <OptionSelect
          id={id}
          options={options}
          value={value}
          onChange={onChange}
          invalid={invalid}
          disabled={disabled}
          placeholder="Chọn công đoạn"
          className="sm:max-w-72"
        />
      )}
      validate={(value) => (value ? null : "Chọn công đoạn.")}
      isUnchanged={(value) => value === task.process.id}
      onSave={(value) =>
        mutations.update.mutateAsync({
          taskId: task.id,
          input: { processId: value ?? task.process.id }
        })
      }
      successMessage={(value) =>
        `Đã đổi công đoạn của #${task.code} sang ${options.find((option) => option.id === value)?.label ?? "công đoạn mới"}`
      }
      hint={
        task.isSubtask
          ? "Subtask làm công đoạn khác task gốc (không phải QC)."
          : lineProcessHint(task.subtasks.length > 0)
      }
    >
      <h2 className="text-lg font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">
        #{task.code} · {task.process.name}
      </h2>
    </InlineField>
  );
};

/** The work-log facts grid (PD-035) with in-place editing. */
export const TaskFacts = ({
  task,
  rights,
  timeZone,
  myId
}: FieldProps & { myId: string | null }) => {
  const mutations = useTaskMutations();
  const qtyRequests = useQtyRequestMutations();
  const people = useProductionPeople([task.assignee, task.qc]);
  const shifts = useShifts();
  const base = lineDraftOf(task, timeZone);
  const today = todayIn(timeZone);
  const checking = task.process.isQc;
  const done = task.doneAt !== null;
  const deadline = relativeDeadline(task.deadline);
  const credits = myCreditSummary(task);
  const split = subtasksQty(task.subtasks);
  const update = (input: UpdateTaskInput) =>
    mutations.update.mutateAsync({ taskId: task.id, input });
  const workers = withCurrent(
    checking ? people.withRole("QC", "LEADER") : people.withRole("STAFF", "LEADER"),
    task.assignee
  );
  const checkers = withCurrent(people.withRole("QC"), task.qc).filter(
    (person) => person.id !== task.assignee.id
  );
  const shiftOptions = (shifts.data?.items ?? [])
    .filter((shift) => shift.active || shift.id === task.shift.id)
    .map((shift) => ({ id: shift.id, label: shift.name }));
  const noteRequired = doneQtyNoteRequired(task, myId);
  const hasSubtasks = task.subtasks.length > 0;
  const subtasksMissing = subtasksWithoutQty(task.subtasks);
  // PD-048: "Số lượng giao" is the total the Leader gave (the task with its subtasks); "Số tấm đã xong" likewise.
  // PD-058: without a quantity the task shows "Chưa có SL" (its subtasks' known images beside it); a total that leaves
  // subtasks out says how many.
  const qtyAssignedValue =
    task.qtyAssigned === null ? (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <NoQtyChip />
        {split > 0 ? (
          <span className="text-xs text-foreground-muted tabular-nums">
            + {formatInteger(split)} tấm subtask
          </span>
        ) : null}
      </span>
    ) : (
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
        <span className="tabular-nums">{formatInteger(task.allocatedQty)}</span>
        {subtasksMissing > 0 ? (
          <span className="text-xs text-foreground-muted">
            · {formatInteger(subtasksMissing)} subtask chưa có SL
          </span>
        ) : null}
      </span>
    );
  const doneTotal = doneQtyWithSubtasks(task);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-surface p-3 sm:grid-cols-3">
      <InlineField
        editKey="assignee"
        label="Nhân viên thực hiện"
        canEdit={rights.assignee}
        initial={(): string | null => task.assignee.id}
        renderEditor={({ id, value, onChange, invalid, disabled }) => (
          <PersonSelect
            id={id}
            people={workers}
            value={value}
            onChange={onChange}
            invalid={invalid}
            disabled={disabled}
          />
        )}
        validate={(value) =>
          !value ? "Chọn người làm." : value === task.qc?.id ? "QC phải khác người làm." : null
        }
        isUnchanged={(value) => value === task.assignee.id}
        onSave={(value) =>
          mutations.assign.mutateAsync({
            taskId: task.id,
            input: { assigneeId: value ?? task.assignee.id }
          })
        }
        successMessage={(value) =>
          `Đã giao #${task.code} cho ${(value && people.nameOf(value)) ?? "người mới"}`
        }
        hint="Người được giao mới sẽ nhận thông báo."
      >
        <Person user={task.assignee} />
      </InlineField>

      {/* PD-047: a work task always has a QC — it can be changed, never removed ("Chưa gán" only on older tasks). */}
      <InlineField
        editKey="qc"
        label="QC"
        canEdit={rights.qc}
        initial={() => task.qc?.id ?? null}
        renderEditor={({ id, value, onChange, invalid, disabled }) => (
          <PersonSelect
            id={id}
            people={checkers}
            value={value}
            onChange={onChange}
            placeholder="Chọn QC"
            invalid={invalid}
            disabled={disabled}
          />
        )}
        validate={(value) =>
          !value ? "Chọn QC." : value === task.assignee.id ? "QC phải khác người làm." : null
        }
        isUnchanged={(value) => value === (task.qc?.id ?? null)}
        onSave={(value) =>
          mutations.assign.mutateAsync({ taskId: task.id, input: { qcId: value } })
        }
        successMessage={(value) =>
          `Đã gán QC ${(value && people.nameOf(value)) ?? "mới"} cho #${task.code}`
        }
        hint={
          done && !task.qc
            ? "Gán QC cho task đã Done sẽ chuyển task sang Chờ QC."
            : "QC mới sẽ nhận thông báo. Task luôn có QC (khác người làm): chỉ đổi sang QC khác."
        }
      >
        {checking ? (
          <span className="text-foreground-muted">Task Checking — không có QC</span>
        ) : (
          <Person user={task.qc} fallback="Chưa gán" />
        )}
      </InlineField>

      <InlineField
        editKey="shift"
        label="Ca"
        canEdit={rights.shift}
        initial={(): string | null => task.shift.id}
        renderEditor={({ id, value, onChange, invalid, disabled }) => (
          <OptionSelect
            id={id}
            options={shiftOptions}
            value={value}
            onChange={onChange}
            invalid={invalid}
            disabled={disabled}
            placeholder="Chọn ca"
          />
        )}
        validate={(value) => (value ? null : "Chọn ca.")}
        isUnchanged={(value) => value === task.shift.id}
        onSave={(value) => update({ shiftId: value ?? task.shift.id })}
        successMessage={`Đã đổi ca của #${task.code}`}
      >
        {task.shift.name}
      </InlineField>

      {rights.fillQty ? (
        // PD-058: no quantity yet — filled in directly (the worker too, no request); the subtasks keep theirs.
        <InlineField
          editKey="qtyAssigned"
          label="Số lượng giao"
          canEdit
          editLabel="Điền Số lượng giao"
          editorLabel={
            hasSubtasks ? `Số lượng của task #${task.code}, không gồm subtask` : undefined
          }
          initial={() => ""}
          renderEditor={(props) => <NumberEditor {...props} placeholder="Số tấm" />}
          validate={requiredQtyProblem}
          hint={
            hasSubtasks
              ? "Số tấm thực tế của task này, không gồm subtask (subtask điền riêng)."
              : "Số tấm thực tế của task này."
          }
          onSave={(value) => update({ qtyAssigned: wholeNumber(value) ?? 1 })}
          successMessage="Đã điền số lượng"
        >
          {qtyAssignedValue}
        </InlineField>
      ) : rights.requestQty ? (
        // PD-044 / PD-047: the worker without a direct right asks the Leader — the same field opens the request form.
        <InlineField
          editKey="qtyAssigned"
          label="Số lượng giao"
          canEdit
          editLabel="Đề nghị sửa Số lượng giao"
          editorLabel="Số lượng mới"
          saveLabel="Gửi đề nghị"
          initial={(): QtyRequestDraft => ({ qty: String(task.allocatedQty), reason: "" })}
          renderEditor={(props) => (
            <QtyRequestEditor
              {...props}
              problems={props.invalid ? qtyRequestProblems(props.value, task) : {}}
            />
          )}
          validate={(draft) => qtyRequestMessage(draft, task)}
          hint={`Đang giao ${formatInteger(task.allocatedQty)} tấm${split > 0 ? ` (tính cả ${formatInteger(split)} tấm của subtask)` : ""}. Leader sẽ nhận thông báo và duyệt; đến khi được duyệt, số tấm giao giữ nguyên.`}
          onSave={(draft) =>
            qtyRequests.request.mutateAsync({
              taskId: task.id,
              input: {
                qtyAssigned: wholeNumber(draft.qty) ?? task.allocatedQty,
                reason: draft.reason.trim()
              }
            })
          }
          successMessage={(draft) =>
            `Đã gửi đề nghị sửa số tấm giao của #${task.code}: ${formatInteger(task.allocatedQty)} → ${formatInteger(wholeNumber(draft.qty) ?? task.allocatedQty)}`
          }
        >
          {qtyAssignedValue}
        </InlineField>
      ) : (
        // PD-048: the Leader edits the total; the subtasks keep theirs, so the task's own part is total − subtasks.
        <InlineField
          editKey="qtyAssigned"
          label="Số lượng giao"
          canEdit={rights.qtyAssigned}
          initial={() => String(task.allocatedQty)}
          renderEditor={(props) => <NumberEditor {...props} />}
          validate={(value) => totalQtyProblem(value, split)}
          isUnchanged={(value) => wholeNumber(value) === task.allocatedQty}
          hint={split > 0 ? `Tính cả ${formatInteger(split)} tấm của subtask.` : undefined}
          onSave={(value) =>
            update({ qtyAssigned: ownQtyOfTotal(value, split) ?? task.qtyAssigned ?? undefined })
          }
          successMessage={(value) =>
            `Đã sửa số lượng giao của #${task.code}: ${formatInteger(task.allocatedQty)} → ${value.trim()}`
          }
        >
          {qtyAssignedValue}
        </InlineField>
      )}

      {done ? (
        // PD-048: the read view counts the subtasks too; the editor corrects the task's own Done quantity only (a
        // subtask's is corrected on its own page) — its label says so.
        <InlineField
          editKey="qtyDone"
          label="Số tấm đã xong"
          editorLabel={
            hasSubtasks ? `Số tấm xong của task #${task.code}, không gồm subtask` : undefined
          }
          canEdit={rights.qtyDone}
          initial={(): DoneQtyDraft => ({
            qty: String(task.qtyDone ?? task.qtyAssigned ?? ""),
            note: ""
          })}
          renderEditor={(props) => <DoneQtyEditor {...props} noteRequired={noteRequired} />}
          validate={(draft) => doneQtyProblem(draft, noteRequired)}
          isUnchanged={(draft) => wholeNumber(draft.qty) === task.qtyDone && !draft.note.trim()}
          hint={[
            noteRequired
              ? "Điểm được tính lại theo số mới; người làm nhận thông báo."
              : "Điểm được tính lại theo số mới.",
            hasSubtasks ? "Số xong của subtask sửa ở trang của subtask." : null
          ]
            .filter(Boolean)
            .join(" ")}
          onSave={(draft) =>
            mutations.setQty.mutateAsync({
              taskId: task.id,
              input: {
                qtyDone: wholeNumber(draft.qty) ?? 0,
                ...(draft.note.trim() ? { note: draft.note.trim() } : {})
              }
            })
          }
          successMessage={(draft) =>
            `Đã sửa số tấm đã xong của #${task.code}: ${task.qtyDone ?? "—"} → ${draft.qty.trim()}`
          }
        >
          <span className="tabular-nums">
            {doneTotal === null ? "—" : formatInteger(doneTotal)}
          </span>
          <span className="text-foreground-muted tabular-nums">
            {" "}
            / {formatInteger(task.allocatedQty)}
          </span>
        </InlineField>
      ) : null}

      <InlineField
        editKey="errorQty"
        label="Hình lỗi"
        canEdit={rights.errorQty}
        initial={() => base.errorQty ?? ""}
        renderEditor={(props) => <NumberEditor {...props} placeholder="Để trống nếu không có" />}
        validate={(value) => lineFieldProblem(base, { errorQty: value }, ["errorQty"])}
        isUnchanged={(value) => lineOptionalNumbers({ errorQty: value }).errorQty === task.errorQty}
        hint="Chỉ để xem lại, không đổi điểm hay tiền."
        onSave={(value) => update({ errorQty: lineOptionalNumbers({ errorQty: value }).errorQty })}
        successMessage={`Đã lưu hình lỗi của #${task.code}`}
      >
        <span className="tabular-nums">
          {task.errorQty === null ? "—" : formatInteger(task.errorQty)}
        </span>
      </InlineField>

      <InlineField
        editKey="received"
        label="Ngày nhận"
        canEdit={rights.received}
        initial={() => base.receivedDay ?? null}
        renderEditor={({ id, value, onChange, invalid, disabled }) => (
          <DateField
            id={id}
            value={value}
            onChange={onChange}
            today={today}
            disabled={disabled}
            aria-invalid={invalid}
            className="sm:max-w-56"
          />
        )}
        validate={(value) =>
          value
            ? lineFieldProblem(base, { receivedDay: value }, ["received", "due"])
            : "Chọn ngày nhận."
        }
        isUnchanged={(value) => value === base.receivedDay}
        onSave={(value) =>
          update({
            assignedAt: receivedDayToIso(value ?? base.receivedDay ?? "", timeZone) ?? undefined
          })
        }
        successMessage={`Đã đổi ngày nhận của #${task.code}`}
      >
        {formatWorkDay(task.assignedAt, timeZone)}
      </InlineField>

      <InlineField
        editKey="due"
        label="Ngày giao"
        canEdit={rights.due}
        initial={() => base.dueDay ?? null}
        renderEditor={({ id, value, onChange, invalid, disabled }) => (
          <DateField
            id={id}
            value={value}
            onChange={onChange}
            today={today}
            disabled={disabled}
            aria-invalid={invalid}
            className="sm:max-w-56"
          />
        )}
        validate={(value) =>
          value ? lineFieldProblem(base, { dueDay: value }, ["due"]) : "Chọn ngày giao."
        }
        isUnchanged={(value) => value === base.dueDay}
        onSave={(value) =>
          update({ deadline: dueDayToIso(value ?? base.dueDay ?? "", timeZone) ?? undefined })
        }
        successMessage={`Đã đổi ngày giao của #${task.code}`}
      >
        <span className={cn(task.isLate && "font-medium text-danger")}>
          {formatWorkDay(task.deadline, timeZone)}
        </span>
        {!done ? (
          <span
            className={cn("block text-xs", deadline.late ? "text-danger" : "text-foreground-muted")}
          >
            {deadline.label}
          </span>
        ) : null}
      </InlineField>

      {task.doneAt ? <Fact label="Xong lúc">{formatDateTime(task.doneAt, timeZone)}</Fact> : null}
      {task.checkedAt ? (
        <Fact label="Kiểm lúc">{formatDateTime(task.checkedAt, timeZone)}</Fact>
      ) : null}

      {task.otHours !== null || rights.otHours ? (
        <InlineField
          editKey="otHours"
          label="Giờ OT"
          canEdit={rights.otHours}
          initial={() => (task.otHours === null ? "" : String(task.otHours).replace(".", ","))}
          renderEditor={(props) => <NumberEditor {...props} decimal placeholder="Ví dụ 1,5" />}
          validate={(value) => lineFieldProblem(base, { otHours: value }, ["otHours"])}
          isUnchanged={(value) => lineOptionalNumbers({ otHours: value }).otHours === task.otHours}
          hint="Từ 0,1 đến 24 giờ; để trống nếu không có."
          onSave={(value) => update({ otHours: lineOptionalNumbers({ otHours: value }).otHours })}
          successMessage={`Đã lưu giờ OT của #${task.code}`}
        >
          {task.otHours === null ? "—" : `${formatNumber(task.otHours)} giờ`}
        </InlineField>
      ) : null}

      {credits ? (
        <Fact label="Điểm của tôi">
          <span className="font-medium text-success tabular-nums" title={credits.detail}>
            {formatCredit(credits.credits)} điểm{credits.khoan ? " Khoán" : ""}
          </span>
        </Fact>
      ) : null}

      {/* PD-040: the images given to the person — a web link opens, a folder path is copied. */}
      <InlineField
        editKey="workLink"
        label="Link chia việc"
        canEdit={rights.workLink}
        className="col-span-full"
        initial={() => task.workLink ?? ""}
        renderEditor={({ id, value, onChange, invalid, disabled }) => (
          <Input
            id={id}
            value={value}
            maxLength={WORK_LINK_MAX}
            autoComplete="off"
            spellCheck={false}
            placeholder="Dán link hoặc đường dẫn thư mục"
            disabled={disabled}
            aria-invalid={invalid}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
        validate={(value) => lineFieldProblem(base, { workLink: value }, ["workLink"])}
        isUnchanged={(value) => workLinkValue(value) === task.workLink}
        hint="Để trống để bỏ link."
        onSave={(value) => update({ workLink: workLinkValue(value) })}
        successMessage={`Đã lưu link chia việc của #${task.code}`}
      >
        <WorkLinkValue value={task.workLink} />
      </InlineField>
    </dl>
  );
};

/** "Ghi chú" of the task (multi-line; shown when filled or editable). */
export const TaskNoteField = ({ task, rights }: Omit<FieldProps, "timeZone">) => {
  const mutations = useTaskMutations();
  if (!task.note && !rights.note) return null;
  return (
    <dl className="flex flex-col">
      <InlineField
        editKey="note"
        label="Ghi chú"
        canEdit={rights.note}
        multiline
        initial={() => task.note ?? ""}
        renderEditor={({ id, value, onChange, invalid, disabled }) => (
          <Textarea
            id={id}
            rows={3}
            maxLength={5000}
            value={value}
            disabled={disabled}
            aria-invalid={invalid}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
        validate={(value) => (value.trim().length > 5000 ? "Tối đa 5.000 ký tự." : null)}
        isUnchanged={(value) => (value.trim() || null) === task.note}
        onSave={(value) =>
          mutations.update.mutateAsync({ taskId: task.id, input: { note: value.trim() || null } })
        }
        successMessage={`Đã lưu ghi chú của #${task.code}`}
      >
        {task.note ? (
          <p className="mt-0.5 rounded-lg bg-muted/60 px-3 py-2 text-[13px] whitespace-pre-wrap [overflow-wrap:anywhere]">
            {task.note}
          </p>
        ) : (
          <span className="text-foreground-subtle">Chưa có ghi chú</span>
        )}
      </InlineField>
    </dl>
  );
};

/** TASK custom fields and tags, each edited on its own (only that key is sent). */
export const TaskExtraFields = ({ task, rights, timeZone }: FieldProps) => {
  const mutations = useTaskMutations();
  const fields = useCustomFields();
  const tags = useTags();
  const taskFields = useMemo(() => fieldsFor(fields.data?.items ?? [], "TASK"), [fields.data]);
  const today = todayIn(timeZone);
  const showTags = task.tagIds.length > 0 || rights.tags;
  if (taskFields.length === 0 && !showTags) return null;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {taskFields.map((field) => (
        <CustomFieldItem
          key={field.id}
          field={field}
          task={task}
          canEdit={rights.custom}
          today={today}
          onSave={(input) => mutations.update.mutateAsync({ taskId: task.id, input })}
        />
      ))}
      {showTags ? (
        <InlineField
          editKey="tags"
          label="Tag"
          canEdit={rights.tags}
          initial={() => [...task.tagIds]}
          renderEditor={({ value, onChange, disabled }) => (
            <TagPicker
              tags={tags.data?.items ?? []}
              value={value}
              onChange={onChange}
              disabled={disabled}
              aria-label="Tag của task"
            />
          )}
          isUnchanged={(value) => sameIds(value, task.tagIds)}
          onSave={(value) =>
            mutations.update.mutateAsync({ taskId: task.id, input: { tagIds: value } })
          }
          successMessage={`Đã lưu tag của #${task.code}`}
        >
          {task.tagIds.length > 0 ? (
            <TagChips tags={tags.data?.items ?? []} tagIds={task.tagIds} max={8} />
          ) : (
            <span className="text-foreground-subtle">—</span>
          )}
        </InlineField>
      ) : null}
    </dl>
  );
};

const CustomFieldItem = ({
  field,
  task,
  canEdit,
  today,
  onSave
}: {
  field: CustomField;
  task: ProductionTask;
  canEdit: boolean;
  today: string;
  onSave: (input: { customValues: ReturnType<typeof customFieldPayload> }) => Promise<unknown>;
}) => {
  const stored = task.customValues[field.key];
  const sent = (value: CustomValue | undefined) =>
    JSON.stringify(customFieldPayload(field, value)[field.key] ?? null);
  return (
    <InlineField
      editKey={`cf-${field.key}`}
      label={field.label}
      canEdit={canEdit}
      className={cn(field.type === "TEXT" && "sm:col-span-2")}
      initial={() => stored}
      renderEditor={({ id, value, onChange, invalid, disabled }) => (
        <CustomFieldInput
          id={id}
          field={field}
          value={value}
          onChange={onChange}
          invalid={invalid}
          disabled={disabled}
          today={today}
        />
      )}
      validate={(value) => customFieldProblem(field, value)}
      isUnchanged={(value) => sent(value) === sent(stored)}
      onSave={(value) => onSave({ customValues: customFieldPayload(field, value) })}
      successMessage={`Đã lưu ${field.label} của #${task.code}`}
      hint={field.required ? "Bắt buộc." : undefined}
    >
      <CustomFieldValue field={field} value={stored} />
    </InlineField>
  );
};
