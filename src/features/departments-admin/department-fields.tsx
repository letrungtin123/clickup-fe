import { cn } from "cn";
import { Building2, Check, Lock, TriangleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { departmentCodes, departmentLabels, type Department } from "@/contracts/departments";
import type { ProductionRole } from "@/contracts/production-catalog";
import { RoleBadges, RoleToggleGroup } from "@/features/production/components/role-chips";
import { toneClass } from "@/lib/colors";

import {
  allDepartmentsLabel,
  departmentDescriptions,
  departmentErrorField,
  departmentTones,
  escalationMessage,
  removeRetouchWarning,
  removesRetouch,
  showsRetouchRoles,
  toDepartmentChange,
  toggleDepartment,
  validateDepartmentDraft,
  type DepartmentChange,
  type DepartmentDraft,
  type DepartmentErrors,
  type DepartmentLocks
} from "./department-form";

/**
 * Smooth expand / collapse (CSS grid rows 0fr ↔ 1fr + fade). Collapsed content is inert (not
 * focusable, hidden from assistive tech); reduced motion → instant.
 */
const Reveal = ({ open, children }: { open: boolean; children: ReactNode }) => (
  <div
    inert={!open}
    className={cn(
      "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
      open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
    )}
  >
    {/* Side room for the focus rings (no vertical padding: it would keep a collapsed row open). */}
    <div className="-mx-1 min-h-0 overflow-hidden px-1">{children}</div>
  </div>
);

/** Department chips of a list row; "Tất cả" for an organization superadmin. */
export const DepartmentBadges = ({
  departments,
  superadmin = false,
  empty = "Chưa có phòng ban",
  className
}: {
  departments: readonly Department[];
  superadmin?: boolean;
  empty?: string;
  className?: string | undefined;
}) => {
  if (superadmin)
    return (
      <span className={cn("flex flex-wrap gap-1", className)}>
        <span
          title="Superadmin thuộc mọi phòng ban"
          className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-2 text-[11px] font-medium whitespace-nowrap text-foreground-muted"
        >
          {allDepartmentsLabel}
        </span>
      </span>
    );
  const shown = departmentCodes.filter((code) => departments.includes(code));
  return shown.length === 0 ? (
    <span className={cn("text-xs text-foreground-subtle", className)}>{empty}</span>
  ) : (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((department) => (
        <span
          key={department}
          title={departmentDescriptions[department]}
          className={cn(
            toneClass(departmentTones[department]),
            "inline-flex h-5 shrink-0 items-center rounded-full bg-(--tone-soft) px-2 text-[11px] font-medium whitespace-nowrap text-(--tone-text)"
          )}
        >
          {departmentLabels[department]}
        </span>
      ))}
    </span>
  );
};

/**
 * Department cell of a member row: the chips, as a button opening the edit dialog when the viewer
 * may change them.
 */
export const DepartmentCell = ({
  departments,
  superadmin,
  name,
  onEdit,
  className
}: {
  departments: readonly Department[];
  superadmin: boolean;
  name: string;
  /** Absent: read-only. */
  onEdit?: (() => void) | undefined;
  className?: string | undefined;
}) =>
  onEdit ? (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Phòng ban của ${name}: ${
        superadmin
          ? allDepartmentsLabel
          : departments.map((department) => departmentLabels[department]).join(", ") || "chưa có"
      }. Đổi phòng ban`}
      title="Đổi phòng ban"
      className={cn(
        "group/departments -mx-1.5 flex min-h-8 w-[calc(100%+0.75rem)] pointer-coarse:min-h-10 items-center gap-1.5 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <DepartmentBadges departments={departments} superadmin={superadmin} className="min-w-0" />
      <Building2
        className="ml-auto size-3.5 shrink-0 text-foreground-subtle opacity-60 group-hover/departments:opacity-100"
        aria-hidden="true"
      />
    </button>
  ) : (
    <DepartmentBadges departments={departments} superadmin={superadmin} className={className} />
  );

/**
 * Department picker: one checkbox-like chip per department (aria-pressed toggles). Departments the
 * caller may not change are disabled with the reason as a tooltip.
 */
export const DepartmentToggleGroup = ({
  id,
  value,
  onChange,
  locks = {},
  invalid,
  className,
  ...aria
}: {
  id?: string;
  value: readonly Department[];
  onChange: (departments: Department[]) => void;
  locks?: DepartmentLocks;
  invalid?: boolean;
  className?: string | undefined;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) => (
  <div
    id={id}
    role="group"
    aria-invalid={invalid || undefined}
    {...aria}
    className={cn("grid gap-2 sm:grid-cols-2", className)}
  >
    {departmentCodes.map((department) => {
      const pressed = value.includes(department);
      const lockReason = locks[department];
      const option = (
        <button
          key={department}
          type="button"
          aria-pressed={pressed}
          aria-disabled={lockReason !== undefined || undefined}
          onClick={() => {
            if (lockReason === undefined) onChange(toggleDepartment(value, department));
          }}
          className={cn(
            toneClass(departmentTones[department]),
            "flex min-h-11 w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left outline-none transition-[background-color,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
            pressed
              ? "border-(--tone) bg-(--tone-soft)"
              : "border-dashed border-border-strong bg-surface hover:border-(--tone)",
            invalid && !pressed && "border-danger/60",
            lockReason !== undefined && "cursor-not-allowed opacity-60 hover:border-border-strong"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150",
              pressed
                ? "border-transparent bg-(--tone-solid) text-(--tone-on)"
                : "border-input bg-surface"
            )}
          >
            {pressed ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={cn("text-[13px] font-medium", pressed && "text-(--tone-text)")}>
              {departmentLabels[department]}
            </span>
            <span className="text-xs leading-snug text-foreground-muted">
              {departmentDescriptions[department]}
            </span>
          </span>
          {lockReason !== undefined ? (
            <Lock className="mt-0.5 size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
          ) : null}
        </button>
      );
      return lockReason !== undefined ? (
        <Tooltip key={department}>
          <TooltipTrigger render={<span className="flex" />}>{option}</TooltipTrigger>
          <TooltipContent>{lockReason}</TooltipContent>
        </Tooltip>
      ) : (
        option
      );
    })}
  </div>
);

const roleChipSizes =
  "gap-1.5 [&_button]:h-7 [&_button]:px-2.5 [&_button]:text-xs pointer-coarse:[&_button]:h-9";

/**
 * "Phòng ban" (required, multi-select) + "Vai trò Photo Retouch" revealed while Photo Retouch is
 * ticked (creating) or newly added (editing, `before` given). Editing away Photo Retouch shows the
 * warning that the API removes the person's production roles. Focus targets: `${idPrefix}-departments`
 * and `${idPrefix}-roles` (the first chip inside).
 */
export const DepartmentFields = ({
  idPrefix,
  value,
  onChange,
  errors,
  locks,
  before,
  currentRoles
}: {
  idPrefix: string;
  value: DepartmentDraft;
  onChange: (next: DepartmentDraft, field: keyof DepartmentDraft) => void;
  errors: DepartmentErrors;
  locks: DepartmentLocks;
  /** Editing: the member's departments before the change. */
  before?: readonly Department[] | undefined;
  /** Editing: the member's production roles, when known (listed in the removal warning). */
  currentRoles?: readonly ProductionRole[] | undefined;
}) => {
  const rolesShown = showsRetouchRoles(value.departments, before);
  const removing = before !== undefined && removesRetouch(before, value.departments);
  const hasLocks = departmentCodes.some((department) => locks[department] !== undefined);
  return (
    <div className="flex flex-col">
      <Field data-invalid={Boolean(errors.departments)}>
        <FieldLabel id={`${idPrefix}-departments-label`}>Phòng ban</FieldLabel>
        <DepartmentToggleGroup
          id={`${idPrefix}-departments`}
          aria-labelledby={`${idPrefix}-departments-label`}
          value={value.departments}
          locks={locks}
          invalid={Boolean(errors.departments)}
          onChange={(departments) => onChange({ ...value, departments }, "departments")}
        />
        {errors.departments ? (
          <FieldError>{errors.departments}</FieldError>
        ) : (
          <FieldDescription className="text-xs">
            Chọn một hoặc cả hai. Mỗi phòng ban mở module riêng của nó.
          </FieldDescription>
        )}
        {/* Touch screens have no tooltip: say why a department is disabled. */}
        {hasLocks ? (
          <p className="flex items-start gap-1 text-[11px] leading-snug text-foreground-subtle">
            <Lock className="mt-px size-3 shrink-0" aria-hidden="true" />
            {escalationMessage}
          </p>
        ) : null}
      </Field>

      <Reveal open={rolesShown}>
        <Field data-invalid={Boolean(errors.roles)} className="pt-4">
          <FieldLabel id={`${idPrefix}-roles-label`}>Vai trò Photo Retouch</FieldLabel>
          <RoleToggleGroup
            id={`${idPrefix}-roles`}
            aria-labelledby={`${idPrefix}-roles-label`}
            value={value.roles}
            onChange={(roles) => onChange({ ...value, roles }, "roles")}
            className={roleChipSizes}
          />
          {errors.roles ? (
            <FieldError>{errors.roles}</FieldError>
          ) : (
            <FieldDescription className="text-xs">
              {before
                ? "Người này mới vào Photo Retouch: chọn ít nhất một vai trò."
                : "Bắt buộc với Photo Retouch. Một người có thể giữ nhiều vai trò."}
            </FieldDescription>
          )}
        </Field>
      </Reveal>

      <Reveal open={removing}>
        <div
          role={removing ? "status" : undefined}
          className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-[13px] leading-snug"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="flex min-w-0 flex-col gap-1.5">
            <span>{removeRetouchWarning}</span>
            {currentRoles && currentRoles.length > 0 ? <RoleBadges roles={currentRoles} /> : null}
          </span>
        </div>
      </Reveal>
    </div>
  );
};

const ALL = "__all__";

/** "Mọi phòng ban" / one department (list filters). */
export const DepartmentFilterSelect = ({
  value,
  onChange,
  className
}: {
  value: Department | null;
  onChange: (department: Department | null) => void;
  className?: string | undefined;
}) => {
  const items = [
    { value: ALL, label: "Mọi phòng ban" },
    ...departmentCodes.map((code) => ({ value: code, label: departmentLabels[code] }))
  ];
  return (
    <Select
      items={items}
      value={value ?? ALL}
      onValueChange={(next: string | null) =>
        onChange(departmentCodes.find((code) => code === next) ?? null)
      }
    >
      <SelectTrigger className={className} aria-label="Lọc theo phòng ban">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export type DepartmentEditTarget = {
  /** Stable id of the person (a fresh form per person). */
  id: string;
  name: string;
  departments: readonly Department[];
  /** Production roles when known (production users admin): listed in the removal warning. */
  roles?: readonly ProductionRole[] | undefined;
};

/**
 * "Phòng ban của …": change a member's departments (+ roles when Photo Retouch is newly added).
 * `onSave` gets only what changed; its rejection is shown in the form (`describeError`).
 */
export const EditDepartmentsDialog = ({
  target,
  locks,
  onSave,
  describeError,
  onClose,
  contentClassName
}: {
  target: DepartmentEditTarget | null;
  locks: DepartmentLocks;
  onSave: (change: DepartmentChange) => Promise<unknown>;
  describeError: (error: unknown) => string;
  onClose: () => void;
  contentClassName?: string;
}) => {
  // Keep the content while the dialog animates out.
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className={cn("sm:max-w-md", contentClassName)}>
        {shown ? (
          <EditDepartmentsForm
            key={shown.id}
            target={shown}
            locks={locks}
            saving={saving}
            onSave={async (change) => {
              setSaving(true);
              try {
                await onSave(change);
              } finally {
                setSaving(false);
              }
            }}
            describeError={describeError}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const EditDepartmentsForm = ({
  target,
  locks,
  saving,
  onSave,
  describeError,
  onClose
}: {
  target: DepartmentEditTarget;
  locks: DepartmentLocks;
  saving: boolean;
  onSave: (change: DepartmentChange) => Promise<void>;
  describeError: (error: unknown) => string;
  onClose: () => void;
}) => {
  const ids = useId();
  const [draft, setDraft] = useState<DepartmentDraft>({
    departments: [...target.departments],
    roles: ["STAFF"]
  });
  const [errors, setErrors] = useState<DepartmentErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const change = toDepartmentChange(target.departments, draft);

  const focusField = (field: keyof DepartmentErrors) =>
    document.getElementById(`${ids}-${field}`)?.querySelector<HTMLElement>("button")?.focus();

  const submit = () => {
    const problems = validateDepartmentDraft(draft, { before: target.departments, locks });
    setErrors(problems);
    const first = problems.departments ? "departments" : problems.roles ? "roles" : null;
    if (first) {
      focusField(first);
      return;
    }
    if (!change) {
      onClose();
      return;
    }
    onSave(change).then(onClose, (error: unknown) => {
      const field = departmentErrorField(error);
      const message = describeError(error);
      if (field) {
        setErrors({ [field]: message });
        focusField(field);
      } else setFormError(message);
    });
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle className="truncate">Phòng ban của {target.name}</DialogTitle>
        <DialogDescription>
          Phòng ban quyết định module người này dùng: Photo Retouch (job, task, điểm) hoặc
          Production (dự án và công việc).
        </DialogDescription>
      </DialogHeader>
      <DepartmentFields
        idPrefix={ids}
        value={draft}
        onChange={(next, field) => {
          setDraft(next);
          setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
          setFormError(null);
        }}
        errors={errors}
        locks={locks}
        before={target.departments}
        currentRoles={target.roles}
      />
      {formError ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {formError}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" disabled={saving || change === null}>
          {saving ? <Spinner /> : null}
          Lưu phòng ban
        </Button>
      </DialogFooter>
    </form>
  );
};
