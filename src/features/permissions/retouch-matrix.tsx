import { cn } from "cn";
import { Lock } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  jobPermissionActions,
  type JobPermissionAction,
  type JobPermissionMatrix,
  type JobPermissionRole,
  type JobPermissionScope,
  type ProductionRole
} from "@/contracts/production-catalog";
import { RoleBadge } from "@/features/production/components/role-chips";
import {
  jobScopeItems,
  jobScopeLabels,
  jobScopeMeaning,
  jobScopeNotes
} from "@/features/production/job-permissions";
import { productionRoleLabels } from "@/features/production/roles";

import { GroupRow, HeadCell, MarkCell, MatrixTable, RowHead, fixedRuleHint } from "./matrix-kit";
import { retouchColumns, type RetouchRule } from "./retouch-rules";

/** Row labels of the job permission matrix (PD-036) on this page. */
const jobRowLabels: Record<JobPermissionAction, string> = {
  view: "Xem job",
  create: "Tạo job / task",
  update: "Sửa",
  delete: "Xoá"
};

const jobRowDescription = (action: JobPermissionAction) =>
  [
    `Của mình: ${jobScopeMeaning[action].own}`,
    `Tất cả: ${jobScopeMeaning[action].all}`,
    jobScopeNotes[action]
  ]
    .filter(Boolean)
    .join(" ");

const statusChangeLabel = "Đổi trạng thái job — theo quyền Sửa (Của mình = job mình được giao)";

/**
 * Photo Retouch view: production roles × features. The four job rows edit the `job_permissions` setting (ADMIN is
 * always "Tất cả"); "Đổi trạng thái job" follows "Sửa" (PD-038); the other rows are fixed rules (read-only).
 * `value` null = the matrix cannot be read here (only a production ADMIN reads the settings).
 */
export const RetouchMatrix = ({
  value,
  saved,
  loading,
  editable,
  disabled,
  unreadableNote,
  onScope,
  rules
}: {
  value: JobPermissionMatrix | null;
  saved: JobPermissionMatrix | null;
  loading: boolean;
  editable: boolean;
  disabled: boolean;
  unreadableNote: string;
  onScope: (role: JobPermissionRole, action: JobPermissionAction, scope: JobPermissionScope) => void;
  rules: readonly RetouchRule[];
}) => {
  const span = retouchColumns.length;
  return (
    <MatrixTable
      caption="Phân quyền Photo Retouch theo vai trò"
      minWidth={`calc(9rem + ${span} * 7.25rem)`}
      head={retouchColumns.map((role) => (
        <HeadCell key={role} className="min-w-[7.25rem] sm:min-w-[8.25rem]">
          <RoleBadge role={role} />
        </HeadCell>
      ))}
    >
      <GroupRow
        title="Job & task"
        description="Không / Của mình / Tất cả. Một người nhiều vai trò dùng quyền rộng nhất."
        span={span}
      />
      {loading ? (
        jobPermissionActions.map((action) => (
          <tr key={action}>
            <RowHead label={jobRowLabels[action]} description={jobRowDescription(action)} />
            <td colSpan={span} className="border-b px-3 py-2">
              <Skeleton className="h-8 w-full rounded-md" />
            </td>
          </tr>
        ))
      ) : value === null ? (
        <tr>
          <th
            scope="row"
            className="sticky left-0 z-10 border-r border-b bg-surface px-3 py-3 text-left font-normal md:px-4"
          >
            {jobPermissionActions.map((action) => jobRowLabels[action]).join(" · ")}
          </th>
          <td colSpan={span} className="border-b px-3 py-3 text-left text-[13px] text-foreground-muted">
            <span className="flex items-center gap-2">
              <Lock className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
              {unreadableNote}
            </span>
          </td>
        </tr>
      ) : (
        <>
          {jobPermissionActions.map((action) => (
            <tr key={action}>
              <RowHead label={jobRowLabels[action]} description={jobRowDescription(action)} />
              {retouchColumns.map((role) =>
                role === "ADMIN" ? (
                  <ScopeTextCell key={role} scope="all" locked lockReason="Quản trị luôn có toàn quyền" />
                ) : editable ? (
                  <td key={role} className="border-b px-1.5 py-1 align-middle">
                    <ScopeSelect
                      label={`${jobRowLabels[action]} — ${productionRoleLabels[role]}`}
                      value={value[role][action]}
                      changed={
                        saved !== null &&
                        saved[role][action] !==
                          value[role][action]
                      }
                      disabled={disabled}
                      onChange={(scope) => onScope(role, action, scope)}
                    />
                  </td>
                ) : (
                  <ScopeTextCell
                    key={role}
                    scope={value[role][action]}
                    lockReason="Chỉ Quản trị Photo Retouch hoặc Siêu quản trị sửa được"
                  />
                )
              )}
            </tr>
          ))}
          <tr>
            <RowHead
              label={statusChangeLabel}
              description="Trạng thái job (Mới nhận, Đang làm…) đổi theo quyền Sửa: Tất cả = mọi job; Của mình = job mình có task được giao hoặc mình là leader. Không chỉnh riêng được."
              locked
            />
            {retouchColumns.map((role) => (
              <ScopeTextCell
                key={role}
                scope={role === "ADMIN" ? "all" : value[role].update}
                locked
                lockReason="Theo quyền Sửa"
              />
            ))}
          </tr>
        </>
      )}
      <GroupRow
        title="Cố định theo vai trò"
        description="Chưa chỉnh được ở đây — hiển thị đúng quy tắc đang áp dụng."
        span={span}
      />
      {rules.map((rule) => (
        <tr key={rule.id}>
          <RowHead label={rule.label} description={rule.description} locked />
          {retouchColumns.map((role: ProductionRole) => (
            <MarkCell
              key={role}
              value={rule.cells[role]}
              label={`${rule.label} — ${productionRoleLabels[role]}`}
            />
          ))}
        </tr>
      ))}
    </MatrixTable>
  );
};

const scopeDotClass: Record<JobPermissionScope, string> = {
  none: "bg-foreground-subtle",
  own: "bg-brand",
  all: "bg-success"
};

const ScopeDot = ({ scope }: { scope: JobPermissionScope }) => (
  <span
    aria-hidden="true"
    className={cn("inline-block size-2 shrink-0 rounded-full", scopeDotClass[scope])}
  />
);

/** A read-only scope (ADMIN, the status-change row, or a viewer who cannot edit). */
const ScopeTextCell = ({
  scope,
  locked = false,
  lockReason
}: {
  scope: JobPermissionScope;
  locked?: boolean;
  lockReason: string;
}) => (
  <td className="border-b px-1.5 py-1 align-middle">
    <span
      title={lockReason}
      className="flex h-10 items-center justify-center gap-1.5 text-[13px] text-foreground-muted"
    >
      <ScopeDot scope={scope} />
      {jobScopeLabels[scope]}
      {locked ? (
        <Lock className="size-3 shrink-0 text-foreground-subtle" aria-label={fixedRuleHint} />
      ) : null}
    </span>
  </td>
);

const ScopeSelect = ({
  label,
  value,
  changed,
  disabled,
  onChange
}: {
  label: string;
  value: JobPermissionScope;
  changed: boolean;
  disabled: boolean;
  onChange: (scope: JobPermissionScope) => void;
}) => (
  <Select
    items={jobScopeItems}
    value={value}
    disabled={disabled}
    onValueChange={(next: JobPermissionScope | null) => {
      if (next) onChange(next);
    }}
  >
    <SelectTrigger
      aria-label={label}
      data-changed={changed || undefined}
      className={cn(
        "w-full text-[13px]",
        changed && "border-brand/60 bg-brand-soft/60 dark:bg-brand-soft/60"
      )}
    >
      <SelectValue>
        <ScopeDot scope={value} />
        <span className="truncate">{jobScopeLabels[value]}</span>
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      {jobScopeItems.map((item) => (
        <SelectItem key={item.value} value={item.value}>
          <ScopeDot scope={item.value} />
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
