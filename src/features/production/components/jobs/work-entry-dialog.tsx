import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { CustomValues } from "@/contracts/production-catalog";
import type { JobOption, WorkEntryResult } from "@/contracts/production-jobs";
import { useSessionContext } from "@/features/auth/hooks";
import { isApiError } from "@/lib/api/errors";

import { fieldsFor, toCustomValuesPayload, validateCustomValues } from "../../custom-fields";
import { productionErrorMessage } from "../../errors";
import { formatInteger, todayIn } from "../../format";
import {
  useCustomFields,
  useProcesses,
  useProductionAccess,
  useProductionMe,
  useProductionProjects,
  useShifts
} from "../../hooks";
import { useCreateWorkEntry } from "../../jobs-hooks";
import { optionalDetailsSummary, WORK_LINK_MAX } from "../../jobs-model";
import { productionKeys } from "../../keys";
import { useProductionPeople, type Person } from "../../people";
import { phoneSheetColumn, sheetOnPhone } from "../../ui";
import {
  newWorkEntryDraft,
  nextWorkEntryDraft,
  shortPackage,
  withProject,
  withoutLinePrefix,
  workEntryJobError,
  workEntryPayload,
  workEntryProblems,
  type WorkEntryDraft
} from "../../work-entry";
import { CustomFieldsForm } from "../custom-field-input";
import { DateField } from "../date-field";
import { FormAlert } from "../settings-kit";
import { JobOptionPicker } from "./job-option-picker";
import { OptionalDetails } from "./optional-details";
import { OptionSelect, PersonSelect } from "./pickers";

type SaveMode = "close" | "next";

/**
 * "Nhập công việc" (PD-035, PD-038): one row of the work-log Excel — Nhân viên thực hiện, Dự án, Gói công việc, Quy
 * trình, Ngày nhận, Ngày giao, Ca làm việc, Số lượng, Hình lỗi, Giờ OT, Link chia việc (PD-040), Ghi chú — plus the
 * TASK custom fields. The package is an EXISTING job of the project, picked from a searchable list (closed jobs too);
 * the entry never creates a job — jobs come from "Tạo job". "create: own" enters rows for myself only; "create: all"
 * picks the person (PD-036). "Lưu & nhập tiếp" (also Enter) keeps the row's context (person, project, job, process,
 * shift, dates) for the next one.
 */
export const WorkEntryDialog = ({
  open,
  onClose,
  initial,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  /** Starts the row in this project, or this job and its project (e.g. from a job page or a filtered list). */
  initial?: { projectId?: string | undefined; job?: JobOption | undefined } | undefined;
  onSaved?: ((result: WorkEntryResult) => void) | undefined;
}) => {
  const ids = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const access = useProductionAccess();
  const me = useProductionMe();
  const scopes = access.jobScopes;
  const self = useMemo<Person>(
    () => ({ id: session.user.id, displayName: session.user.displayName, avatarUrl: null }),
    [session.user.id, session.user.displayName]
  );
  const people = useProductionPeople([self]);
  const projects = useProductionProjects();
  const processes = useProcesses();
  const shifts = useShifts();
  const customFields = useCustomFields();
  const create = useCreateWorkEntry();
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const today = todayIn(timeZone);
  // "create: all" picks anyone (when the member list is readable); otherwise the row is mine.
  const canPick = scopes.create === "all" && people.canList;
  const qtyRef = useRef<HTMLInputElement | null>(null);

  const [draft, setDraft] = useState<WorkEntryDraft>(() =>
    newWorkEntryDraft(today, {
      assigneeId: session.user.id,
      projectId: initial?.projectId ?? null,
      job: initial?.job ?? null
    })
  );
  const [values, setValues] = useState<CustomValues>({});
  const [showErrors, setShowErrors] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // A save refused because of the picked job (deleted, archived, other project): shown under "Gói công việc".
  const [jobError, setJobError] = useState<string | null>(null);
  const [saving, setSaving] = useState<SaveMode | null>(null);
  const set = (patch: Partial<WorkEntryDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setFormError(null);
  };

  const taskFields = useMemo(
    () => fieldsFor(customFields.data?.items ?? [], "TASK"),
    [customFields.data]
  );
  const projectOptions = (projects.data?.items ?? [])
    // The project the row started in (e.g. a job's) stays listed even if it was deactivated since.
    .filter((project) => project.active || project.id === draft.projectId)
    .map((project) => ({
      id: project.id,
      label: `${project.code} · ${project.name}`,
      hint: project.clientName
    }));
  const processList = (processes.data?.items ?? []).filter((process) => process.active);
  const processOptions = processList.map((process) => ({
    id: process.id,
    label: process.name,
    hint: process.isQc ? "QC" : null
  }));
  const shiftList = (shifts.data?.items ?? []).filter((shift) => shift.active);
  const shift = shiftList.find((item) => item.id === draft.shiftId) ?? null;
  // PD-037: a Checking line is done by QC / Leader (and has no QC of its own); other processes by Staff / Leader.
  const checking = processList.find((process) => process.id === draft.processId)?.isQc ?? false;
  const pool = checking ? people.withRole("QC", "LEADER") : people.withRole("STAFF", "LEADER");
  const chosen = people.byId(draft.assigneeId);
  const assigneeChoices =
    chosen && !pool.some((person) => person.id === chosen.id) ? [chosen, ...pool] : pool;
  const isSelf = draft.assigneeId === session.user.id;
  const assigneeRoles = isSelf
    ? me.data
      ? access.roles
      : null
    : draft.assigneeId
      ? (people.roles.get(draft.assigneeId) ?? null)
      : null;

  const problems = workEntryProblems(draft, { checking, assigneeRoles, self: isSelf });
  const shown = showErrors ? problems : {};
  // Dates picked out of order are pointed out right away.
  const dueError =
    shown.dueDay ??
    (draft.receivedDay && draft.dueDay && draft.dueDay < draft.receivedDay
      ? problems.dueDay
      : undefined);

  const pending = create.isPending;
  const detailsSummary = optionalDetailsSummary(draft);

  const submit = (mode: SaveMode) => {
    if (pending) return;
    setShowErrors(true);
    setFormError(null);
    setJobError(null);
    const custom = validateCustomValues(taskFields, values, { enforceRequired: true });
    setFieldErrors(custom);
    const payload = workEntryPayload(draft, {
      timeZone,
      sendAssignee: canPick,
      ...(taskFields.length > 0 ? { customValues: toCustomValuesPayload(taskFields, values) } : {})
    });
    if (Object.keys(problems).length > 0 || Object.keys(custom).length > 0 || !payload) return;
    setSaving(mode);
    create.mutate(payload, {
      onSuccess: (result) => {
        toast.success(`Đã nhập vào gói ${shortPackage(result.task.jobCode)}`, {
          description: `${result.task.assignee.displayName} · ${result.task.process.name} · ${formatInteger(result.task.qtyAssigned)} tấm`,
          // "view: none" has no job page to open.
          ...(scopes.view !== "none"
            ? {
                action: {
                  label: "Mở job",
                  onClick: () => void navigate(`/production/jobs/${result.jobId}`)
                }
              }
            : {})
        });
        for (const warning of result.warnings) toast.warning(warning);
        onSaved?.(result);
        if (mode === "close") {
          onClose();
          return;
        }
        // Next row of the same day: same person, project, job, process, shift, dates and fields.
        setDraft(nextWorkEntryDraft);
        setShowErrors(false);
        setFieldErrors({});
        qtyRef.current?.focus();
      },
      onError: (error) => {
        const aboutJob = isApiError(error) ? workEntryJobError(error.code) : null;
        if (aboutJob) {
          setJobError(aboutJob);
          // The picker's list is out of date (job deleted, archived or moved): fetch it again.
          void queryClient.invalidateQueries({ queryKey: productionKeys.jobOptions() });
        } else setFormError(withoutLinePrefix(productionErrorMessage(error)));
      },
      onSettled: () => setSaving(null)
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl",
          sheetOnPhone
        )}
      >
        <form
          noValidate
          className={cn("flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col", phoneSheetColumn)}
          onSubmit={(event) => {
            event.preventDefault();
            // Enter submits with the first submit button ("Lưu & nhập tiếp").
            const submitter = event.nativeEvent.submitter;
            submit(submitter?.dataset.mode === "close" ? "close" : "next");
          }}
        >
          <DialogHeader className="border-b px-4 pt-4 pr-12 pb-3">
            <DialogTitle>Nhập công việc</DialogTitle>
            <DialogDescription>
              Một dòng như trong file work log, thêm vào một gói công việc đã có của dự án. Gói mới
              do Leader / Account tạo bằng “Tạo job”.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(shown.assignee)}>
                <FieldLabel htmlFor={`${ids}-assignee`}>Nhân viên thực hiện</FieldLabel>
                {canPick ? (
                  <PersonSelect
                    id={`${ids}-assignee`}
                    people={assigneeChoices}
                    value={draft.assigneeId}
                    onChange={(assigneeId) => set({ assigneeId })}
                    placeholder={people.isPending ? "Đang tải…" : "Chọn nhân viên"}
                    disabled={people.isPending}
                    invalid={Boolean(shown.assignee)}
                  />
                ) : (
                  <Input
                    id={`${ids}-assignee`}
                    readOnly
                    value={self.displayName}
                    aria-invalid={Boolean(shown.assignee)}
                    className="bg-muted/40"
                  />
                )}
                {shown.assignee ? (
                  <FieldError>{shown.assignee}</FieldError>
                ) : canPick ? (
                  <FieldDescription className="text-xs">
                    {checking
                      ? "Dòng Checking: người có vai trò QC hoặc Leader."
                      : "Nhân viên hoặc Leader làm dòng này."}
                  </FieldDescription>
                ) : (
                  <FieldDescription className="text-xs">
                    Bạn nhập công việc của chính mình.
                  </FieldDescription>
                )}
              </Field>
              <Field data-invalid={Boolean(shown.project)}>
                <FieldLabel htmlFor={`${ids}-project`}>Dự án</FieldLabel>
                <OptionSelect
                  id={`${ids}-project`}
                  options={projectOptions}
                  value={draft.projectId}
                  onChange={(projectId) => {
                    // A job never crosses projects: another project drops the picked job.
                    setDraft((current) => withProject(current, projectId));
                    setFormError(null);
                    setJobError(null);
                  }}
                  placeholder={projects.isPending ? "Đang tải…" : "Chọn dự án"}
                  invalid={Boolean(shown.project)}
                />
                {shown.project ? <FieldError>{shown.project}</FieldError> : null}
              </Field>
            </div>

            <Field data-invalid={Boolean(shown.job ?? jobError)}>
              <FieldLabel htmlFor={`${ids}-job`}>Gói công việc</FieldLabel>
              <JobOptionPicker
                id={`${ids}-job`}
                projectId={draft.projectId}
                value={draft.job}
                onChange={(job) => {
                  set({ job });
                  setJobError(null);
                }}
                timeZone={timeZone}
                invalid={Boolean(shown.job ?? jobError)}
                aria-describedby={`${ids}-job-hint`}
              />
              {(shown.job ?? jobError) ? (
                <FieldError id={`${ids}-job-hint`}>{shown.job ?? jobError}</FieldError>
              ) : draft.job?.jobStatus.isClosed ? (
                <FieldDescription id={`${ids}-job-hint`} className="text-xs">
                  Gói đang ở trạng thái “{draft.job.jobStatus.name}” (đã đóng) — vẫn nhập thêm được.
                </FieldDescription>
              ) : (
                <FieldDescription id={`${ids}-job-hint`} className="text-xs">
                  {draft.projectId
                    ? "Chọn job có sẵn của dự án (cả job đã giao khách). Gói mới: nhờ Leader / Account “Tạo job”."
                    : "Chọn dự án trước để thấy các gói công việc của dự án."}
                </FieldDescription>
              )}
            </Field>

            <Field data-invalid={Boolean(shown.process)}>
              <FieldLabel htmlFor={`${ids}-process`}>Quy trình</FieldLabel>
              <OptionSelect
                id={`${ids}-process`}
                options={processOptions}
                value={draft.processId}
                onChange={(processId) => set({ processId })}
                placeholder={processes.isPending ? "Đang tải…" : "Chọn quy trình"}
                invalid={Boolean(shown.process)}
              />
              {shown.process ? <FieldError>{shown.process}</FieldError> : null}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(shown.receivedDay)}>
                <FieldLabel htmlFor={`${ids}-received`}>Ngày nhận</FieldLabel>
                <DateField
                  id={`${ids}-received`}
                  value={draft.receivedDay}
                  today={today}
                  aria-invalid={Boolean(shown.receivedDay)}
                  onChange={(day) => {
                    if (!day) return;
                    // Ngày giao never falls before Ngày nhận: it follows a later Ngày nhận.
                    set({
                      receivedDay: day,
                      ...(draft.dueDay && draft.dueDay < day ? { dueDay: day } : {})
                    });
                  }}
                />
                {shown.receivedDay ? <FieldError>{shown.receivedDay}</FieldError> : null}
              </Field>
              <Field data-invalid={Boolean(dueError)}>
                <FieldLabel htmlFor={`${ids}-due`}>Ngày giao</FieldLabel>
                <DateField
                  id={`${ids}-due`}
                  value={draft.dueDay}
                  today={today}
                  aria-invalid={Boolean(dueError)}
                  onChange={(day) => {
                    if (day) set({ dueDay: day });
                  }}
                />
                {dueError ? <FieldError>{dueError}</FieldError> : null}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(shown.shift)}>
                <FieldLabel htmlFor={`${ids}-shift`}>Ca làm việc</FieldLabel>
                <OptionSelect
                  id={`${ids}-shift`}
                  options={shiftList.map((item) => ({
                    id: item.id,
                    label: item.name,
                    hint: item.payMode === "MONEY_IF_KPI" ? "khoán" : null
                  }))}
                  value={draft.shiftId}
                  onChange={(shiftId) => set({ shiftId })}
                  placeholder={shifts.isPending ? "Đang tải…" : "Chọn ca"}
                  invalid={Boolean(shown.shift)}
                />
                {shown.shift ? <FieldError>{shown.shift}</FieldError> : null}
              </Field>
              <Field data-invalid={Boolean(shown.qty)}>
                <FieldLabel htmlFor={`${ids}-qty`}>Số lượng</FieldLabel>
                <Input
                  ref={qtyRef}
                  id={`${ids}-qty`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft.qty}
                  aria-invalid={Boolean(shown.qty)}
                  onChange={(event) => set({ qty: event.target.value })}
                  className="tabular-nums"
                />
                {shown.qty ? <FieldError>{shown.qty}</FieldError> : null}
              </Field>
            </div>

            {/* Optional details behind one toggle, like "Chia task": open while filled or invalid. */}
            <OptionalDetails
              id={`${ids}-details`}
              summary={detailsSummary}
              placeholder="Hình lỗi, giờ OT, link chia việc, ghi chú"
              hasValue={detailsSummary !== ""}
              forceOpen={Boolean(shown.errorQty ?? shown.otHours ?? shown.workLink)}
            >
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={Boolean(shown.errorQty)}>
                    <FieldLabel htmlFor={`${ids}-errors`}>Hình lỗi</FieldLabel>
                    <Input
                      id={`${ids}-errors`}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Số tấm lỗi"
                      value={draft.errorQty}
                      aria-invalid={Boolean(shown.errorQty)}
                      onChange={(event) => set({ errorQty: event.target.value })}
                      className="tabular-nums"
                    />
                    {shown.errorQty ? (
                      <FieldError>{shown.errorQty}</FieldError>
                    ) : (
                      <FieldDescription className="text-xs">
                        Chỉ để ghi nhận, không ảnh hưởng điểm.
                      </FieldDescription>
                    )}
                  </Field>
                  <Field data-invalid={Boolean(shown.otHours)}>
                    <FieldLabel htmlFor={`${ids}-ot`}>Giờ OT</FieldLabel>
                    <Input
                      id={`${ids}-ot`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="Ví dụ: 1,5"
                      value={draft.otHours}
                      aria-invalid={Boolean(shown.otHours)}
                      onChange={(event) => set({ otHours: event.target.value })}
                      className="tabular-nums"
                    />
                    {shown.otHours ? (
                      <FieldError>{shown.otHours}</FieldError>
                    ) : shift?.requiresOtHours ? (
                      <FieldDescription className="text-xs">
                        Ca OT: nhập số giờ nếu có — không bắt buộc.
                      </FieldDescription>
                    ) : null}
                  </Field>
                </div>
                <Field data-invalid={Boolean(shown.workLink)}>
                  <FieldLabel htmlFor={`${ids}-link`}>Link chia việc</FieldLabel>
                  <Input
                    id={`${ids}-link`}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={WORK_LINK_MAX}
                    placeholder="Dán link hoặc đường dẫn thư mục"
                    value={draft.workLink}
                    aria-invalid={Boolean(shown.workLink)}
                    onChange={(event) => set({ workLink: event.target.value })}
                  />
                  {shown.workLink ? <FieldError>{shown.workLink}</FieldError> : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${ids}-note`}>Ghi chú</FieldLabel>
                  <Textarea
                    id={`${ids}-note`}
                    value={draft.note}
                    maxLength={5000}
                    rows={2}
                    placeholder="Ghi chú cho dòng này"
                    onChange={(event) => set({ note: event.target.value })}
                    className="max-h-40"
                  />
                </Field>
              </div>
            </OptionalDetails>

            {taskFields.length > 0 ? (
              <div className="flex flex-col gap-3 border-t pt-4">
                <p className="text-xs font-semibold tracking-[0.06em] text-foreground-subtle uppercase">
                  Trường tùy chỉnh
                </p>
                <CustomFieldsForm
                  fields={taskFields}
                  values={values}
                  onChange={(next) => {
                    setValues(next);
                    setFieldErrors({});
                  }}
                  errors={fieldErrors}
                  idPrefix={ids}
                  today={today}
                />
              </div>
            ) : null}
            <FormAlert>{formError}</FormAlert>
          </div>
          {/* Phones: the three actions share one row (the sheet keeps its close button too). */}
          <DialogFooter className="mx-0 mb-0 px-4 py-3 max-sm:flex-row sm:items-center">
            <p className="mr-auto text-xs text-foreground-subtle max-sm:hidden">
              Enter = Lưu & nhập tiếp
            </p>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Hủy
            </Button>
            {/* First submit button: the one Enter uses. */}
            <Button
              type="submit"
              variant="outline"
              data-mode="next"
              disabled={pending}
              className="max-sm:flex-1"
            >
              {saving === "next" ? <Spinner /> : null}
              Lưu & nhập tiếp
            </Button>
            <Button type="submit" data-mode="close" disabled={pending}>
              {saving === "close" ? <Spinner /> : null}
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
