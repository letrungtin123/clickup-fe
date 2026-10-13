import { cn } from "cn";
import { Coins, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CreditRule, CustomField, CustomValues, Shift } from "@/contracts/production-catalog";
import type { Feedback, JobDetail, ProductionTask } from "@/contracts/production-jobs";
import { useSessionContext } from "@/features/auth/hooks";

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
  useShifts,
  useTags
} from "../../hooks";
import { useCreateTasks, useReassignFeedback } from "../../jobs-hooks";
import {
  allocation,
  assignedNormalQty,
  dueDayToIso,
  expectedEarnings,
  isoToDay,
  lineOptionalNumbers,
  optionalDetailsSummary,
  receivedDayToIso,
  taskLineProblems,
  unitPriceLabel,
  WORK_LINK_MAX,
  workLinkValue,
  type TaskLineDraft,
  type TaskLineProblemKey
} from "../../jobs-model";
import { useProductionPeople, type Person } from "../../people";
import type { Tag } from "../../types";
import { phoneSheetColumn, sheetOnPhone } from "../../ui";
import { CustomFieldInput } from "../custom-field-input";
import { DateField } from "../date-field";
import { FormAlert, InfoNote } from "../settings-kit";
import { TagPicker } from "../tag-picker";
import { OptionalDetails } from "./optional-details";
import { OptionSelect, PersonSelect } from "./pickers";

/**
 * One work-log row (PD-035). `receivedDay` / `dueDay` default to the job's Ngày nhận / Ngày giao. `values` /
 * `tagIds`: the line's TASK custom fields and tags (required fields must be filled, BE CUSTOM_FIELDS_INVALID
 * "Dòng N: …"). "Giao lại" lines start from the source task's values, tags and Link chia việc (PD-040).
 */
type Line = TaskLineDraft & {
  key: string;
  receivedDay: string | null;
  dueDay: string | null;
  errorQty: string;
  otHours: string;
  workLink: string;
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
  receivedDay: null,
  dueDay: null,
  errorQty: "",
  otHours: "",
  workLink: "",
  note: "",
  sourceTaskId: null,
  values: {},
  tagIds: [],
  ...template
});

const fromTask = (task: ProductionTask, dates: Pick<Line, "receivedDay" | "dueDay">): Line =>
  blankLine({
    assigneeId: task.assignee.id,
    qcId: task.qc?.id ?? null,
    processId: task.process.id,
    shiftId: task.shift.id,
    qty: String(task.qtyAssigned),
    // The redo is about the same images: start from the source's folder (editable).
    workLink: task.workLink ?? "",
    sourceTaskId: task.id,
    values: task.customValues,
    tagIds: task.tagIds,
    ...dates
  });

/** Line numbers named by a server answer ("Dòng 2: …"), to outline those cards. */
const linesInMessage = (message: string | null) =>
  new Set([...(message ?? "").matchAll(/Dòng (\d+):/g)].map((match) => Number(match[1]) - 1));

/** One server error per line ("Dòng 1: … Dòng 2: …" → one per row). */
const splitLineMessages = (message: string) => message.replace(/\s+(?=Dòng \d+:)/g, "\n");

/**
 * One column template for every grid of a line card, so main fields, dates and details line up on desktop:
 * Nhân viên thực hiện (wide) · Quy trình · Ca · Số lượng (narrow). Two columns on tablets, one on phones.
 */
const lineGrid =
  "grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_7rem]";

/** The problems that belong to "Chi tiết thêm" (it opens by itself when one is shown). */
const detailProblemKeys: readonly TaskLineProblemKey[] = ["qc", "errorQty", "otHours", "workLink"];

/** "Độ khó: Khó · 2 tag" — what a line's optional custom fields and tags add to the collapsed summary. */
const extrasSummary = (
  fields: readonly CustomField[],
  values: CustomValues,
  tagIds: readonly string[]
) => [
  ...fields
    .filter((field) => !isEmptyValue(values[field.key]))
    .map((field) => `${field.label}: ${formatCustomValue(field, values[field.key])}`),
  ...(tagIds.length > 0 ? [`${tagIds.length} tag`] : [])
];

/**
 * "Chia task" (PD-035): several work-log rows at once, one card per row —
 *   header: "Dòng N", the unit price from today's credit rules ("5,5 điểm/tấm", or "Chưa có đơn giá"), the expected
 *           points of the row, delete;
 *   main:   Nhân viên thực hiện · Quy trình (Checking included: the QC person's own line, without a QC — PD-037) · Ca ·
 *           Số lượng, then Ngày nhận · Ngày giao (default: the job's) and the required TASK custom fields;
 *   "Chi tiết thêm" (optional, collapsed while empty): QC, Hình lỗi, Giờ OT, Link chia việc (PD-040), Ghi chú, the
 *           other custom fields and tags.
 * Live totals in the footer. With "create: own" (PD-036) every line is mine: the assignee is fixed. In "reassign" mode
 * the lines start from the feedback's source task (FB tasks, PD-014). Not a <form>: Enter in a field never submits.
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
  const myId = session.user.id;
  const ownOnly = !feedback && job.capabilities.splitOwnOnly;
  const people = useProductionPeople([
    job.leader,
    ...job.tasks.flatMap((task) => [task.assignee, task.qc])
  ]);
  const processes = useProcesses();
  const shifts = useShifts();
  const customFields = useCustomFields();
  const tags = useTags();
  const matrix = useCreditMatrix(today);
  const create = useCreateTasks(job.id);
  const reassign = useReassignFeedback(job.id);
  const listRef = useRef<HTMLOListElement | null>(null);
  const taskFields = useMemo(
    () => fieldsFor(customFields.data?.items ?? [], "TASK"),
    [customFields.data]
  );
  const requiredFields = taskFields.filter((field) => field.required);
  const optionalFields = taskFields.filter((field) => !field.required);
  const tagList = useMemo(() => tags.data?.items ?? [], [tags.data]);

  // Defaults of each line: the job's days; a feedback redo is received today and due no earlier than today.
  const jobDue = isoToDay(job.deadline, timeZone);
  const defaultDates = feedback
    ? { receivedDay: today, dueDay: jobDue < today ? today : jobDue }
    : { receivedDay: isoToDay(job.receivedAt, timeZone), dueDay: jobDue };
  const source = feedback?.sourceTaskId
    ? (job.tasks.find((task) => task.id === feedback.sourceTaskId) ?? null)
    : null;
  const [lines, setLines] = useState<Line[]>(() => [
    source
      ? fromTask(source, defaultDates)
      : blankLine({ ...defaultDates, ...(ownOnly ? { assigneeId: myId } : {}) })
  ]);
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const workers = people.withRole("STAFF", "LEADER");
  const checkers = people.withRole("QC");
  const checkingPeople = people.withRole("QC", "LEADER");
  const myself = people.byId(myId) ?? {
    id: myId,
    displayName: session.user.displayName,
    avatarUrl: null
  };
  const processOptions = (processes.data?.items ?? [])
    .filter((process) => process.active)
    .map((process) => ({
      id: process.id,
      label: process.name,
      hint: process.isQc ? "QC" : null
    }));
  const shiftList = (shifts.data?.items ?? []).filter((shift) => shift.active);
  const shiftOptions = shiftList.map((item) => ({
    id: item.id,
    label: item.name,
    hint: item.payMode === "MONEY_IF_KPI" ? "khoán" : null
  }));
  const qcProcessIds = useMemo(
    () =>
      new Set(
        (processes.data?.items ?? []).filter((process) => process.isQc).map((process) => process.id)
      ),
    [processes.data]
  );
  const ruleIndex = useMemo(() => indexRules(matrix.data?.rules ?? []), [matrix.data]);
  const lineContext = { roles: people.roles, qcProcessIds };
  const problems = lines.map((line) => taskLineProblems(line, lineContext));
  // Required TASK fields are checked on every line (the API refuses the whole split otherwise).
  const fieldProblems = lines.map((line) =>
    validateCustomValues(taskFields, line.values, { enforceRequired: true })
  );
  const invalidLines = lines.flatMap((_, index) =>
    Object.keys(problems[index] ?? {}).length > 0 ||
    Object.keys(fieldProblems[index] ?? {}).length > 0
      ? [index]
      : []
  );
  const failedLines = linesInMessage(formError);
  const totals = allocation(
    job.totalImages,
    feedback ? 0 : assignedNormalQty(job.tasks),
    lines.map((line) => Number(line.qty))
  );
  const pending = create.isPending || reassign.isPending;

  const update = (key: string, patch: Partial<Line>) =>
    setLines((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  /** Brings a line into view and focuses its first invalid field (after the errors are rendered). */
  const revealLine = (index: number | undefined) => {
    if (index === undefined) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-line-index="${index}"]`);
    if (!item) return;
    item.scrollIntoView?.({ block: "start", behavior: "smooth" });
    item.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus({ preventScroll: true });
  };

  /**
   * "Thêm dòng": the same process, shift, dates, QC, fields and tags as the last line; a new person — the new line's
   * Nhân viên thực hiện (Quy trình when it is fixed to me) takes the focus.
   */
  const addLine = () => {
    const last = lines[lines.length - 1];
    const line = blankLine(
      last
        ? {
            ...(ownOnly ? { assigneeId: myId } : {}),
            processId: last.processId,
            shiftId: last.shiftId,
            qcId: last.qcId,
            receivedDay: last.receivedDay,
            dueDay: last.dueDay,
            values: last.values,
            tagIds: last.tagIds
          }
        : { ...defaultDates, ...(ownOnly ? { assigneeId: myId } : {}) }
    );
    flushSync(() => setLines((items) => [...items, line]));
    const field = document.getElementById(`${ids}-${line.key}-${ownOnly ? "process" : "assignee"}`);
    field?.focus({ preventScroll: true });
    field?.closest("li")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };

  const submit = () => {
    setFormError(null);
    if (invalidLines.length > 0) {
      flushSync(() => setShowErrors(true));
      revealLine(invalidLines[0]);
      return;
    }
    setShowErrors(true);
    const payload = lines.map((line) => {
      const assignedAt = line.receivedDay ? receivedDayToIso(line.receivedDay, timeZone) : null;
      const deadline = line.dueDay ? dueDayToIso(line.dueDay, timeZone) : null;
      const numbers = lineOptionalNumbers(line);
      return {
        assigneeId: line.assigneeId ?? "",
        processId: line.processId ?? "",
        shiftId: line.shiftId ?? "",
        qtyAssigned: Number(line.qty),
        qcId: line.processId && qcProcessIds.has(line.processId) ? null : line.qcId,
        ...(assignedAt ? { assignedAt } : {}),
        ...(deadline ? { deadline } : {}),
        ...(numbers.errorQty !== null ? { errorQty: numbers.errorQty } : {}),
        ...(numbers.otHours !== null ? { otHours: numbers.otHours } : {}),
        ...(workLinkValue(line.workLink) ? { workLink: workLinkValue(line.workLink) } : {}),
        ...(line.note.trim() ? { note: line.note.trim() } : {}),
        ...(taskFields.length > 0
          ? { customValues: toCustomValuesPayload(taskFields, line.values) }
          : {}),
        // "Giao lại": tags sent on a line replace the inherited ones; the form started from them.
        ...(line.tagIds.length > 0 || feedback ? { tagIds: line.tagIds } : {})
      };
    });
    const onSuccess = (result: { tasks: unknown[]; warnings: string[] }) => {
      toast.success(
        feedback
          ? `Đã giao lại ${result.tasks.length} dòng`
          : `Đã thêm ${result.tasks.length} dòng công việc`
      );
      for (const warning of result.warnings) toast.warning(warning);
      onClose();
    };
    const onError = (error: unknown) => {
      const message = splitLineMessages(productionErrorMessage(error));
      flushSync(() => setFormError(message));
      // A server answer naming lines ("Dòng 2: …"): show the first of them.
      revealLine([...linesInMessage(message)].sort((a, b) => a - b)[0]);
    };
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
        <div
          className={cn(
            "flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col max-sm:h-full",
            phoneSheetColumn
          )}
        >
          <DialogHeader className="border-b px-4 pt-4 pr-12 pb-3">
            <DialogTitle className="[overflow-wrap:anywhere]">
              {feedback
                ? `Giao lại theo feedback ${feedback.type === "WRONG" ? "sai" : "yêu cầu thêm"}`
                : `Chia task · ${job.code}`}
            </DialogTitle>
            <DialogDescription>
              {feedback
                ? "Tạo dòng feedback trỏ về task gốc: mặc định giao lại đúng người cũ và giữ trường tùy chỉnh, tag, link của task gốc — đổi được từng dòng."
                : ownOnly
                  ? "Mỗi dòng là một dòng work log của bạn: quy trình, ca, số lượng, ngày nhận / giao."
                  : "Mỗi dòng là một dòng work log: một người, một quy trình, N tấm. Dòng Checking là việc của người QC."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4">
            {feedback ? (
              <InfoNote icon={TriangleAlert} tone="warning">
                {feedback.note}
              </InfoNote>
            ) : null}
            <ol ref={listRef} className="flex flex-col gap-4" aria-label="Các dòng công việc">
              {lines.map((line, index) => {
                const shift = shiftList.find((item) => item.id === line.shiftId) ?? null;
                return (
                  <LineCard
                    key={line.key}
                    idPrefix={`${ids}-${line.key}`}
                    index={index}
                    line={line}
                    problems={showErrors ? (problems[index] ?? {}) : {}}
                    fieldErrors={showErrors ? (fieldProblems[index] ?? {}) : {}}
                    flagged={failedLines.has(index)}
                    canRemove={lines.length > 1}
                    sourceNumber={
                      line.sourceTaskId
                        ? (job.tasks.find((task) => task.id === line.sourceTaskId)?.number ?? null)
                        : null
                    }
                    inherited={Boolean(feedback && (line.sourceTaskId || feedback.sourceTaskId))}
                    redoWithoutPoints={feedback?.type === "WRONG"}
                    ownOnly={ownOnly}
                    myself={myself}
                    people={{ workers, checkers, checkingPeople, nameOf: people.nameOf }}
                    processOptions={processOptions}
                    isQcProcess={(processId) => qcProcessIds.has(processId)}
                    shiftOptions={shiftOptions}
                    shift={shift}
                    checking={line.processId !== null && qcProcessIds.has(line.processId)}
                    rule={
                      line.processId ? lookupRule(ruleIndex, job.project.id, line.processId) : null
                    }
                    requiredFields={requiredFields}
                    optionalFields={optionalFields}
                    tags={tagList}
                    today={today}
                    onChange={(patch) => update(line.key, patch)}
                    onRemove={() =>
                      setLines((items) => items.filter((item) => item.key !== line.key))
                    }
                  />
                );
              })}
            </ol>
            <Button
              variant="outline"
              className="self-start"
              disabled={lines.length >= 50}
              onClick={addLine}
            >
              <Plus />
              Thêm dòng
            </Button>
            <FormAlert>{formError}</FormAlert>
          </div>

          <DialogFooter className="mx-0 mb-0 gap-x-4 gap-y-2 px-4 py-3 sm:items-center sm:justify-between">
            <p
              className={cn(
                // The footer stacks in reverse on phones: keep the totals above the buttons.
                "min-w-0 text-[13px] tabular-nums max-sm:order-last",
                job.totalImagesManual && totals.over
                  ? "font-medium text-warning"
                  : "text-foreground-muted"
              )}
              aria-live="polite"
            >
              {feedback ? (
                <>Giao lại {formatInteger(totals.adding)} tấm</>
              ) : job.totalImagesManual ? (
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
              ) : (
                // Tổng tấm not typed: it follows the lines (PD-035).
                <>
                  Đã có {formatInteger(assignedNormalQty(job.tasks))} + mới{" "}
                  {formatInteger(totals.adding)} → Tổng tấm{" "}
                  <b className="text-foreground">{formatInteger(totals.total)}</b>
                </>
              )}
            </p>
            {/* Phones: both actions on one row, the primary one widest; desktop: right-aligned. */}
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Hủy
              </Button>
              <Button onClick={submit} disabled={pending} className="max-sm:flex-1">
                {pending ? <Spinner /> : null}
                {feedback ? `Giao lại ${lines.length} dòng` : `Thêm ${lines.length} dòng`}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * The unit price of a line (today's credit rule of the job's project × the line's process), then what the line is
 * expected to earn. No rule yet: a warning badge — the line still saves, it just earns nothing until a price exists.
 */
const PriceInfo = ({
  rule,
  qty,
  shift,
  checking,
  hasProcess,
  redoWithoutPoints
}: {
  rule: CreditRule | null;
  qty: number;
  shift: Shift | null;
  checking: boolean;
  hasProcess: boolean;
  redoWithoutPoints: boolean;
}) => {
  const badge = "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium";
  if (redoWithoutPoints) {
    return (
      <span className={cn(badge, "bg-muted text-foreground-muted")}>Làm lại — không tính điểm</span>
    );
  }
  if (!hasProcess) return null;
  const price = unitPriceLabel(rule, shift?.payMode ?? null);
  if (!price) {
    return (
      <span className={cn(badge, "bg-warning-soft text-foreground")}>
        <TriangleAlert className="size-3.5 text-warning" aria-hidden="true" />
        Chưa có đơn giá
      </span>
    );
  }
  const earnings = expectedEarnings(rule, qty, shift?.payMode ?? null);
  return (
    <>
      <span className={cn(badge, "bg-brand-soft text-brand-text tabular-nums")}>
        <Coins className="size-3.5" aria-hidden="true" />
        {price}
      </span>
      {earnings.credit !== null ? (
        <span className="text-xs whitespace-nowrap text-foreground-muted tabular-nums">
          ≈ {formatCredit(earnings.credit)} điểm{checking ? " QC" : ""}
          {earnings.money !== null ? ` · ${formatMoney(earnings.money)}` : ""}
        </span>
      ) : null}
    </>
  );
};

/** One line of the split: a card that reads as one unit (header, main fields, "Chi tiết thêm"). */
const LineCard = ({
  idPrefix,
  index,
  line,
  problems,
  fieldErrors,
  flagged,
  canRemove,
  sourceNumber,
  inherited,
  redoWithoutPoints,
  ownOnly,
  myself,
  people,
  processOptions,
  isQcProcess,
  shiftOptions,
  shift,
  checking,
  rule,
  requiredFields,
  optionalFields,
  tags,
  today,
  onChange,
  onRemove
}: {
  idPrefix: string;
  index: number;
  line: Line;
  /** Shown problems (empty until the first "Thêm"). */
  problems: Partial<Record<TaskLineProblemKey, string>>;
  fieldErrors: Record<string, string>;
  /** The server named this line ("Dòng N: …"). */
  flagged: boolean;
  canRemove: boolean;
  sourceNumber: number | null;
  /** "Giao lại" line: started from the source task's values, tags and link. */
  inherited: boolean;
  redoWithoutPoints: boolean;
  ownOnly: boolean;
  myself: Person;
  people: {
    workers: Person[];
    checkers: Person[];
    checkingPeople: Person[];
    nameOf: (id: string) => string | undefined;
  };
  processOptions: { id: string; label: string; hint: string | null }[];
  /** The QC process ("Checking", PD-037). */
  isQcProcess: (processId: string) => boolean;
  shiftOptions: { id: string; label: string; hint: string | null }[];
  shift: Shift | null;
  checking: boolean;
  rule: CreditRule | null;
  requiredFields: readonly CustomField[];
  optionalFields: readonly CustomField[];
  tags: readonly Tag[];
  today: string;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) => {
  const id = (name: string) => `${idPrefix}-${name}`;
  const dueOver = line.dueDay !== null && line.dueDay < today;
  const showTags = tags.some((tag) => tag.active || line.tagIds.includes(tag.id));
  const qcName = !checking && line.qcId ? (people.nameOf(line.qcId) ?? "đã chọn") : null;
  const summary = optionalDetailsSummary(
    {
      qcName,
      errorQty: line.errorQty,
      otHours: line.otHours,
      workLink: line.workLink,
      note: line.note
    },
    extrasSummary(optionalFields, line.values, line.tagIds)
  );
  const detailsInvalid =
    detailProblemKeys.some((key) => problems[key]) ||
    optionalFields.some((field) => fieldErrors[field.key]);
  const customField = (field: CustomField) => {
    const fieldId = id(`cf-${field.key}`);
    const error = fieldErrors[field.key];
    return (
      <Field
        key={field.id}
        data-invalid={Boolean(error)}
        className={cn(field.type === "TEXT" && "lg:col-span-2")}
      >
        <FieldLabel htmlFor={fieldId}>
          {field.label}
          {field.required ? (
            <span className="text-danger" aria-label="bắt buộc">
              *
            </span>
          ) : null}
        </FieldLabel>
        <CustomFieldInput
          id={fieldId}
          field={field}
          value={line.values[field.key]}
          onChange={(value) => onChange({ values: { ...line.values, [field.key]: value } })}
          invalid={Boolean(error)}
          today={today}
        />
        {error ? <FieldError className="text-xs">{error}</FieldError> : null}
      </Field>
    );
  };

  return (
    <li
      data-line-index={index}
      className={cn(
        "scroll-mt-2 rounded-xl border bg-surface shadow-xs",
        flagged && "border-danger/60 ring-1 ring-danger/30"
      )}
    >
      <div className="flex min-h-11 items-center gap-2 rounded-t-xl border-b bg-muted/40 py-1.5 pr-1.5 pl-3">
        <div
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1"
          aria-live="polite"
        >
          <span className="text-[13px] font-semibold whitespace-nowrap">
            Dòng {index + 1}
            {sourceNumber !== null || line.sourceTaskId ? (
              <span className="font-normal text-foreground-subtle">
                {" "}
                · task gốc #{sourceNumber ?? "?"}
              </span>
            ) : null}
          </span>
          <PriceInfo
            rule={rule}
            qty={Number(line.qty)}
            shift={shift}
            checking={checking}
            hasProcess={line.processId !== null}
            redoWithoutPoints={redoWithoutPoints}
          />
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Xóa dòng ${index + 1}`}
                className="text-foreground-subtle hover:text-danger"
                disabled={!canRemove}
                onClick={onRemove}
              />
            }
          >
            <Trash2 />
          </TooltipTrigger>
          <TooltipContent>
            {canRemove ? `Xóa dòng ${index + 1}` : "Cần ít nhất một dòng"}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-4 p-3 sm:p-4">
        <div className={lineGrid}>
          <Field data-invalid={Boolean(problems.assignee)}>
            <FieldLabel htmlFor={id("assignee")}>Nhân viên thực hiện</FieldLabel>
            {ownOnly ? (
              <div
                id={id("assignee")}
                className="flex h-8 min-w-0 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm max-sm:h-10"
              >
                <UserAvatar user={myself} size="xs" />
                <span className="truncate">{myself.displayName}</span>
                <span className="ml-auto shrink-0 text-xs text-foreground-subtle">Bạn</span>
              </div>
            ) : (
              <PersonSelect
                id={id("assignee")}
                people={checking ? people.checkingPeople : people.workers}
                value={line.assigneeId}
                onChange={(assigneeId) =>
                  onChange({
                    assigneeId,
                    ...(assigneeId === line.qcId ? { qcId: null } : {})
                  })
                }
                invalid={Boolean(problems.assignee)}
              />
            )}
            {problems.assignee ? (
              <FieldError className="text-xs">{problems.assignee}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={Boolean(problems.process)}>
            <FieldLabel htmlFor={id("process")}>Quy trình</FieldLabel>
            <OptionSelect
              id={id("process")}
              options={processOptions}
              value={line.processId}
              onChange={(processId) =>
                onChange({
                  processId,
                  // A Checking line has no QC of its own (PD-037).
                  ...(processId && isQcProcess(processId) ? { qcId: null } : {})
                })
              }
              placeholder="Chọn quy trình"
              invalid={Boolean(problems.process)}
            />
            {problems.process ? (
              <FieldError className="text-xs">{problems.process}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={Boolean(problems.shift)}>
            <FieldLabel htmlFor={id("shift")}>Ca</FieldLabel>
            <OptionSelect
              id={id("shift")}
              options={shiftOptions}
              value={line.shiftId}
              onChange={(shiftId) => onChange({ shiftId })}
              placeholder="Chọn ca"
              invalid={Boolean(problems.shift)}
            />
            {problems.shift ? <FieldError className="text-xs">{problems.shift}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(problems.qty)}>
            <FieldLabel htmlFor={id("qty")}>Số lượng</FieldLabel>
            <Input
              id={id("qty")}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Số tấm"
              value={line.qty}
              onChange={(event) => onChange({ qty: event.target.value })}
              aria-invalid={Boolean(problems.qty)}
              className="text-right tabular-nums"
            />
            {problems.qty ? <FieldError className="text-xs">{problems.qty}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(problems.received)}>
            <FieldLabel htmlFor={id("received")}>Ngày nhận</FieldLabel>
            <DateField
              id={id("received")}
              value={line.receivedDay}
              onChange={(receivedDay) => onChange({ receivedDay })}
              today={today}
              aria-invalid={Boolean(problems.received)}
            />
            {problems.received ? (
              <FieldError className="text-xs">{problems.received}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={Boolean(problems.due)}>
            <FieldLabel htmlFor={id("due")}>Ngày giao</FieldLabel>
            <DateField
              id={id("due")}
              value={line.dueDay}
              onChange={(dueDay) => onChange({ dueDay })}
              today={today}
              aria-invalid={Boolean(problems.due)}
            />
            {problems.due ? (
              <FieldError className="text-xs">{problems.due}</FieldError>
            ) : dueOver ? (
              <p role="status" className="flex items-start gap-1.5 text-xs text-warning">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                Đã qua — dòng chưa xong sẽ bị tính trễ.
              </p>
            ) : null}
          </Field>
          {/* Required TASK custom fields are not optional: they stay in view, after the dates. */}
          {requiredFields.map(customField)}
        </div>

        <OptionalDetails
          id={id("details")}
          summary={summary}
          placeholder={`QC, hình lỗi, giờ OT, link chia việc, ghi chú${optionalFields.length > 0 || showTags ? ", trường thêm" : ""}`}
          hasValue={summary !== ""}
          forceOpen={detailsInvalid || flagged}
        >
          {inherited && (optionalFields.length > 0 || showTags) ? (
            <p className="mb-3 text-xs text-foreground-subtle">
              Trường tùy chỉnh, tag và link lấy từ task gốc — sửa được.
            </p>
          ) : null}
          <div className={lineGrid}>
            <Field data-invalid={Boolean(problems.qc)} className="sm:col-span-2 lg:col-span-1">
              <FieldLabel htmlFor={id("qc")}>QC</FieldLabel>
              <PersonSelect
                id={id("qc")}
                people={people.checkers.filter((person) => person.id !== line.assigneeId)}
                value={checking ? null : line.qcId}
                onChange={(qcId) => onChange({ qcId })}
                noneLabel={checking ? "Dòng Checking — không có QC" : "Chưa gán QC"}
                disabled={checking}
                invalid={Boolean(problems.qc)}
              />
              {problems.qc ? <FieldError className="text-xs">{problems.qc}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(problems.errorQty)}>
              <FieldLabel htmlFor={id("error")}>Hình lỗi</FieldLabel>
              <Input
                id={id("error")}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Số tấm lỗi"
                value={line.errorQty}
                onChange={(event) => onChange({ errorQty: event.target.value })}
                aria-invalid={Boolean(problems.errorQty)}
                className="tabular-nums"
              />
              {problems.errorQty ? (
                <FieldError className="text-xs">{problems.errorQty}</FieldError>
              ) : null}
            </Field>
            <Field data-invalid={Boolean(problems.otHours)}>
              <FieldLabel htmlFor={id("ot")}>Giờ OT</FieldLabel>
              <Input
                id={id("ot")}
                inputMode="decimal"
                autoComplete="off"
                value={line.otHours}
                // Optional also on the OT shift (PD-035): the hint only names the shift.
                placeholder={shift?.requiresOtHours ? "Ca OT · ví dụ 1,5" : "Ví dụ: 1,5"}
                onChange={(event) => onChange({ otHours: event.target.value })}
                aria-invalid={Boolean(problems.otHours)}
                className="tabular-nums"
              />
              {problems.otHours ? (
                <FieldError className="text-xs">{problems.otHours}</FieldError>
              ) : null}
            </Field>
            <Field
              data-invalid={Boolean(problems.workLink)}
              className="sm:col-start-1 lg:col-span-2"
            >
              <FieldLabel htmlFor={id("link")}>Link chia việc</FieldLabel>
              <Input
                id={id("link")}
                value={line.workLink}
                maxLength={WORK_LINK_MAX}
                autoComplete="off"
                spellCheck={false}
                placeholder="Dán link hoặc đường dẫn thư mục"
                onChange={(event) => onChange({ workLink: event.target.value })}
                aria-invalid={Boolean(problems.workLink)}
              />
              {problems.workLink ? (
                <FieldError className="text-xs">{problems.workLink}</FieldError>
              ) : null}
            </Field>
            <Field className="lg:col-span-2">
              <FieldLabel htmlFor={id("note")}>Ghi chú</FieldLabel>
              <Input
                id={id("note")}
                value={line.note}
                maxLength={5000}
                placeholder="Ghi chú cho dòng này"
                onChange={(event) => onChange({ note: event.target.value })}
              />
            </Field>
            {optionalFields.map(customField)}
            {showTags ? (
              <Field className="sm:col-span-2">
                <FieldLabel id={id("tags")}>Tag</FieldLabel>
                <TagPicker
                  tags={tags}
                  value={line.tagIds}
                  onChange={(tagIds) => onChange({ tagIds })}
                  aria-label={`Tag dòng ${index + 1}`}
                />
              </Field>
            ) : null}
          </div>
        </OptionalDetails>
      </div>
    </li>
  );
};
