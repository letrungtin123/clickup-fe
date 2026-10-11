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
import type { JobDetail } from "@/contracts/production-jobs";
import { useSessionContext } from "@/features/auth/hooks";

import { fieldsFor, toCustomValuesPayload, validateCustomValues } from "../../custom-fields";
import { addDays, todayIn } from "../../format";
import { productionErrorMessage } from "../../errors";
import {
  useCustomFields,
  useProductionAccess,
  useProductionMe,
  useProductionProjects,
  useTags
} from "../../hooks";
import { useCreateJob, useUpdateJob } from "../../jobs-hooks";
import { zonedToIso } from "../../jobs-model";
import { useProductionPeople } from "../../people";
import { phoneSheetColumn, sheetOnPhone } from "../../ui";
import { CustomFieldsForm } from "../custom-field-input";
import { FormAlert } from "../settings-kit";
import { TagPicker } from "../tag-picker";
import { DateTimeField } from "./date-time-field";
import { OptionSelect, PersonSelect } from "./pickers";

type Errors = Partial<
  Record<"project" | "code" | "leader" | "deadline" | "total" | "link", string>
>;

/**
 * Create / edit a job (SPEC Phase 2): project, code, name, Leader (defaults to me when I am a Leader),
 * deadline (organization timezone), total images, drive link, JOB custom fields and tags. Only
 * Account / Admin change the Leader of an existing job.
 */
export const JobFormDialog = ({
  open,
  job,
  onClose,
  onSaved
}: {
  open: boolean;
  job: JobDetail | null;
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
  const people = useProductionPeople(job ? [job.leader] : []);
  const create = useCreateJob();
  const update = useUpdateJob(job?.id ?? "");
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const today = todayIn(timeZone);
  const iAmLeader = access.roles.includes("LEADER");
  const canChooseLeader = job ? access.can("ACCOUNT") : true;

  const [projectId, setProjectId] = useState<string | null>(job?.project.id ?? null);
  const [code, setCode] = useState(job?.code ?? "");
  const [name, setName] = useState(job?.name ?? "");
  const [leaderId, setLeaderId] = useState<string | null>(
    job?.leader.id ?? (iAmLeader ? session.user.id : null)
  );
  const [deadline, setDeadline] = useState<string | null>(
    job?.deadline ?? zonedToIso(addDays(today, 1), "17:00", timeZone)
  );
  const [total, setTotal] = useState(job ? String(job.totalImages) : "");
  const [link, setLink] = useState(job?.driveLink ?? "");
  const [values, setValues] = useState<CustomValues>(job?.customValues ?? {});
  const [valuesTouched, setValuesTouched] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>(job?.tagIds ?? []);
  const [errors, setErrors] = useState<Errors>({});
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
    job && !leaders.some((person) => person.id === job.leader.id)
      ? [job.leader, ...leaders]
      : leaders;
  const pending = create.isPending || update.isPending;
  // Warn (never block) when a new or changed deadline is already over (BUG-PR-26). The dialog is
  // re-keyed on every open, so "now" is when it opened.
  const [openedAt] = useState(() => Date.now());
  const deadlineInPast =
    deadline !== null &&
    deadline !== (job?.deadline ?? null) &&
    new Date(deadline).getTime() < openedAt;

  const submit = () => {
    const problems: Errors = {};
    if (!projectId) problems.project = "Chọn dự án.";
    if (!code.trim()) problems.code = "Nhập mã job.";
    if (!leaderId) problems.leader = "Chọn Leader phụ trách.";
    if (!deadline) problems.deadline = "Chọn ngày và giờ.";
    const totalValue = Number(total);
    if (!/^\d+$/.test(total.trim()) || totalValue < 1 || totalValue > 1_000_000)
      problems.total = "Số tấm nguyên ≥ 1.";
    if (link.trim() && !/^https?:\/\//i.test(link.trim()))
      problems.link = "Link phải bắt đầu bằng http:// hoặc https://";
    const custom = validateCustomValues(jobFields, values, { enforceRequired: !job });
    setErrors(problems);
    setFieldErrors(custom);
    if (
      Object.keys(problems).length > 0 ||
      Object.keys(custom).length > 0 ||
      !projectId ||
      !deadline ||
      !leaderId
    )
      return;

    const common = {
      code: code.trim(),
      name: name.trim() || null,
      deadline,
      totalImages: totalValue,
      driveLink: link.trim() || null,
      ...(tagIds.join() !== (job?.tagIds ?? []).join() ? { tagIds } : {})
    };
    const onError = (failure: unknown) => setFormError(productionErrorMessage(failure));
    if (job) {
      update.mutate(
        {
          ...common,
          ...(projectId !== job.project.id ? { projectId } : {}),
          ...(canChooseLeader && leaderId !== job.leader.id ? { leaderId } : {}),
          ...(valuesTouched ? { customValues: toCustomValuesPayload(jobFields, values) } : {})
        },
        {
          onSuccess: (saved) => {
            toast.success(`Đã lưu job ${saved.code}`);
            onSaved?.(saved);
            onClose();
          },
          onError
        }
      );
    } else {
      create.mutate(
        { ...common, projectId, leaderId, customValues: toCustomValuesPayload(jobFields, values) },
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
            <DialogTitle>{job ? `Sửa job ${job.code}` : "Tạo job"}</DialogTitle>
            <DialogDescription>
              Một job là một gói ảnh của dự án; Leader phụ trách chia task cho nhân viên.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <Field data-invalid={Boolean(errors.project)}>
              <FieldLabel htmlFor={`${ids}-project`}>Dự án</FieldLabel>
              <OptionSelect
                id={`${ids}-project`}
                options={projectOptions}
                value={projectId}
                onChange={setProjectId}
                placeholder="Chọn dự án"
                invalid={Boolean(errors.project)}
              />
              {errors.project ? <FieldError>{errors.project}</FieldError> : null}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.code)}>
                <FieldLabel htmlFor={`${ids}-code`}>Mã job</FieldLabel>
                <Input
                  id={`${ids}-code`}
                  autoFocus={!job}
                  value={code}
                  maxLength={160}
                  placeholder="Ví dụ: VD JO0001_Batch 1"
                  aria-invalid={Boolean(errors.code)}
                  onChange={(event) => setCode(event.target.value)}
                />
                {errors.code ? <FieldError>{errors.code}</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor={`${ids}-name`}>
                  Tên <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
                </FieldLabel>
                <Input
                  id={`${ids}-name`}
                  value={name}
                  maxLength={300}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.leader)}>
                <FieldLabel htmlFor={`${ids}-leader`}>Leader phụ trách</FieldLabel>
                <PersonSelect
                  id={`${ids}-leader`}
                  people={leaderChoices}
                  value={leaderId}
                  onChange={setLeaderId}
                  placeholder={people.canList ? "Chọn Leader" : "Bạn"}
                  disabled={!canChooseLeader || !people.canList}
                  invalid={Boolean(errors.leader)}
                />
                {errors.leader ? (
                  <FieldError>{errors.leader}</FieldError>
                ) : job && !canChooseLeader ? (
                  <FieldDescription className="text-xs">
                    Chỉ Account hoặc Quản trị đổi được Leader.
                  </FieldDescription>
                ) : null}
              </Field>
              <Field data-invalid={Boolean(errors.total)}>
                <FieldLabel htmlFor={`${ids}-total`}>Tổng số tấm</FieldLabel>
                <Input
                  id={`${ids}-total`}
                  inputMode="numeric"
                  value={total}
                  aria-invalid={Boolean(errors.total)}
                  onChange={(event) => setTotal(event.target.value)}
                  className="tabular-nums"
                />
                {errors.total ? <FieldError>{errors.total}</FieldError> : null}
              </Field>
            </div>
            <Field data-invalid={Boolean(errors.deadline)}>
              <FieldLabel htmlFor={`${ids}-deadline`}>Deadline giao khách</FieldLabel>
              <DateTimeField
                id={`${ids}-deadline`}
                value={deadline}
                onChange={setDeadline}
                timeZone={timeZone}
                today={today}
                invalid={Boolean(errors.deadline)}
                aria-label="Deadline"
              />
              {errors.deadline ? (
                <FieldError>{errors.deadline}</FieldError>
              ) : deadlineInPast ? (
                <p role="status" className="flex items-start gap-1.5 text-xs text-warning">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  Deadline này đã qua — task chia từ job sẽ bị tính trễ ngay. Vẫn lưu được nếu bạn
                  chắc chắn.
                </p>
              ) : (
                <FieldDescription className="text-xs">
                  Deadline mặc định của task = deadline job − buffer QC của dự án ({timeZone}).
                </FieldDescription>
              )}
            </Field>
            <Field data-invalid={Boolean(errors.link)}>
              <FieldLabel htmlFor={`${ids}-link`}>
                Link thư mục ảnh{" "}
                <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
              </FieldLabel>
              <Input
                id={`${ids}-link`}
                type="url"
                inputMode="url"
                value={link}
                maxLength={2000}
                placeholder="https://…"
                aria-invalid={Boolean(errors.link)}
                onChange={(event) => setLink(event.target.value)}
              />
              {errors.link ? <FieldError>{errors.link}</FieldError> : null}
            </Field>
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
