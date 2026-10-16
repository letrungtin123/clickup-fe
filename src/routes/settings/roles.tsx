import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { GitBranch, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { roleLabel } from "@/components/layout/role-label";
import { Link } from "@/components/shared/router-link";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { departmentLabels, type Department } from "@/contracts/departments";
import {
  defaultFeaturePermissions,
  defaultJobPermissions,
  type FeaturePermissionKey,
  type FeaturePermissionMatrix,
  type JobPermissionAction,
  type JobPermissionMatrix,
  type JobPermissionRole,
  type JobPermissionScope,
  type ProductionRole
} from "@/contracts/production-catalog";
import { adminApi, useAdminPermissions, useAdminRoles } from "@/features/admin/api";
import { adminErrorMessage } from "@/features/admin/errors";
import { P } from "@/features/auth/permissions";
import { usePermissions, useSessionContext } from "@/features/auth/hooks";
import { useDepartment, useDepartmentFade } from "@/features/departments/hooks";
import { departmentIcons, departmentTones } from "@/features/departments/meta";
import { MatrixCard, RowHead, SaveBar } from "@/features/permissions/matrix-kit";
import {
  commonGroups,
  countChanges,
  departmentNote,
  editablePermissionKeys,
  productionGroups,
  sortOrgRoles,
  withHiddenKeys,
  type OrgPermissionGroup
} from "@/features/permissions/org-catalog";
import { OrgMatrix, type OrgCellState } from "@/features/permissions/org-matrix";
import { RetouchMatrix, RetouchReadOnlyNote } from "@/features/permissions/retouch-matrix";
import { retouchFeatureRows, retouchFixedRules } from "@/features/permissions/retouch-rules";
import {
  CreateRoleDialog,
  DeleteRoleDialog,
  RenameRoleDialog
} from "@/features/permissions/role-dialogs";
import { useCanEditProductionConfig } from "@/features/production/config-access";
import { productionErrorMessage } from "@/features/production/errors";
import {
  featureChanges,
  sameFeaturePermissions,
  withFeatureRole
} from "@/features/production/feature-permissions";
import {
  useProductionAccess,
  useProductionMe,
  useProductionSettings,
  useUpdateSettings
} from "@/features/production/hooks";
import {
  jobScopeChanges,
  sameJobPermissions,
  withJobScope
} from "@/features/production/job-permissions";
import type { AdminRole } from "@/lib/api/schemas";
import { toneClass } from "@/lib/colors";
import { qk } from "@/lib/query-keys";

/**
 * Cài đặt → Vai trò & phân quyền (PD-042). One page that follows the department chosen in the header (PD-041):
 *   Photo Retouch — production roles × features: the job permission matrix (PD-036) and "Quyền theo tính năng"
 *                   (PD-065), both read by a production ADMIN and edited by the superadmin only (PD-050), then the
 *                   rules still fixed by role (read-only, retouch-rules.ts);
 *   Production    — organization roles × project / list / task permissions;
 *   both          — "Chung": channels, knowledge, members, roles (+ where departments are set).
 * Changes are drafted (changed cells tinted) and saved together from the sticky bar. Access: role.view or
 * member.manage (as before); organization role edits need role.assign_permission. The API checks everything again.
 */
export const RolesSettingsRoute = () => {
  const { can } = usePermissions();
  if (!(can(P.RoleView) || can(P.MemberManage))) {
    return <EmptyState icon={ShieldAlert} title="Bạn không có quyền xem vai trò" />;
  }
  return <PermissionsPage />;
};

type RoleDialog = { kind: "create" } | { kind: "rename" | "delete"; role: AdminRole } | null;

const PermissionsPage = () => {
  const session = useSessionContext();
  const { can, hasFullAuthority } = usePermissions();
  const { current, canSwitch } = useDepartment();
  const fade = useDepartmentFade<HTMLDivElement>();
  const view: Department = current ?? "PRODUCTION";
  const queryClient = useQueryClient();

  // --- Organization roles ------------------------------------------------------------------------
  const roles = useAdminRoles();
  const catalog = useAdminPermissions(can(P.RoleView));
  const sortedRoles = useMemo(() => sortOrgRoles(roles.data?.items ?? []), [roles.data]);
  const knownKeys = useMemo(
    () => (catalog.data ? new Set(catalog.data.items.map((permission) => permission.key)) : null),
    [catalog.data]
  );
  const [roleDrafts, setRoleDrafts] = useState<Record<string, ReadonlySet<string>>>({});
  const [dialog, setDialog] = useState<RoleDialog>(null);
  const granted = useMemo(() => new Set(session.role.permissions), [session.role.permissions]);
  const canAssign = can(P.RoleAssignPermission) && catalog.isSuccess;

  const roleLock = (role: AdminRole): string | null => {
    if (role.key === "superadmin") return "Siêu quản trị luôn có mọi quyền";
    if (role.isSystem) return "Vai trò hệ thống, không chỉnh trên giao diện";
    if (!canAssign) return "Bạn không có quyền gán quyền cho vai trò";
    if (hasFullAuthority) return null;
    if (role.id === session.role.id) return "Không sửa được quyền của vai trò của chính bạn";
    if (role.permissions.some((key) => !granted.has(key))) {
      return "Vai trò này có quyền mà bạn không có";
    }
    return null;
  };

  const orgCell = (role: AdminRole, key: string): OrgCellState => {
    const draft = roleDrafts[role.id];
    const saved = role.key === "superadmin" || role.permissions.includes(key);
    const checked = draft ? draft.has(key) : saved;
    const lock =
      roleLock(role) ??
      (!hasFullAuthority && !granted.has(key) ? "Bạn không có quyền này nên không gán được" : null);
    return { checked, changed: draft ? checked !== saved : false, lockReason: lock };
  };

  const toggleOrg = (role: AdminRole, key: string, checked: boolean) =>
    setRoleDrafts((drafts) => {
      const base =
        drafts[role.id] ??
        new Set(role.permissions.filter((item) => editablePermissionKeys.has(item)));
      const next = new Set(base);
      if (checked) next.add(key);
      else next.delete(key);
      const copy = { ...drafts };
      if (countChanges(role.permissions, next) === 0) delete copy[role.id];
      else copy[role.id] = next;
      return copy;
    });

  const shownGroups = (groups: readonly OrgPermissionGroup[]) =>
    knownKeys
      ? groups
          .map((group) => ({ ...group, rows: group.rows.filter((row) => knownKeys.has(row.key)) }))
          .filter((group) => group.rows.length > 0)
      : groups;

  const roleMenu = {
    onRename: can(P.RoleUpdate)
      ? (role: AdminRole) => setDialog({ kind: "rename", role })
      : undefined,
    onDelete: can(P.RoleDelete)
      ? (role: AdminRole) => setDialog({ kind: "delete", role })
      : undefined
  };
  const newRoleButton = can(P.RoleCreate) ? (
    <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "create" })}>
      <Plus />
      Vai trò mới
    </Button>
  ) : null;

  // --- Photo Retouch job & feature permissions ---------------------------------------------------
  const production = useProductionAccess();
  const me = useProductionMe();
  // A production ADMIN (or the superadmin) reads the matrix; only the superadmin edits it (PD-050).
  const retouchAdmin = production.isAdmin || hasFullAuthority;
  const retouchEditor = useCanEditProductionConfig();
  const settings = useProductionSettings(view === "PHOTO_RETOUCH" && retouchAdmin);
  const updateSettings = useUpdateSettings();
  const jobSaved = settings.data?.jobPermissions ?? null;
  const [jobDraft, setJobDraft] = useState<JobPermissionMatrix | null>(null);
  const jobValue = jobDraft ?? jobSaved;
  const jobChangeCount = jobSaved && jobDraft ? jobScopeChanges(jobSaved, jobDraft).length : 0;

  const setScope = (
    role: JobPermissionRole,
    action: JobPermissionAction,
    scope: JobPermissionScope
  ) => {
    if (!jobValue) return;
    const next = withJobScope(jobValue, role, action, scope);
    setJobDraft(jobSaved && sameJobPermissions(next, jobSaved) ? null : next);
  };
  const resetJobs = () =>
    setJobDraft(
      jobSaved && sameJobPermissions(defaultJobPermissions, jobSaved) ? null : defaultJobPermissions
    );

  // PD-065: feature × role checkboxes, drafted like the job scopes and saved in the same PATCH.
  const featureSaved = settings.data?.featurePermissions ?? null;
  const [featureDraft, setFeatureDraft] = useState<FeaturePermissionMatrix | null>(null);
  const featureValue = featureDraft ?? featureSaved;
  const featureChangeCount =
    featureSaved && featureDraft ? featureChanges(featureSaved, featureDraft).length : 0;

  const setFeature = (feature: FeaturePermissionKey, role: ProductionRole, granted: boolean) => {
    if (!featureValue) return;
    const next = withFeatureRole(featureValue, feature, role, granted);
    setFeatureDraft(featureSaved && sameFeaturePermissions(next, featureSaved) ? null : next);
  };
  const resetFeatures = () =>
    setFeatureDraft(
      featureSaved && sameFeaturePermissions(defaultFeaturePermissions, featureSaved)
        ? null
        : defaultFeaturePermissions
    );

  const moneyPublic = me.data?.settings.moneyPublic;
  const featureRows = useMemo(() => retouchFeatureRows({ moneyPublic }), [moneyPublic]);
  const rules = useMemo(() => retouchFixedRules(), []);

  // --- Save --------------------------------------------------------------------------------------
  const draftRoles = sortedRoles.filter((role) => roleDrafts[role.id]);
  const changeCount =
    jobChangeCount +
    featureChangeCount +
    draftRoles.reduce(
      (sum, role) => sum + countChanges(role.permissions, roleDrafts[role.id] ?? new Set()),
      0
    );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    let failed = false;
    const savesJobs = jobDraft !== null && jobChangeCount > 0;
    const savesFeatures = featureDraft !== null && featureChangeCount > 0;
    if (savesJobs || savesFeatures) {
      try {
        // One PATCH for both Photo Retouch matrices (superadmin only, PD-050).
        await updateSettings.mutateAsync({
          ...(savesJobs ? { jobPermissions: jobDraft } : {}),
          ...(savesFeatures ? { featurePermissions: featureDraft } : {})
        });
        setJobDraft(null);
        setFeatureDraft(null);
      } catch (error) {
        failed = true;
        toast.error("Không lưu được phân quyền Photo Retouch", {
          description: productionErrorMessage(error)
        });
      }
    }
    const results = await Promise.allSettled(
      draftRoles.map((role) =>
        adminApi.updateRolePermissions(
          role.id,
          withHiddenKeys(role.permissions, roleDrafts[role.id] ?? new Set())
        )
      )
    );
    const savedIds = new Set<string>();
    results.forEach((result, index) => {
      const role = draftRoles[index];
      if (!role) return;
      if (result.status === "fulfilled") {
        savedIds.add(role.id);
        return;
      }
      failed = true;
      toast.error(`Không lưu được quyền của “${roleLabel(role)}”`, {
        description: adminErrorMessage(result.reason)
      });
    });
    if (savedIds.size > 0) {
      // Wait for the fresh roles before dropping the drafts, so the cells never flash back.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.admin.all() }),
        queryClient.invalidateQueries({ queryKey: qk.session() })
      ]);
      setRoleDrafts((drafts) =>
        Object.fromEntries(Object.entries(drafts).filter(([id]) => !savedIds.has(id)))
      );
    }
    setSaving(false);
    if (!failed) {
      toast.success("Đã lưu phân quyền", {
        description: "Áp dụng cho các thao tác tiếp theo của mọi người."
      });
    }
  };

  const undo = () => {
    setRoleDrafts({});
    setJobDraft(null);
    setFeatureDraft(null);
  };

  // --- Layout ------------------------------------------------------------------------------------
  const orgBody = (
    groups: readonly OrgPermissionGroup[],
    caption: string,
    footerRows?: ReactNode
  ) =>
    roles.isPending ? (
      <SkeletonRows rows={6} className="px-4 py-3" />
    ) : roles.isError ? (
      <ErrorState size="sm" error={roles.error} onRetry={() => void roles.refetch()} />
    ) : (
      <OrgMatrix
        caption={caption}
        groups={shownGroups(groups)}
        roles={sortedRoles}
        cell={orgCell}
        onToggle={toggleOrg}
        onRename={roleMenu.onRename}
        onDelete={roleMenu.onDelete}
        footerRows={footerRows}
      />
    );

  const departmentRow = (
    <tr>
      <RowHead
        label={departmentNote.label}
        description={departmentNote.description}
        locked
        lockedHint="Không phải quyền của vai trò"
      />
      <td
        colSpan={Math.max(sortedRoles.length, 1)}
        className="border-b px-3 py-2 text-left text-[13px] text-foreground-muted"
      >
        Chọn phòng ban cho từng người khi tạo / sửa ở{" "}
        {can(P.MemberView) ? (
          <Link
            to="/settings/members"
            className="font-medium text-brand-text underline-offset-2 hover:underline"
          >
            Cài đặt → Thành viên
          </Link>
        ) : (
          "Cài đặt → Thành viên"
        )}
        .
      </td>
    </tr>
  );

  const commonCard = (
    <MatrixCard
      title="Chung"
      description="Dùng chung cho cả hai phòng: theo vai trò tổ chức (gán ở Cài đặt → Thành viên)."
      actions={view === "PHOTO_RETOUCH" ? newRoleButton : null}
    >
      {orgBody(commonGroups, "Quyền chung theo vai trò tổ chức", departmentRow)}
    </MatrixCard>
  );

  return (
    <div ref={fade} className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-8">
      <DepartmentLine department={view} canSwitch={canSwitch} />

      {view === "PHOTO_RETOUCH" ? (
        <MatrixCard
          title="Photo Retouch"
          actions={
            retouchEditor && (jobValue || featureValue) ? (
              <>
                {jobValue ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving || sameJobPermissions(jobValue, defaultJobPermissions)}
                    title={
                      sameJobPermissions(jobValue, defaultJobPermissions)
                        ? "Phân quyền Job đang là mặc định"
                        : "Đưa phân quyền Job về mặc định (chưa lưu cho tới khi bấm “Lưu thay đổi”)"
                    }
                    onClick={resetJobs}
                  >
                    <RotateCcw />
                    Mặc định Job
                  </Button>
                ) : null}
                {featureValue ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      saving || sameFeaturePermissions(featureValue, defaultFeaturePermissions)
                    }
                    title={
                      sameFeaturePermissions(featureValue, defaultFeaturePermissions)
                        ? "Quyền theo tính năng đang là mặc định"
                        : "Đưa quyền theo tính năng về mặc định (chưa lưu cho tới khi bấm “Lưu thay đổi”)"
                    }
                    onClick={resetFeatures}
                  >
                    <RotateCcw />
                    Mặc định tính năng
                  </Button>
                ) : null}
              </>
            ) : null
          }
          description={
            retouchAdmin
              ? "Theo vai trò Photo Retouch (gán ở Cấu hình → Thành viên & vai trò). Dòng có ổ khóa đang cố định theo vai trò."
              : "Theo vai trò Photo Retouch. Chỉ Siêu quản trị sửa được; dòng có ổ khóa đang cố định theo vai trò."
          }
        >
          {retouchAdmin && !retouchEditor ? <RetouchReadOnlyNote /> : null}
          {settings.isError ? (
            <ErrorState size="sm" error={settings.error} onRetry={() => void settings.refetch()} />
          ) : (
            <RetouchMatrix
              value={retouchAdmin ? jobValue : null}
              saved={jobSaved}
              features={retouchAdmin ? featureValue : null}
              featuresSaved={featureSaved}
              loading={retouchAdmin && settings.isPending}
              editable={retouchEditor}
              disabled={saving}
              unreadableNote="Chỉ Quản trị Photo Retouch hoặc Siêu quản trị xem phần này; chỉ Siêu quản trị sửa."
              onScope={setScope}
              onFeature={setFeature}
              featureRows={featureRows}
              rules={rules}
            />
          )}
          <p className="flex items-start gap-2 border-t px-4 py-3 text-xs leading-relaxed text-foreground-muted md:px-5">
            <GitBranch
              className="mt-0.5 size-3.5 shrink-0 text-foreground-subtle"
              aria-hidden="true"
            />
            <span>
              Việc chuyển trạng thái task (nhận việc, gửi QC, Done…) không nằm ở đây: đặt ở{" "}
              {retouchAdmin ? (
                <Link
                  to="/production/settings/workflow"
                  className="font-medium text-brand-text underline-offset-2 hover:underline"
                >
                  Cấu hình → Trạng thái & luồng chuyển
                </Link>
              ) : (
                "Cấu hình → Trạng thái & luồng chuyển"
              )}
              .
            </span>
          </p>
        </MatrixCard>
      ) : (
        <MatrixCard
          title="Production"
          description="Dự án, danh sách và công việc theo vai trò tổ chức (gán ở Cài đặt → Thành viên)."
          actions={newRoleButton}
        >
          {orgBody(productionGroups, "Quyền Production theo vai trò tổ chức")}
        </MatrixCard>
      )}

      {commonCard}

      <SaveBar count={changeCount} saving={saving} onUndo={undo} onSave={() => void save()} />

      {dialog?.kind === "create" ? (
        <CreateRoleDialog open onOpenChange={(open) => !open && setDialog(null)} />
      ) : null}
      {dialog?.kind === "rename" ? (
        <RenameRoleDialog role={dialog.role} onOpenChange={(open) => !open && setDialog(null)} />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteRoleDialog
          role={dialog.role}
          onOpenChange={(open) => !open && setDialog(null)}
          onDeleted={(role) =>
            setRoleDrafts((drafts) =>
              Object.fromEntries(Object.entries(drafts).filter(([id]) => id !== role.id))
            )
          }
        />
      ) : null}
    </div>
  );
};

const DepartmentLine = ({
  department,
  canSwitch
}: {
  department: Department;
  canSwitch: boolean;
}) => {
  const Icon = departmentIcons[department];
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-foreground-muted">
      <span>Đang xem quyền của phòng</span>
      <span
        className={cn(
          toneClass(departmentTones[department]),
          "inline-flex items-center gap-1 rounded-full bg-(--tone-soft) px-2 py-0.5 text-xs font-medium text-(--tone-text)"
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {departmentLabels[department]}
      </span>
      {canSwitch ? <span>— đổi phòng ở thanh bên để xem phòng khác.</span> : null}
    </p>
  );
};
