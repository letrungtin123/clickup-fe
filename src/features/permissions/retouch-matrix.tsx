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
  type FeaturePermissionKey,
  type FeaturePermissionMatrix,
  type JobPermissionAction,
  type JobPermissionMatrix,
  type JobPermissionRole,
  type JobPermissionScope,
  type ProductionRole
} from "@/contracts/production-catalog";
import { RoleBadge } from "@/features/production/components/role-chips";
import { featureGranted } from "@/features/production/feature-permissions";
import {
  accountCreateNote,
  accountCreateScopeLabels,
  jobScopeItems,
  jobScopeLabels,
  jobScopeMeaning,
  jobScopeNotes
} from "@/features/production/job-permissions";
import { productionRoleLabels } from "@/features/production/roles";

import {
  CheckCell,
  GroupRow,
  HeadCell,
  MarkCell,
  MatrixTable,
  RowHead,
  fixedRuleHint
} from "./matrix-kit";
import { retouchColumns, type FeatureRow, type RetouchRule } from "./retouch-rules";

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

/** PD-050: the Photo Retouch permissions are edited by the organization superadmin only. */
export const retouchEditNote = "Chỉ Siêu quản trị chỉnh sửa phân quyền Photo Retouch.";

/** Why a cell cannot be changed by a reader who is not the superadmin. */
const readOnlyReason = "Chỉ Siêu quản trị sửa được";

/** Shown above the matrix to a production Admin, who reads it but no longer edits it (PD-050). */
export const RetouchReadOnlyNote = () => (
  <p className="flex items-start gap-2 border-b bg-muted/40 px-4 py-2.5 text-[13px] text-foreground-muted md:px-5">
    <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
    {retouchEditNote}
  </p>
);

/**
 * Photo Retouch view: production roles × features.
 *   - "Job & task": the four job rows edit the `job_permissions` setting (ADMIN is always "Tất cả"); "Đổi trạng thái
 *     job" follows "Sửa" (PD-038);
 *   - "Quyền theo tính năng" (PD-065): one checkbox per feature × role, the `feature_permissions` setting (ADMIN is a
 *     column like the others: e.g. "Bất thường" is Director only by default);
 *   - the rules that stay fixed (read-only): "Cấu hình Photo Retouch".
 * `editable` only for the organization superadmin (PD-050). `value` / `features` null = that part cannot be read here
 * (only a production ADMIN or the superadmin reads the settings).
 */
export const RetouchMatrix = ({
  value,
  saved,
  features,
  featuresSaved,
  loading,
  editable,
  disabled,
  unreadableNote,
  onScope,
  onFeature,
  featureRows,
  rules
}: {
  value: JobPermissionMatrix | null;
  saved: JobPermissionMatrix | null;
  features: FeaturePermissionMatrix | null;
  featuresSaved: FeaturePermissionMatrix | null;
  loading: boolean;
  editable: boolean;
  disabled: boolean;
  unreadableNote: string;
  onScope: (
    role: JobPermissionRole,
    action: JobPermissionAction,
    scope: JobPermissionScope
  ) => void;
  onFeature: (feature: FeaturePermissionKey, role: ProductionRole, granted: boolean) => void;
  featureRows: readonly FeatureRow[];
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
          <SkeletonRow
            key={action}
            label={jobRowLabels[action]}
            description={jobRowDescription(action)}
            span={span}
          />
        ))
      ) : value === null ? (
        <UnreadableRow
          label={jobPermissionActions.map((action) => jobRowLabels[action]).join(" · ")}
          note={unreadableNote}
          span={span}
        />
      ) : (
        <>
          {jobPermissionActions.map((action) => (
            <tr key={action}>
              <RowHead label={jobRowLabels[action]} description={jobRowDescription(action)} />
              {retouchColumns.map((role) =>
                role === "ADMIN" ? (
                  <ScopeTextCell
                    key={role}
                    scope="all"
                    locked
                    lockReason="Quản trị luôn có toàn quyền"
                  />
                ) : editable ? (
                  <td key={role} className="border-b px-1.5 py-1 align-middle">
                    <ScopeSelect
                      label={`${jobRowLabels[action]} — ${productionRoleLabels[role]}`}
                      value={value[role][action]}
                      changed={saved !== null && saved[role][action] !== value[role][action]}
                      disabled={disabled}
                      onChange={(scope) => onScope(role, action, scope)}
                      // PD-079: ACCOUNT's "Tạo" is Job Codes only (no "Của mình": that would be tasks).
                      accountCreate={role === "ACCOUNT" && action === "create"}
                    />
                  </td>
                ) : (
                  <ScopeTextCell
                    key={role}
                    scope={value[role][action]}
                    lockReason={
                      role === "ACCOUNT" && action === "create"
                        ? `${readOnlyReason} — ${accountCreateNote}`
                        : readOnlyReason
                    }
                    labels={
                      role === "ACCOUNT" && action === "create"
                        ? accountCreateScopeLabels
                        : undefined
                    }
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
        title="Quyền theo tính năng"
        description="Tích vai trò được dùng tính năng. Một người nhiều vai trò có quyền của mọi vai trò; Siêu quản trị luôn có mọi quyền."
        span={span}
      />
      {loading ? (
        featureRows.map((row) => (
          <SkeletonRow
            key={row.feature}
            label={row.label}
            description={row.description}
            span={span}
          />
        ))
      ) : features === null ? (
        <UnreadableRow
          label={featureRows.map((row) => row.label).join(" · ")}
          note={unreadableNote}
          span={span}
        />
      ) : (
        featureRows.map((row) => (
          <tr key={row.feature}>
            <RowHead label={row.label} description={row.description} />
            {retouchColumns.map((role) => {
              const checked = featureGranted(features, row.feature, role);
              return (
                <CheckCell
                  key={role}
                  checked={checked}
                  label={`${row.label} — ${productionRoleLabels[role]}`}
                  disabled={!editable || disabled}
                  changed={
                    featuresSaved !== null &&
                    featureGranted(featuresSaved, row.feature, role) !== checked
                  }
                  lockReason={editable ? undefined : readOnlyReason}
                  onChange={(next) => onFeature(row.feature, role, next)}
                />
              );
            })}
          </tr>
        ))
      )}
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

const SkeletonRow = ({
  label,
  description,
  span
}: {
  label: string;
  description: string;
  span: number;
}) => (
  <tr>
    <RowHead label={label} description={description} />
    <td colSpan={span} className="border-b px-3 py-2">
      <Skeleton className="h-8 w-full rounded-md" />
    </td>
  </tr>
);

/** One row standing for a whole section the viewer may not read (`label` lists what it hides). */
const UnreadableRow = ({ label, note, span }: { label: string; note: string; span: number }) => (
  <tr>
    <th
      scope="row"
      className="sticky left-0 z-10 border-r border-b bg-surface px-3 py-3 text-left font-normal md:px-4"
    >
      {label}
    </th>
    <td colSpan={span} className="border-b px-3 py-3 text-left text-[13px] text-foreground-muted">
      <span className="flex items-center gap-2">
        <Lock className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
        {note}
      </span>
    </td>
  </tr>
);

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
  lockReason,
  labels = jobScopeLabels
}: {
  scope: JobPermissionScope;
  locked?: boolean;
  lockReason: string;
  /** PD-079: the ACCOUNT "Tạo" cell names "Job Code". */
  labels?: Record<JobPermissionScope, string> | undefined;
}) => (
  <td className="border-b px-1.5 py-1 align-middle">
    <span
      title={lockReason}
      className="flex h-10 items-center justify-center gap-1.5 text-[13px] text-foreground-muted"
    >
      <ScopeDot scope={scope} />
      {labels[scope]}
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
  onChange,
  accountCreate = false
}: {
  label: string;
  value: JobPermissionScope;
  changed: boolean;
  disabled: boolean;
  onChange: (scope: JobPermissionScope) => void;
  /** PD-079: the ACCOUNT "Tạo" cell — Không / Job Code (an older "Của mình" is still shown, creating nothing). */
  accountCreate?: boolean;
}) => {
  const labels = accountCreate ? accountCreateScopeLabels : jobScopeLabels;
  const items = jobScopeItems
    .filter((item) => !accountCreate || item.value !== "own" || value === "own")
    .map((item) => ({ value: item.value, label: labels[item.value] }));
  return (
    <Select
      items={items}
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
          <span className="truncate">{labels[value]}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            <ScopeDot scope={item.value} />
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
