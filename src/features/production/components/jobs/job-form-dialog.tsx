import { cn } from "cn";
import { TriangleAlert } from "lucide-react";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { CustomValues } from "@/contracts/production-catalog";
import { jobCodeMaxLength, type JobDetail } from "@/contracts/production-jobs";
import { useSessionContext } from "@/features/auth/hooks";

import { fieldsFor, toCustomValuesPayload, validateCustomValues } from "../../custom-fields";
import { formatInteger, todayIn } from "../../format";
import { productionErrorMessage } from "../../errors";
import {
  useCustomFields,
  useJobStatuses,
  useProductionAccess,
  useProductionMe,
  useProductionProjects,
  useTags
} from "../../hooks";
import { useCreateJob, useUpdateJob } from "../../jobs-hooks";
import {
  dueDayToIso,
  isoToDay,
  receivedDayToIso,
  WORK_LINK_MAX,
  workLinkProblem
} from "../../jobs-model";
import { useProductionPeople } from "../../people";
import { phoneSheetColumn, sheetOnPhone } from "../../ui";
import { CustomFieldsForm } from "../custom-field-input";
import { DateField } from "../date-field";
import { FormAlert } from "../settings-kit";
import { TagPicker } from "../tag-picker";
import { JobStatusSelect } from "./job-status-menu";
import { OptionSelect, PersonSelect } from "./pickers";

type Errors = Partial<
  Record<"project" | "code" | "received" | "deadline" | "leader" | "total" | "link", string>
>;

/** PD-073: the inline error of the Leader field (the API's JOB_LEADER_REQUIRED wording for a new job). */
export const leaderRequiredError = "Chọn Leader cho job.";
/** An older job without a leader, opened for editing: the field shows this until one is picked. */
export const leaderMissingError = "Job chưa có Leader — chọn Leader để lưu.";

/**
 * Create / edit a job (PD-035): Dự án, Gói công việc (the work package typed by the user — the job's code), Ngày nhận
 * and Ngày giao (days in the organization timezone; Ngày giao is the job deadline and the default of its lines), the
 * Leader — required (PD-073; defaults to me when I hold LEADER; an older job without one shows the field's error until one
 * is picked, nothing pre-selected) — an optional Tổng tấm (left empty it follows the sum of the lines), drive link, JOB
 * custom fields and tags. The leader of an existing job changes only with the "update: all" permission
 * (capabilities.canChangeLeader, PD-036); without it the field is read-only and not required (the API agrees).
 * Creating also picks the manual "Trạng thái" (PD-038, default the first status); an existing job changes it from its
 * header menu instead.
 */
export const JobFormDialog = ({
  open,
  job,
  initial,
  onClose,
  onSaved
}: {
  open: boolean;
  job: JobDetail | null;
  /**
   * A new job's starting values (PD-067: "+ Tạo job" of a month group starts in that month, the list's project if one
   * is chosen). Days are organization-calendar days ("YYYY-MM-DD"). Ignored when editing.
   */
  initial?: { projectId?: string | null; receivedDay?: string; dueDay?: string } | undefined;
  onClose: () => void;
  onSaved?: (job: JobDetail) => void;
}) => {
  const ids = useId();
  const session = useSessionContext();
  const access = useProductionAccess();
  const me = useProductionMe();
  const projects = useProductionProjects();
  const fields = useCustomFields();
  const tags = useTags();
  // "Trạng thái" is only picked when creating (an existing job changes it from its header menu).
  const jobStatuses = useJobStatuses(open && !job);
  const people = useProductionPeople(job?.leader ? [job.leader] : []);
  const create = useCreateJob();
  const update = useUpdateJob(job?.id ?? "");
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const today = todayIn(timeZone);
  const iAmLeader = access.roles.includes("LEADER");
  const canChooseLeader = job ? job.capabilities.canChangeLeader : true;

  const initialReceived = job ? isoToDay(job.receivedAt, timeZone) : (initial?.receivedDay ?? today);
  const initialDue = job ? isoToDay(job.deadline, timeZone) : (initial?.dueDay ?? initialReceived);
  const [projectId, setProjectId] = useState<string | null>(
    job?.project.id ?? initial?.projectId ?? null
  );
  const [code, setCode] = useState(job?.code ?? "");
  const [leaderId, setLeaderId] = useState<string | null>(
    job ? (job.leader?.id ?? null) : iAmLeader ? session.user.id : null
  );
  const [received, setReceived] = useState<string | null>(initialReceived);
  const [due, setDue] = useState<string | null>(initialDue);
  const [total, setTotal] = useState(job?.totalImagesManual ? String(job.totalImages) : "");
  const [link, setLink] = useState(job?.driveLink ?? "");
  const [values, setValues] = useState<CustomValues>(job?.customValues ?? {});
  const [valuesTouched, setValuesTouched] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>(job?.tagIds ?? []);
  const [statusId, setStatusId] = useState<string | null>(null);
  // PD-073: an older job without a leader says so at once (whoever may choose one must, to save).
  const [errors, setErrors] = useState<Errors>(() =>
    job && !job.leader && canChooseLeader ? { leader: leaderMissingError } : {}
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const jobFields = useMemo(() => fieldsFor(fields.data?.items ?? [], "JOB"), [fields.data]);
  const projectOptions = (projects.data?.items ?? [])
    .filter((project) => project.active || project.id === job?.project.id)
    .map((project) => ({
      id: project.id,
      label: `${project.code} · ${project.name}`,
      hint: project.clientName
    }));
  const leaders = people.withRole("LEADER");
  const leaderChoices =
    job?.leader && !leaders.some((person) => person.id === job.leader?.id)
      ? [job.leader, ...leaders]
      : leaders;
  const statusChoices = jobStatuses.data?.items ?? [];
  // Untouched: the first status by position, as the API defaults ("Mới nhận").
  const chosenStatusId = statusId ?? statusChoices[0]?.id ?? null;
  const pending = create.isPending || update.isPending;
  // Warn (never block) when a new or changed Ngày giao is already over (BUG-PR-26).
  const dueInPast = due !== null && due !== initialDue && due < today;

  const submit = () => {
    const problems: Errors = {};
    if (!projectId) problems.project = "Chọn dự án.";
    if (!code.trim()) problems.code = "Nhập gói công việc.";
    if (!received) problems.received = "Chọn ngày nhận.";
    if (!due) problems.deadline = "Chọn ngày giao.";
    else if (received && due < received) problems.deadline = "Ngày giao phải từ ngày nhận trở đi.";
    // PD-073: every job has a Leader (whoever may choose it).
    if (canChooseLeader && !leaderId) problems.leader = leaderRequiredError;
    const totalText = total.trim();
    const totalValue = totalText === "" ? null : Number(totalText);
    if (totalValue !== null && (!/^\d+$/.test(totalText) || totalValue > 1_000_000))
      problems.total = "Số tấm nguyên ≥ 0, hoặc để trống để tự tính.";
    // PD-046: a web link or a folder path ("//PHOTO/…", "Y:\…"), like a line's "Link chia việc".
    const linkProblem = workLinkProblem(link);
    if (linkProblem) problems.link = linkProblem;
    const custom = validateCustomValues(jobFields, values, { enforceRequired: !job });
    setErrors(problems);
    setFieldErrors(custom);
    if (
      Object.keys(problems).length > 0 ||
      Object.keys(custom).length > 0 ||
      !projectId ||
      !received ||
      !due
    )
      return;
    const receivedAt = receivedDayToIso(received, timeZone);
    const deadline = dueDayToIso(due, timeZone);
    if (!receivedAt || !deadline) return;

    const onError = (failure: unknown) => setFormError(productionErrorMessage(failure));
    if (job) {
      const totalChanged = job.totalImagesManual
        ? totalValue !== job.totalImages
        : totalValue !== null;
      update.mutate(
        {
          ...(code.trim() !== job.code ? { code: code.trim() } : {}),
          ...(projectId !== job.project.id ? { projectId } : {}),
          // Days the user did not change keep their stored time.
          ...(received !== initialReceived ? { receivedAt } : {}),
          ...(due !== initialDue ? { deadline } : {}),
          ...(totalChanged ? { totalImages: totalValue } : {}),
          ...((link.trim() || null) !== job.driveLink ? { driveLink: link.trim() || null } : {}),
          ...(canChooseLeader && leaderId !== (job.leader?.id ?? null) ? { leaderId } : {}),
          ...(tagIds.join() !== job.tagIds.join() ? { tagIds } : {}),
          ...(valuesTouched ? { customValues: toCustomValuesPayload(jobFields, values) } : {})
        },
        {
          onSuccess: (saved) => {
            toast.success(`Đã lưu gói ${saved.code}`);
            onSaved?.(saved);
            onClose();
          },
          onError
        }
      );
    } else {
      create.mutate(
        {
          projectId,
          code: code.trim(),
          receivedAt,
          deadline,
          leaderId,
          totalImages: totalValue,
          driveLink: link.trim() || null,
          // Catalog not loaded (or failed): the API applies the default status.
          ...(chosenStatusId ? { jobStatusId: chosenStatusId } : {}),
          ...(tagIds.length > 0 ? { tagIds } : {}),
          customValues: toCustomValuesPayload(jobFields, values)
        },
        {
          onSuccess: (saved) => {
            toast.success(`Đã tạo job ${saved.code}`);
            onSaved?.(saved);
            onClose();
          },
          onError
        }
      );
    }
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
            submit();
          }}
        >
          <DialogHeader className="border-b px-4 pt-4 pr-12 pb-3">
            <DialogTitle className="[overflow-wrap:anywhere]">
              {job ? `Sửa job ${job.code}` : "Tạo job"}
            </DialogTitle>
            <DialogDescription>
              Một job là một gói công việc của dự án (như trong file work log); các task
              được chia sau.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <Field data-invalid={Boolean(errors.project)}>
              <FieldLabel htmlFor={`${ids}-project`}>Dự án</FieldLabel>
              <OptionSelect
                id={`${ids}-project`}
                options={projectOptions}
                searchPlaceholder="Tìm dự án…"
                value={projectId}
                onChange={setProjectId}
                placeholder="Chọn dự án"
                invalid={Boolean(errors.project)}
              />
              {errors.project ? <FieldError>{errors.project}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(errors.code)}>
              <FieldLabel htmlFor={`${ids}-code`}>Gói công việc</FieldLabel>
              <Input
                id={`${ids}-code`}
                autoFocus={!job}
                value={code}
                maxLength={jobCodeMaxLength}
                placeholder="Thư mục ảnh hoặc tên batch, ví dụ: 2026-10/Batch 1"
                aria-invalid={Boolean(errors.code)}
                onChange={(event) => setCode(event.target.value)}
              />
              {errors.code ? (
                <FieldError>{errors.code}</FieldError>
              ) : (
                <FieldDescription className="text-xs">
                  Folder hình, hỏi leader nếu không rõ. Mỗi gói chỉ có một job trong dự án.
                </FieldDescription>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.received)}>
                <FieldLabel htmlFor={`${ids}-received`}>Ngày nhận</FieldLabel>
                <DateField
                  id={`${ids}-received`}
                  value={received}
                  onChange={setReceived}
                  today={today}
                  aria-invalid={Boolean(errors.received)}
                />
                {errors.received ? <FieldError>{errors.received}</FieldError> : null}
              </Field>
              <Field data-invalid={Boolean(errors.deadline)}>
                <FieldLabel htmlFor={`${ids}-due`}>Ngày giao</FieldLabel>
                <DateField
                  id={`${ids}-due`}
                  value={due}
                  onChange={setDue}
                  today={today}
                  aria-invalid={Boolean(errors.deadline)}
                />
                {errors.deadline ? (
                  <FieldError>{errors.deadline}</FieldError>
                ) : dueInPast ? (
                  <p role="status" className="flex items-start gap-1.5 text-xs text-warning">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    Ngày giao đã qua — task chưa xong sẽ bị tính trễ ngay.
                  </p>
                ) : (
                  <FieldDescription className="text-xs">
                    Mặc định cho ngày nhận / ngày giao của các task.
                  </FieldDescription>
                )}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.leader)}>
                <FieldLabel htmlFor={`${ids}-leader`}>Leader phụ trách</FieldLabel>
                <PersonSelect
                  id={`${ids}-leader`}
                  people={leaderChoices}
                  value={leaderId}
                  onChange={(next) => {
                    setLeaderId(next);
                    if (next) {
                      setErrors((previous) => {
                        const rest = { ...previous };
                        delete rest.leader;
                        return rest;
                      });
                    }
                  }}
                  placeholder={canChooseLeader ? "Chọn Leader" : "Chưa có leader"}
                  invalid={Boolean(errors.leader)}
                  disabled={!canChooseLeader || !people.canList}
                />
                {errors.leader ? (
                  <FieldError>{errors.leader}</FieldError>
                ) : (
                  <FieldDescription className="text-xs">
                    {job && !canChooseLeader
                      ? "Bạn không có quyền đổi Leader của job."
                      : "Mỗi job phải có một Leader phụ trách."}
                  </FieldDescription>
                )}
              </Field>
              <Field data-invalid={Boolean(errors.total)}>
                <FieldLabel htmlFor={`${ids}-total`}>
                  Tổng tấm <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
                </FieldLabel>
                <Input
                  id={`${ids}-total`}
                  inputMode="numeric"
                  value={total}
                  placeholder={
                    job && !job.totalImagesManual
                      ? `Tự tính: ${formatInteger(job.totalImages)}`
                      : "Tự tính theo các task"
                  }
                  aria-invalid={Boolean(errors.total)}
                  onChange={(event) => setTotal(event.target.value)}
                  className="tabular-nums"
                />
                {errors.total ? (
                  <FieldError>{errors.total}</FieldError>
                ) : (
                  <FieldDescription className="text-xs">
                    Để trống: bằng tổng số lượng các task, tự cập nhật.
                  </FieldDescription>
                )}
              </Field>
            </div>
            <div className={cn("grid gap-4", !job && "sm:grid-cols-2")}>
              {job ? null : (
                <Field>
                  <FieldLabel htmlFor={`${ids}-status`}>
                    Trạng thái{" "}
                    <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
                  </FieldLabel>
                  <JobStatusSelect
                    id={`${ids}-status`}
                    statuses={statusChoices}
                    value={chosenStatusId}
                    onChange={setStatusId}
                    placeholder={jobStatuses.isPending ? "Đang tải…" : "Trạng thái mặc định"}
                    disabled={statusChoices.length === 0}
                  />
                  <FieldDescription className="text-xs">
                    {jobStatuses.isError
                      ? "Không tải được danh sách: job nhận trạng thái mặc định."
                      : "Đổi sau ở trang job."}
                  </FieldDescription>
                </Field>
              )}
              <Field data-invalid={Boolean(errors.link)}>
                <FieldLabel htmlFor={`${ids}-link`}>
                  Link thư mục ảnh{" "}
                  <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
                </FieldLabel>
                <Input
                  id={`${ids}-link`}
                  value={link}
                  maxLength={WORK_LINK_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Dán link hoặc đường dẫn thư mục"
                  aria-invalid={Boolean(errors.link)}
                  onChange={(event) => setLink(event.target.value)}
                />
                {errors.link ? <FieldError>{errors.link}</FieldError> : null}
              </Field>
            </div>
            <Field>
              <FieldLabel>Tag</FieldLabel>
              <TagPicker
                tags={tags.data?.items ?? []}
                value={tagIds}
                onChange={setTagIds}
                aria-label="Tag của job"
              />
            </Field>
            {jobFields.length > 0 ? (
              <div className="flex flex-col gap-3 border-t pt-4">
                <p className="text-xs font-semibold tracking-[0.06em] text-foreground-subtle uppercase">
                  Trường tùy chỉnh
                </p>
                <CustomFieldsForm
                  fields={jobFields}
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
              </div>
            ) : null}
            <FormAlert>{formError}</FormAlert>
          </div>
          <DialogFooter className="mx-0 mb-0 px-4 py-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {job ? "Lưu thay đổi" : "Tạo job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
