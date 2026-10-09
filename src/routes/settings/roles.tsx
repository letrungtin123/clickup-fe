import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { Lock, Plus, Save, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { roleLabel } from "@/components/layout/role-label";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/shared/states";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAdminPermissions, useAdminRoles, useRoleMutations } from "@/features/admin/api";
import { P } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks";
import { getErrorMessage } from "@/lib/api/errors";
import type { AdminPermission, AdminRole } from "@/lib/api/schemas";

const moduleLabels: Record<string, string> = {
  project: "Dự án",
  list: "Danh sách",
  task: "Công việc",
  status: "Trạng thái",
  channel: "Kênh",
  knowledge: "Tri thức",
  role: "Vai trò",
  member: "Thành viên"
};

const permissionLabels: Record<string, string> = {
  "project.view": "Xem dự án",
  "project.create": "Tạo dự án",
  "project.update": "Cập nhật dự án",
  "project.delete": "Lưu trữ dự án",
  "project.manage_members": "Quản lý thành viên dự án",
  "list.view": "Xem danh sách",
  "list.create": "Tạo danh sách",
  "list.update": "Cập nhật danh sách",
  "list.delete": "Lưu trữ danh sách",
  "list.manage_status": "Quản lý trạng thái danh sách",
  "task.view": "Xem công việc",
  "task.create": "Tạo công việc",
  "task.update": "Cập nhật công việc",
  "task.delete": "Xóa công việc",
  "task.assign": "Giao việc",
  "task.comment": "Bình luận công việc",
  "status.view": "Xem trạng thái",
  "status.create": "Tạo trạng thái",
  "status.update": "Cập nhật trạng thái",
  "status.delete": "Xóa trạng thái",
  "channel.view": "Xem kênh",
  "channel.create": "Tạo kênh",
  "channel.update": "Cập nhật kênh",
  "channel.delete": "Xóa kênh",
  "channel.manage_members": "Quản lý thành viên kênh",
  "knowledge.view": "Xem tri thức",
  "knowledge.create": "Tạo kho tri thức",
  "knowledge.update": "Cập nhật tri thức",
  "knowledge.delete": "Xóa tri thức",
  "knowledge.manage_members": "Quản lý thành viên tri thức",
  "role.view": "Xem vai trò",
  "role.create": "Tạo vai trò",
  "role.update": "Cập nhật vai trò",
  "role.delete": "Xóa vai trò",
  "role.assign_permission": "Gán quyền cho vai trò",
  "member.view": "Xem thành viên tổ chức",
  "member.manage": "Quản lý thành viên tổ chức"
};

const permissionLabel = (permission: AdminPermission) =>
  permissionLabels[permission.key] ?? permission.description;

export const RolesSettingsRoute = () => {
  const { can } = usePermissions();
  const canView = can(P.RoleView) || can(P.MemberManage);
  const roles = useAdminRoles(canView);
  const permissions = useAdminPermissions(can(P.RoleView));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const items = roles.data?.items ?? [];
  const selected = items.find((role) => role.id === selectedId) ?? items[0] ?? null;

  if (!canView) {
    return <EmptyState icon={ShieldAlert} title="Bạn không có quyền xem vai trò" />;
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-6 md:grid-cols-[16rem_minmax(0,1fr)] md:px-8">
      <section aria-label="Danh sách vai trò" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Vai trò</h2>
          {can(P.RoleCreate) ? (
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus />
              Vai trò mới
            </Button>
          ) : null}
        </div>
        {roles.isPending ? (
          <SkeletonRows rows={4} className="py-2" />
        ) : roles.isError ? (
          <ErrorState size="sm" error={roles.error} onRetry={() => void roles.refetch()} />
        ) : (
          <ul role="listbox" aria-label="Vai trò" className="flex flex-col gap-0.5">
            {items.map((role) => {
              const active = selected?.id === role.id;
              return (
                <li key={role.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(role.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring",
                      active && "bg-brand-soft hover:bg-brand-soft"
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          "truncate text-[13px]",
                          active ? "font-medium text-brand-text" : "text-foreground"
                        )}
                      >
                        {roleLabel(role)}
                      </span>
                      <span className="truncate font-mono text-[11px] text-foreground-subtle">
                        {role.key}
                      </span>
                    </span>
                    {role.isSystem ? (
                      <Lock
                        className="size-3 shrink-0 text-foreground-subtle"
                        aria-label="Vai trò hệ thống"
                      />
                    ) : (
                      <span className="text-[11px] text-foreground-muted">
                        {role.permissions.length}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Quyền của vai trò" className="min-w-0">
        {selected ? (
          <RolePermissions
            key={`${selected.id}:${selected.updatedAt}`}
            role={selected}
            permissions={permissions.data?.items ?? []}
            loading={permissions.isPending && can(P.RoleView)}
            onArchived={() => setSelectedId(null)}
          />
        ) : null}
      </section>

      <CreateRoleDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(role) => setSelectedId(role.id)}
      />
    </div>
  );
};

const RolePermissions = ({
  role,
  permissions,
  loading,
  onArchived
}: {
  role: AdminRole;
  permissions: AdminPermission[];
  loading: boolean;
  onArchived: () => void;
}) => {
  const { can } = usePermissions();
  const mutations = useRoleMutations();
  const [draft, setDraft] = useState<ReadonlySet<string>>(() => new Set(role.permissions));
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Without role.view the catalog is unreadable: show the role's own keys, read-only.
  const catalog: AdminPermission[] =
    permissions.length > 0
      ? permissions
      : role.permissions.map((key) => ({
          key,
          module: key.split(".")[0] ?? key,
          description: key
        }));
  const editable = can(P.RoleAssignPermission) && !role.isSystem && permissions.length > 0;
  const dirty =
    draft.size !== role.permissions.length || role.permissions.some((key) => !draft.has(key));

  const groups = useMemo(() => {
    const map = new Map<string, AdminPermission[]>();
    for (const permission of catalog) {
      const entries = map.get(permission.module) ?? [];
      entries.push(permission);
      map.set(permission.module, entries);
    }
    return [...map.entries()];
  }, [catalog]);

  const toggle = (key: string, checked: boolean) =>
    setDraft((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <div className="rounded-xl border bg-surface shadow-xs">
      <div className="flex flex-wrap items-start gap-3 border-b px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-foreground-muted" aria-hidden="true" />
            {roleLabel(role)}
          </h2>
          <p className="text-[13px] text-foreground-muted">
            {role.isSystem
              ? "Vai trò hệ thống được bảo vệ, không chỉnh quyền trên giao diện."
              : (role.description ?? `${role.permissions.length} quyền`)}
          </p>
        </div>
        {can(P.RoleDelete) && !role.isSystem ? (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 />
            Xóa
          </Button>
        ) : null}
        {editable ? (
          <Button
            size="sm"
            disabled={!dirty || mutations.setPermissions.isPending}
            onClick={() =>
              mutations.setPermissions.mutate({ roleId: role.id, permissions: [...draft] })
            }
          >
            {mutations.setPermissions.isPending ? <Spinner /> : <Save />}
            Lưu quyền
          </Button>
        ) : null}
      </div>
      <div className="px-5 py-4">
        {loading ? (
          <SkeletonRows rows={8} />
        ) : catalog.length === 0 ? (
          <p className="text-[13px] text-foreground-muted">Vai trò chưa có quyền nào.</p>
        ) : (
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {groups.map(([module, entries]) => (
              <fieldset key={module} className="flex flex-col gap-1.5">
                <legend className="mb-1 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
                  {moduleLabels[module] ?? module}
                </legend>
                {entries.map((permission) => (
                  <label
                    key={permission.key}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-1.5 py-1 text-[13px]",
                      editable ? "cursor-pointer hover:bg-surface-hover" : "cursor-default"
                    )}
                    title={permission.description}
                  >
                    <Checkbox
                      checked={draft.has(permission.key)}
                      disabled={!editable}
                      onCheckedChange={(checked) => toggle(permission.key, checked)}
                    />
                    {permissionLabel(permission)}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa vai trò “{roleLabel(role)}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Chỉ xóa được vai trò không còn được gán cho thành viên nào.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutations.archive.isPending}>Hủy</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={mutations.archive.isPending}
              onClick={() =>
                mutations.archive.mutate(role.id, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    onArchived();
                  }
                })
              }
            >
              {mutations.archive.isPending ? <Spinner /> : <Trash2 />}
              Xóa vai trò
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const roleSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên vai trò.").max(120),
  key: z
    .string()
    .trim()
    .regex(
      /^[a-z][a-z0-9_]{1,78}$/,
      "Mã gồm chữ thường, số hoặc dấu gạch dưới, bắt đầu bằng chữ cái."
    ),
  description: z.string().trim().max(1000)
});
type RoleValues = z.infer<typeof roleSchema>;

const toRoleKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 79);

const CreateRoleDialog = ({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (role: AdminRole) => void;
}) => {
  const ids = useId();
  const mutations = useRoleMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState, reset, setValue, getFieldState } = useForm<RoleValues>(
    {
      resolver: zodResolver(roleSchema),
      defaultValues: { name: "", key: "", description: "" }
    }
  );

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setFormError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) =>
            void handleSubmit((values) =>
              mutations.create.mutate(
                {
                  name: values.name,
                  key: values.key,
                  description: values.description || null,
                  permissions: []
                },
                {
                  onSuccess: (role) => {
                    close(false);
                    onCreated(role);
                  },
                  onError: (error) =>
                    setFormError(getErrorMessage(error, "Không tạo được vai trò."))
                }
              )
            )(event)
          }
        >
          <DialogHeader>
            <DialogTitle>Vai trò mới</DialogTitle>
            <DialogDescription>Tạo xong, chọn quyền cho vai trò ở bảng bên phải.</DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(formState.errors.name)}>
            <FieldLabel htmlFor={`${ids}-name`}>Tên vai trò</FieldLabel>
            <Input
              id={`${ids}-name`}
              autoFocus
              aria-invalid={Boolean(formState.errors.name)}
              {...register("name", {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  if (!getFieldState("key").isDirty) setValue("key", toRoleKey(event.target.value));
                }
              })}
            />
            <FieldError errors={[formState.errors.name]} />
          </Field>
          <Field data-invalid={Boolean(formState.errors.key)}>
            <FieldLabel htmlFor={`${ids}-key`}>Mã vai trò</FieldLabel>
            <Input
              id={`${ids}-key`}
              className="font-mono"
              aria-invalid={Boolean(formState.errors.key)}
              {...register("key", {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                  setValue("key", toRoleKey(event.target.value), { shouldDirty: true })
              })}
            />
            <FieldDescription className="text-xs">Không đổi được sau khi tạo.</FieldDescription>
            <FieldError errors={[formState.errors.key]} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-description`}>
              Mô tả <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
            </FieldLabel>
            <Input id={`${ids}-description`} {...register("description")} />
          </Field>
          {formError ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={mutations.create.isPending}>
              {mutations.create.isPending ? <Spinner /> : <Plus />}
              Tạo vai trò
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
