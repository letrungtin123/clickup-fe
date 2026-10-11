import { cn } from "cn";
import { ChevronDown, Coins, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { CustomField, CustomValues } from "@/contracts/production-catalog";
import type { Feedback, JobDetail, ProductionTask } from "@/contracts/production-jobs";
import { useSessionContext } from "@/features/auth/hooks";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { indexRules, lookupRule } from "../../credit-matrix";
import {
  fieldsFor,
  formatCustomValue,
  isEmptyValue,
  toCustomValuesPayload,
  validateCustomValues
} from "../../custom-fields";
import { productionErrorMessage } from "../../errors";
import { formatCredit, formatInteger, formatMoney, todayIn } from "../../format";
import {
  useCreditMatrix,
  useCustomFields,
  useProcesses,
  useProductionMe,
  useProductionProjects,
  useShifts,
  useTags
} from "../../hooks";
import { useCreateTasks, useReassignFeedback } from "../../jobs-hooks";
import {
  allocation,
  assignedNormalQty,
  defaultTaskDeadline,
  expectedEarnings,
  taskLineProblems,
  type TaskLineDraft
} from "../../jobs-model";
import { useProductionPeople } from "../../people";
import type { Tag } from "../../types";
import { phoneSheetColumn, sheetOnPhone } from "../../ui";
import { CustomFieldInput } from "../custom-field-input";
import { FormAlert, InfoNote } from "../settings-kit";
import { TagPicker } from "../tag-picker";
import { DateTimeField } from "./date-time-field";
import { OptionSelect, PersonSelect } from "./pickers";

/**
 * `deadline: null` = the default (job deadline − QC buffer), sent only when the leader picks another.
 * `values` / `tagIds`: the line's TASK custom fields and tags (required fields must be filled, BE
 * CUSTOM_FIELDS_INVALID "Dòng N: …"). "Giao lại" lines start from the source task's values and tags,
 * which the API also inherits.
 */
type Line = TaskLineDraft & {
  key: string;
  deadline: string | null;
  note: string;
  sourceTaskId: string | null;
  values: CustomValues;
  tagIds: string[];
};

let lineSeq = 0;
const newKey = () => `line-${(lineSeq += 1)}`;

const blankLine = (template?: Partial<Line>): Line => ({
  key: newKey(),
  assigneeId: null,
  qcId: null,
  processId: null,
  shiftId: null,
  qty: "",
  deadline: null,
  note: "",
  sourceTaskId: null,
  values: {},
  tagIds: [],
  ...template
});

const fromTask = (task: ProductionTask): Line =>
  blankLine({
    assigneeId: task.assignee.id,
    qcId: task.qc?.id ?? null,
    processId: task.process.isQc ? null : task.process.id,
    shiftId: task.shift.id,
    qty: String(task.qtyAssigned),
    sourceTaskId: task.id,
    values: task.customValues,
    tagIds: task.tagIds
  });

/** Line numbers named by a server answer ("Dòng 2: …"), to outline those cards. */
const linesInMessage = (message: string | null) =>
  new Set([...(message ?? "").matchAll(/Dòng (\d+):/g)].map((match) => Number(match[1]) - 1));

/** One server error per line ("Dòng 1: … Dòng 2: …" → one per row). */
const splitLineMessages = (message: string) => message.replace(/\s+(?=Dòng \d+:)/g, "\n");

/**
 * "Chia task" (SPEC Phase 2): several lines at once — assignee, process (never the QC process),
 * shift, quantity, QC, deadline (default: job deadline − project QC buffer) and note — with live
 * totals against the job's images and the expected credit/money from today's credit rules.
 * In "reassign" mode the lines start from the feedback's source task (FB tasks, PD-014).
 */
export const SplitTasksDialog = ({
  open,
  job,
  feedback,
  onClose
}: {
  open: boolean;
  job: JobDetail;
  /** Reassign mode: lines create FB tasks for this feedback. */
  feedback?: Feedback | null;
  onClose: () => void;
}) => {
  const ids = useId();
  const session = useSessionContext();
  const me = useProductionMe();
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const today = todayIn(timeZone);
  const people = useProductionPeople([
    job.leader,
    ...job.tasks.flatMap((task) => [task.assignee, task.qc])
  ]);
  const projects = useProductionProjects();
  const processes = useProcesses();
  const shifts = useShifts();
  const customFields = useCustomFields();
  const tags = useTags();
  const matrix = useCreditMatrix(today);
  const create = useCreateTasks(job.id);
  const reassign = useReassignFeedback(job.id);
  const taskFields = useMemo(
    () => fieldsFor(customFields.data?.items ?? [], "TASK"),
    [customFields.data]
  );
  const tagList = useMemo(() => tags.data?.items ?? [], [tags.data]);
  const hasExtras = taskFields.length > 0 || tagList.some((tag) => tag.active);

  const buffer =
    projects.data?.items.find((project) => project.id === job.project.id)?.qcBufferHours ?? 0;
  const defaultDeadline = defaultTaskDeadline(job.deadline, buffer);
  const source = feedback?.sourceTaskId
    ? (job.tasks.find((task) => task.id === feedback.sourceTaskId) ?? null)
    : null;
  const [lines, setLines] = useState<Line[]>(() => [source ? fromTask(source) : blankLine()]);
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Warn (never block) about deadlines already over, e.g. the default of a late job's feedback
  // rework (job deadline − QC buffer). The dialog is re-keyed on every open: "now" is when it opened.
  const [openedAt] = useState(() => Date.now());

  const workers = people.withRole("STAFF", "LEADER");
  const checkers = people.withRole("QC");
  const processOptions = (processes.data?.items ?? [])
    .filter((process) => process.active && !process.isQc)
    .map((process) => ({ id: process.id, label: process.name }));
  const shiftList = (shifts.data?.items ?? []).filter((shift) => shift.active);
  const qcProcessIds = useMemo(
    () =>
      new Set(
        (processes.data?.items ?? []).filter((process) => process.isQc).map((process) => process.id)
      ),
    [processes.data]
  );
  const ruleIndex = useMemo(() => indexRules(matrix.data?.rules ?? []), [matrix.data]);
  const lineContext = { callerId: session.user.id, roles: people.roles, qcProcessIds };
  const problems = lines.map((line) => taskLineProblems(line, lineContext));
  // Required TASK fields are checked on every line (the API refuses the whole split otherwise).
  const fieldProblems = lines.map((line) =>
    validateCustomValues(taskFields, line.values, { enforceRequired: true })
  );
  const valid =
    problems.every((item) => Object.keys(item).length === 0) &&
    fieldProblems.every((item) => Object.keys(item).length === 0);
  const failedLines = linesInMessage(formError);
  const totals = allocation(
    job.totalImages,
    feedback ? 0 : assignedNormalQty(job.tasks),
    lines.map((line) => Number(line.qty))
  );
  const pending = create.isPending || reassign.isPending;

  const update = (key: string, patch: Partial<Line>) =>
    setLines((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const submit = () => {
    setShowErrors(true);
    setFormError(null);
    if (!valid) return;
    const payload = lines.map((line) => ({
      assigneeId: line.assigneeId ?? "",
      processId: line.processId ?? "",
      shiftId: line.shiftId ?? "",
      qtyAssigned: Number(line.qty),
      qcId: line.qcId,
      ...(line.deadline ? { deadline: line.deadline } : {}),
      ...(line.note.trim() ? { note: line.note.trim() } : {}),
      ...(taskFields.length > 0
        ? { customValues: toCustomValuesPayload(taskFields, line.values) }
        : {}),
      // "Giao lại": tags sent on a line replace the inherited ones; the form started from them.
      ...(line.tagIds.length > 0 || feedback ? { tagIds: line.tagIds } : {})
    }));
    const onSuccess = (result: { tasks: unknown[]; warnings: string[] }) => {
      toast.success(
        feedback ? `Đã giao lại ${result.tasks.length} task` : `Đã chia ${result.tasks.length} task`
      );
      for (const warning of result.warnings) toast.warning(warning);
      onClose();
    };
    const onError = (error: unknown) =>
      setFormError(splitLineMessages(productionErrorMessage(error)));
    if (feedback) {
      reassign.mutate(
        {
          feedbackId: feedback.id,
          input: {
            tasks: payload.map((line, index) => ({
              ...line,
              ...(lines[index]?.sourceTaskId ? { sourceTaskId: lines[index].sourceTaskId } : {})
            }))
          }
        },
        { onSuccess, onError }
      );
    } else {
      create.mutate(payload, { onSuccess, onError });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-5xl",
          sheetOnPhone
        )}
      >
        <div className={cn("flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col", phoneSheetColumn)}>
          <DialogHeader className="border-b px-4 pt-4 pr-12 pb-3">
            <DialogTitle>
              {feedback
                ? `Giao lại theo feedback ${feedback.type === "WRONG" ? "sai" : "yêu cầu thêm"}`
                : `Chia task · ${job.code}`}
            </DialogTitle>
            <DialogDescription>
              {feedback
                ? "Tạo task feedback trỏ về task gốc: mặc định giao lại đúng người cũ và giữ trường tùy chỉnh, tag của task gốc — đổi được từng dòng."
                : "Mỗi dòng là một lần giao N tấm cho một người theo một quy trình. QC phải khác người làm."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {feedback ? (
              <InfoNote icon={TriangleAlert} tone="warning">
                {feedback.note}
              </InfoNote>
            ) : null}
            <ol className="flex flex-col gap-3">
              {lines.map((line, index) => {
                const lineProblems = showErrors ? (problems[index] ?? {}) : {};
                const shift = shiftList.find((item) => item.id === line.shiftId) ?? null;
                const rule = line.processId
                  ? lookupRule(ruleIndex, job.project.id, line.processId)
                  : null;
                const earnings = expectedEarnings(rule, Number(line.qty), shift?.payMode ?? null);
                return (
                  <li
                    key={line.key}
                    className={cn(
                      "rounded-xl border bg-surface p-3 shadow-xs",
                      failedLines.has(index) && "border-danger/60 ring-1 ring-danger/30"
                    )}
                  >
                    <div className="mb-2 flex items-start gap-2">
                      {/* Phones: label and the expected points wrap onto two lines, the bin stays put. */}
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 pt-1">
                        <span className="text-xs font-semibold whitespace-nowrap text-foreground-muted">
                          Dòng {index + 1}
                          {line.sourceTaskId ? (
                            <span className="font-normal text-foreground-subtle">
                              {" "}
                              · task gốc #
                              {job.tasks.find((task) => task.id === line.sourceTaskId)?.number ??
                                "?"}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className="flex items-center gap-1 text-xs text-foreground-muted sm:ml-auto"
                          aria-live="polite"
                        >
                          <Coins className="size-3.5" aria-hidden="true" />
                          {feedback?.type === "WRONG"
                            ? "Làm lại — không tính điểm"
                            : earnings.credit === null
                              ? rule || !line.processId
                                ? "—"
                                : "Chưa có đơn giá"
                              : `≈ ${formatCredit(earnings.credit)} điểm${earnings.money !== null ? ` · ${formatMoney(earnings.money)}` : ""}`}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Xóa dòng ${index + 1}`}
                        className="text-foreground-subtle hover:text-danger"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((items) => items.filter((item) => item.key !== line.key))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_6rem_minmax(0,1.3fr)]">
                      <Field data-invalid={Boolean(lineProblems.assignee)}>
                        <FieldLabel htmlFor={`${ids}-${line.key}-assignee`}>Người làm</FieldLabel>
                        <PersonSelect
                          id={`${ids}-${line.key}-assignee`}
                          people={workers}
                          value={line.assigneeId}
                          onChange={(assigneeId) =>
                            update(line.key, {
                              assigneeId,
                              ...(assigneeId === line.qcId ? { qcId: null } : {})
                            })
                          }
                          invalid={Boolean(lineProblems.assignee)}
                        />
                        {lineProblems.assignee ? (
                          <FieldError className="text-xs">{lineProblems.assignee}</FieldError>
                        ) : null}
                      </Field>
                      <Field data-invalid={Boolean(lineProblems.process)}>
                        <FieldLabel htmlFor={`${ids}-${line.key}-process`}>Quy trình</FieldLabel>
                        <OptionSelect
                          id={`${ids}-${line.key}-process`}
                          options={processOptions}
                          value={line.processId}
                          onChange={(processId) => update(line.key, { processId })}
                          placeholder="Chọn quy trình"
                          invalid={Boolean(lineProblems.process)}
                        />
                        {lineProblems.process ? (
                          <FieldError className="text-xs">{lineProblems.process}</FieldError>
                        ) : null}
                      </Field>
                      <Field data-invalid={Boolean(lineProblems.shift)}>
                        <FieldLabel htmlFor={`${ids}-${line.key}-shift`}>Ca</FieldLabel>
                        <OptionSelect
                          id={`${ids}-${line.key}-shift`}
                          options={shiftList.map((item) => ({
                            id: item.id,
                            label: item.name,
                            hint: item.payMode === "MONEY_IF_KPI" ? "khoán" : null
                          }))}
                          value={line.shiftId}
                          onChange={(shiftId) => update(line.key, { shiftId })}
                          placeholder="Chọn ca"
                          invalid={Boolean(lineProblems.shift)}
                        />
                        {lineProblems.shift ? (
                          <FieldError className="text-xs">{lineProblems.shift}</FieldError>
                        ) : null}
                      </Field>
                      <Field data-invalid={Boolean(lineProblems.qty)}>
                        <FieldLabel htmlFor={`${ids}-${line.key}-qty`}>Số tấm</FieldLabel>
                        <Input
                          id={`${ids}-${line.key}-qty`}
                          inputMode="numeric"
                          value={line.qty}
                          onChange={(event) => update(line.key, { qty: event.target.value })}
                          aria-invalid={Boolean(lineProblems.qty)}
                          className="tabular-nums"
                        />
                        {lineProblems.qty ? (
                          <FieldError className="text-xs">{lineProblems.qty}</FieldError>
                        ) : null}
                      </Field>
                      <Field data-invalid={Boolean(lineProblems.qc)}>
                        <FieldLabel htmlFor={`${ids}-${line.key}-qc`}>QC</FieldLabel>
                        <PersonSelect
                          id={`${ids}-${line.key}-qc`}
                          people={checkers.filter((person) => person.id !== line.assigneeId)}
                          value={line.qcId}
                          onChange={(qcId) => update(line.key, { qcId })}
                          noneLabel="Chưa gán QC"
                          invalid={Boolean(lineProblems.qc)}
                        />
                        {lineProblems.qc ? (
                          <FieldError className="text-xs">{lineProblems.qc}</FieldError>
                        ) : null}
                      </Field>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <Field>
                        <FieldLabel htmlFor={`${ids}-${line.key}-deadline`}>Deadline</FieldLabel>
                        <DateTimeField
                          id={`${ids}-${line.key}-deadline`}
                          value={line.deadline ?? defaultDeadline}
                          onChange={(deadline) => update(line.key, { deadline })}
                          timeZone={timeZone}
                          today={today}
                          aria-label={`Deadline dòng ${index + 1}`}
                        />
                        {new Date(line.deadline ?? defaultDeadline).getTime() < openedAt ? (
                          <p
                            role="status"
                            className="flex items-start gap-1.5 text-xs text-warning"
                          >
                            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                            Deadline này đã qua — task sẽ bị tính trễ ngay. Chọn ngày giờ khác nếu
                            cần.
                          </p>
                        ) : null}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`${ids}-${line.key}-note`}>
                          Ghi chú{" "}
                          <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
                        </FieldLabel>
                        <Input
                          id={`${ids}-${line.key}-note`}
                          value={line.note}
                          maxLength={5000}
                          onChange={(event) => update(line.key, { note: event.target.value })}
                        />
                      </Field>
                    </div>
                    {hasExtras ? (
                      <LineExtras
                        idPrefix={`${ids}-${line.key}`}
                        index={index}
                        fields={taskFields}
                        tags={tagList}
                        values={line.values}
                        tagIds={line.tagIds}
                        errors={showErrors ? (fieldProblems[index] ?? {}) : {}}
                        flagged={failedLines.has(index)}
                        inherited={Boolean(
                          feedback && (line.sourceTaskId || feedback.sourceTaskId)
                        )}
                        today={today}
                        onValues={(values) => update(line.key, { values })}
                        onTags={(tagIds) => update(line.key, { tagIds })}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <Button
              variant="outline"
              className="self-start"
              disabled={lines.length >= 50}
              onClick={() => {
                const last = lines[lines.length - 1];
                setLines((items) => [
                  ...items,
                  blankLine(
                    last
                      ? {
                          processId: last.processId,
                          shiftId: last.shiftId,
                          qcId: last.qcId,
                          deadline: last.deadline,
                          values: last.values,
                          tagIds: last.tagIds
                        }
                      : undefined
                  )
                ]);
              }}
            >
              <Plus />
              Thêm dòng
            </Button>
            <FormAlert>{formError}</FormAlert>
          </div>

          <DialogFooter className="mx-0 mb-0 flex-wrap gap-2 px-4 py-3 sm:items-center sm:justify-between">
            <p
              className={cn(
                // The footer stacks in reverse on phones: keep the totals above the buttons.
                "text-[13px] tabular-nums max-sm:order-last",
                totals.over ? "font-medium text-warning" : "text-foreground-muted"
              )}
              aria-live="polite"
            >
              {feedback ? (
                <>Giao lại {formatInteger(totals.adding)} tấm</>
              ) : (
                <>
                  Đã giao {formatInteger(assignedNormalQty(job.tasks))} + mới{" "}
                  {formatInteger(totals.adding)} ={" "}
                  <b className="text-foreground">{formatInteger(totals.total)}</b> /{" "}
                  {formatInteger(job.totalImages)} tấm
                  {totals.over
                    ? ` · vượt ${formatInteger(totals.total - job.totalImages)} tấm (vẫn lưu được, kèm cảnh báo)`
                    : totals.remaining > 0
                      ? ` · còn ${formatInteger(totals.remaining)}`
                      : " · đủ"}
                </>
              )}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Hủy
              </Button>
              <Button onClick={submit} disabled={pending}>
                {pending ? <Spinner /> : null}
                {feedback ? `Giao lại ${lines.length} task` : `Chia ${lines.length} task`}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** The tag picker fills the rest of the last 4-column row (TEXT fields take two columns). */
const tagColumns = (fields: readonly CustomField[]) => {
  const used = fields.reduce((sum, field) => sum + (field.type === "TEXT" ? 2 : 1), 0) % 4;
  return used === 0 ? 2 : 4 - used;
};
const tagSpan: Record<number, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3"
};

/** "Độ khó: Khó · 2 tag" — what a collapsed line carries. */
const extrasSummary = (
  fields: readonly CustomField[],
  values: CustomValues,
  tagIds: readonly string[]
) =>
  [
    ...fields
      .filter((field) => !isEmptyValue(values[field.key]))
      .map((field) => `${field.label}: ${formatCustomValue(field, values[field.key])}`),
    ...(tagIds.length > 0 ? [`${tagIds.length} tag`] : [])
  ].join(" · ");

/**
 * The line's TASK custom fields and tags (PLAN §8). Desktop / tablet: a compact grid under the line.
 * Phones: collapsed behind "Thêm thông tin" (summary of what is set), opened by itself when a
 * required field is missing after "Chia".
 */
const LineExtras = ({
  idPrefix,
  index,
  fields,
  tags,
  values,
  tagIds,
  errors,
  flagged,
  inherited,
  today,
  onValues,
  onTags
}: {
  idPrefix: string;
  index: number;
  fields: readonly CustomField[];
  tags: readonly Tag[];
  values: CustomValues;
  tagIds: readonly string[];
  errors: Record<string, string>;
  /** The server named this line ("Dòng N: …"): its fields / tags are the likely cause. */
  flagged: boolean;
  /** "Giao lại" line: started from the source task's values and tags. */
  inherited: boolean;
  today: string;
  onValues: (values: CustomValues) => void;
  onTags: (tagIds: string[]) => void;
}) => {
  const phone = useBreakpoint() === "mobile";
  const [open, setOpen] = useState(false);
  const hasErrors = Object.keys(errors).length > 0;
  const missingRequired = fields.some((field) => field.required && isEmptyValue(values[field.key]));
  const expanded = !phone || open || hasErrors || flagged;
  const summary = extrasSummary(fields, values, tagIds);
  const panelId = `${idPrefix}-extras`;

  return (
    <div className="mt-3 border-t pt-3">
      {phone ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full min-w-0 items-center gap-2 rounded-lg text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-foreground-muted transition-transform",
              expanded && "rotate-180"
            )}
            aria-hidden="true"
          />
          <span className="shrink-0 font-medium">Thêm thông tin</span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              missingRequired ? "text-danger" : "text-foreground-muted"
            )}
          >
            {missingRequired ? "Còn trường bắt buộc" : summary || "Trường tùy chỉnh, tag"}
          </span>
        </button>
      ) : (
        <p className="mb-2 text-xs font-medium text-foreground-muted">
          Thông tin thêm
          {inherited ? (
            <span className="font-normal text-foreground-subtle"> · lấy từ task gốc, sửa được</span>
          ) : null}
        </p>
      )}
      {expanded ? (
        <div
          id={panelId}
          className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", phone && "mt-3")}
        >
          {phone && inherited ? (
            <p className="text-xs text-foreground-subtle">Lấy từ task gốc, sửa được.</p>
          ) : null}
          {fields.map((field) => {
            const id = `${idPrefix}-cf-${field.key}`;
            const error = errors[field.key];
            return (
              <Field
                key={field.id}
                data-invalid={Boolean(error)}
                className={cn(field.type === "TEXT" && "lg:col-span-2")}
              >
                <FieldLabel htmlFor={id} className="text-xs">
                  {field.label}
                  {field.required ? (
                    <span className="text-danger" aria-label="bắt buộc">
                      *
                    </span>
                  ) : null}
                </FieldLabel>
                <CustomFieldInput
                  id={id}
                  field={field}
                  value={values[field.key]}
                  onChange={(value) => onValues({ ...values, [field.key]: value })}
                  invalid={Boolean(error)}
                  today={today}
                />
                {error ? <FieldError className="text-xs">{error}</FieldError> : null}
              </Field>
            );
          })}
          {tags.some((tag) => tag.active || tagIds.includes(tag.id)) ? (
            <Field className={tagSpan[tagColumns(fields)]}>
              <FieldLabel id={`${idPrefix}-tags`} className="text-xs">
                Tag
              </FieldLabel>
              <TagPicker
                tags={tags}
                value={tagIds}
                onChange={onTags}
                aria-label={`Tag dòng ${index + 1}`}
              />
            </Field>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
