import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Building2,
  Check,
  Copy,
  Ellipsis,
  KeyRound,
  Search,
  ShieldAlert,
  UserPlus,
  Users
} from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { roleLabel } from "@/components/layout/role-label";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { Department } from "@/contracts/departments";
import { useAdminMembers, useAdminRoles, useMemberMutations } from "@/features/admin/api";
import { adminErrorMessage } from "@/features/admin/errors";
import { P } from "@/features/auth/permissions";
import { usePermissions, useSessionContext } from "@/features/auth/hooks";
import {
  DepartmentCell,
  DepartmentFields,
  DepartmentFilterSelect,
  EditDepartmentsDialog,
  type DepartmentEditTarget
} from "@/features/departments-admin/department-fields";
import {
  departmentErrorField,
  toDepartmentPayload,
  validateDepartmentDraft,
  type DepartmentDraft,
  type DepartmentErrors
} from "@/features/departments-admin/department-form";
import { useDepartmentLocks } from "@/features/departments-admin/use-department-locks";
import { getErrorMessage } from "@/lib/api/errors";
import type { AdminMember, AdminRole } from "@/lib/api/schemas";

const statusLabels: Record<AdminMember["status"], string> = {
  invited: "Đã mời",
  active: "Đang hoạt động",
  disabled: "Đã vô hiệu"
};

const isSuperadmin = (member: AdminMember) => member.role.key === "superadmin";

/** Desktop columns: member · departments · role · status · joined · actions. */
const columns =
  "md:grid-cols-[minmax(0,2fr)_minmax(8.5rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_7rem_2.5rem]";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

export const MembersSettingsRoute = () => {
  const { can } = usePermissions();
  const canView = can(P.MemberView);
  const canManage = can(P.MemberManage);
  const [department, setDepartment] = useState<Department | null>(null);
  // `?department=` filters server-side (superadmins belong to every department).
  const members = useAdminMembers(canView, department);
  const mutations = useMemberMutations();
  const locks = useDepartmentLocks({ retouchNeedsProductionAdmin: true });
  const [editing, setEditing] = useState<{
    membershipId: string;
    target: DepartmentEditTarget;
  } | null>(null);
  // Roles only feed the role pickers, which need member.manage — GET /roles is refused otherwise (WK-62).
  const roles = useAdminRoles(canView && canManage);
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ name: string; password: string } | null>(null);

  const filtered = useMemo(() => {
    const items = members.data?.items ?? [];
    const q = normalize(term.trim());
    return q
      ? items.filter((member) =>
          normalize(`${member.user.displayName} ${member.user.email ?? ""}`).includes(q)
        )
      : items;
  }, [members.data, term]);

  if (!canView) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Bạn không có quyền xem thành viên"
        description="Liên hệ quản trị viên nếu bạn cần quyền này."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground-subtle"
            aria-hidden="true"
          />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Tìm theo tên hoặc email"
            aria-label="Tìm thành viên"
            className="pl-8"
          />
        </div>
        <DepartmentFilterSelect
          value={department}
          onChange={setDepartment}
          className="min-w-0 flex-1 basis-36 sm:w-44 sm:flex-none sm:basis-auto"
        />
        <span className="text-xs text-foreground-muted">
          {members.data ? `${filtered.length}/${members.data.items.length} thành viên` : null}
        </span>
        {canManage ? (
          <Button className="ml-auto" onClick={() => setCreating(true)}>
            <UserPlus />
            Thêm thành viên
          </Button>
        ) : null}
      </div>

      <div
        aria-busy={members.isPlaceholderData || undefined}
        className={cn(
          "rounded-xl border bg-surface shadow-xs transition-opacity duration-150",
          members.isPlaceholderData && "opacity-60"
        )}
      >
        <div
          className={cn(
            "hidden gap-4 border-b px-4 py-2.5 text-xs font-medium text-foreground-muted md:grid",
            columns
          )}
        >
          <span>Thành viên</span>
          <span>Phòng ban</span>
          <span>Vai trò</span>
          <span>Trạng thái</span>
          <span>Tham gia</span>
          <span className="sr-only">Thao tác</span>
        </div>
        {members.isPending ? (
          <SkeletonRows rows={5} className="p-4" />
        ) : members.isError ? (
          <ErrorState size="sm" error={members.error} onRetry={() => void members.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Users}
            title="Không có thành viên phù hợp"
            description={
              department
                ? "Thử từ khóa khác hoặc bỏ lọc phòng ban."
                : term
                  ? "Thử từ khóa khác."
                  : undefined
            }
          />
        ) : (
          <ul className="divide-y">
            {filtered.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                roles={roles.data?.items ?? []}
                canManage={canManage}
                onSecret={(password) => setSecret({ name: member.user.displayName, password })}
                onEditDepartments={() =>
                  setEditing({
                    membershipId: member.id,
                    target: {
                      id: member.id,
                      name: member.user.displayName,
                      departments: member.departments
                    }
                  })
                }
              />
            ))}
          </ul>
        )}
      </div>

      {canManage ? (
        <CreateMemberDialog
          open={creating}
          onOpenChange={setCreating}
          roles={roles.data?.items ?? []}
          onCreated={(name, password) => setSecret({ name, password })}
        />
      ) : null}
      <TemporaryPasswordDialog secret={secret} onClose={() => setSecret(null)} />
      {canManage ? (
        <EditDepartmentsDialog
          target={editing?.target ?? null}
          locks={locks}
          describeError={(error) => adminErrorMessage(error, "Không lưu được phòng ban.")}
          onClose={() => setEditing(null)}
          onSave={(change) =>
            editing
              ? mutations.setDepartments.mutateAsync({
                  membershipId: editing.membershipId,
                  input: {
                    departments: change.departments,
                    ...(change.roles ? { productionRoles: change.roles } : {})
                  }
                })
              : Promise.resolve()
          }
        />
      ) : null}
    </div>
  );
};

const MemberRow = ({
  member,
  roles,
  canManage,
  onSecret,
  onEditDepartments
}: {
  member: AdminMember;
  roles: AdminRole[];
  canManage: boolean;
  onSecret: (password: string) => void;
  onEditDepartments: () => void;
}) => {
  const session = useSessionContext();
  const mutations = useMemberMutations();
  const [confirmReset, setConfirmReset] = useState(false);
  const isSelf = member.user.id === session.user.id;
  const full = session.hasFullOrganizationAuthority;
  // Mirrors the API escalation guards: only superadmins touch superadmin accounts or grant that role.
  const editable = canManage && !isSelf && (full || member.role.key !== "superadmin");
  // A superadmin implicitly belongs to every department ("Tất cả"): nothing to edit.
  const superadmin = isSuperadmin(member);
  const departmentsEditable = editable && !superadmin;
  const roleItems = roles
    .filter((role) => full || role.key !== "superadmin")
    .map((role) => ({ value: role.id, label: roleLabel(role) }));

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:gap-x-4",
        columns
      )}
    >
      <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
        <UserAvatar user={member.user} size="md" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium">
            {member.user.displayName}
            {isSelf ? <span className="font-normal text-foreground-muted"> (bạn)</span> : null}
          </span>
          <span className="truncate text-xs text-foreground-muted">{member.user.email ?? "—"}</span>
        </div>
      </div>

      {/* Phones: a row of its own under the name. */}
      <div className="col-span-3 flex min-w-0 md:col-span-1">
        <DepartmentCell
          departments={member.departments}
          superadmin={superadmin}
          name={member.user.displayName}
          onEdit={departmentsEditable ? onEditDepartments : undefined}
          className="max-md:w-auto max-md:min-w-0"
        />
      </div>

      {editable && roles.length > 0 ? (
        <Select
          items={roleItems}
          value={member.role.id}
          onValueChange={(roleId: string | null) => {
            if (roleId && roleId !== member.role.id)
              mutations.update.mutate({ membershipId: member.id, input: { roleId } });
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full"
            aria-label={`Vai trò của ${member.user.displayName}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roleItems.map((role) => (
              <SelectItem key={role.value} value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-[13px]">{roleLabel(member.role)}</span>
      )}

      {editable && member.status !== "invited" ? (
        <Select
          items={[
            { value: "active", label: statusLabels.active },
            { value: "disabled", label: statusLabels.disabled }
          ]}
          value={member.status}
          onValueChange={(status: "active" | "disabled" | null) => {
            if (status && status !== member.status)
              mutations.update.mutate({ membershipId: member.id, input: { status } });
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full max-md:col-span-2"
            aria-label={`Trạng thái của ${member.user.displayName}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{statusLabels.active}</SelectItem>
            <SelectItem value="disabled">{statusLabels.disabled}</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[13px] max-md:col-span-2">
          <span
            aria-hidden="true"
            className={
              member.status === "active"
                ? "size-1.5 rounded-full bg-success"
                : member.status === "invited"
                  ? "size-1.5 rounded-full bg-warning"
                  : "size-1.5 rounded-full bg-foreground-subtle"
            }
          />
          {statusLabels[member.status]}
        </span>
      )}

      <span className="hidden text-xs text-foreground-muted md:block">
        {member.joinedAt ? format(new Date(member.joinedAt), "d MMM yyyy", { locale: vi }) : "—"}
      </span>

      {/* Phones: the "…" menu sits on the identity row; role + status share the second row. */}
      <div className="col-start-3 row-start-1 flex justify-end md:col-start-auto md:row-start-auto">
        {editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Tùy chọn cho ${member.user.displayName}`}
                />
              }
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {departmentsEditable ? (
                <DropdownMenuItem onClick={onEditDepartments}>
                  <Building2 />
                  Đổi phòng ban
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => setConfirmReset(true)}>
                <KeyRound />
                Đặt lại mật khẩu
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đặt lại mật khẩu cho {member.user.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Mọi phiên đăng nhập của người này sẽ bị thu hồi. Bạn sẽ nhận một mật khẩu tạm thời để
              gửi cho họ.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutations.resetPassword.isPending}>Hủy</AlertDialogCancel>
            <Button
              disabled={mutations.resetPassword.isPending}
              onClick={() =>
                mutations.resetPassword.mutate(member.id, {
                  onSuccess: (result) => {
                    setConfirmReset(false);
                    onSecret(result.temporaryPassword);
                  },
                  onError: (error) =>
                    toast.error(getErrorMessage(error, "Không đặt lại được mật khẩu."))
                })
              }
            >
              {mutations.resetPassword.isPending ? <Spinner /> : <KeyRound />}
              Đặt lại
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
};

const createSchema = z.object({
  displayName: z.string().trim().min(1, "Nhập họ tên.").max(160),
  email: z.string().trim().toLowerCase().email("Email chưa đúng định dạng.").max(254),
  roleId: z.string().uuid("Chọn vai trò."),
  jobTitle: z.string().trim().max(120)
});
type CreateValues = z.infer<typeof createSchema>;

/** No department pre-selected (a conscious choice); "Nhân viên" waits in case Photo Retouch is ticked. */
const emptyDepartmentDraft: DepartmentDraft = { departments: [], roles: ["STAFF"] };

const CreateMemberDialog = ({
  open,
  onOpenChange,
  roles,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: AdminRole[];
  onCreated: (name: string, password: string) => void;
}) => {
  const ids = useId();
  const mutations = useMemberMutations();
  const locks = useDepartmentLocks({ retouchNeedsProductionAdmin: true });
  const [formError, setFormError] = useState<string | null>(null);
  // Departments + Photo Retouch roles: the same fields (and rules) as the production users admin.
  const [departments, setDepartments] = useState<DepartmentDraft>(emptyDepartmentDraft);
  const [departmentErrors, setDepartmentErrors] = useState<DepartmentErrors>({});
  const assignable = roles.filter((role) => role.key !== "superadmin");
  const defaultRole = assignable.find((role) => role.key === "member") ?? assignable[0];
  const { register, handleSubmit, control, formState, reset } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    values: { displayName: "", email: "", roleId: defaultRole?.id ?? "", jobTitle: "" },
    resetOptions: { keepDirtyValues: true }
  });

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setFormError(null);
      setDepartments(emptyDepartmentDraft);
      setDepartmentErrors({});
    }
    onOpenChange(next);
  };

  const focusDepartmentField = (field: keyof DepartmentErrors) =>
    document
      .getElementById(`${ids}-${field}`)
      ?.querySelector<HTMLElement>("button:not([aria-disabled])")
      ?.focus();

  const submitValues = handleSubmit((values) => {
    // The other fields are valid here: send the focus to the department problem.
    const problems = validateDepartmentDraft(departments, { locks });
    if (problems.departments || problems.roles) {
      focusDepartmentField(problems.departments ? "departments" : "roles");
      return;
    }
    const payload = toDepartmentPayload(departments);
    mutations.create.mutate(
      {
        displayName: values.displayName,
        email: values.email,
        roleId: values.roleId,
        jobTitle: values.jobTitle || null,
        departments: payload.departments,
        ...(payload.roles.length > 0 ? { productionRoles: payload.roles } : {})
      },
      {
        onSuccess: (result) => {
          close(false);
          onCreated(result.member.user.displayName, result.temporaryPassword);
        },
        onError: (error) => {
          const message = adminErrorMessage(error, "Không tạo được tài khoản.");
          const field = departmentErrorField(error);
          if (field) {
            setDepartmentErrors({ [field]: message });
            focusDepartmentField(field);
          } else setFormError(message);
        }
      }
    );
  });

  // Department problems show together with the other fields' ones.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    setDepartmentErrors(validateDepartmentDraft(departments, { locks }));
    void submitValues(event);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:overflow-y-auto">
        <form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Thêm thành viên</DialogTitle>
            <DialogDescription>
              Hệ thống tạo mật khẩu tạm thời; người dùng phải đổi ở lần đăng nhập đầu tiên.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(formState.errors.displayName)}>
            <FieldLabel htmlFor={`${ids}-name`}>Họ tên</FieldLabel>
            <Input
              id={`${ids}-name`}
              autoFocus
              aria-invalid={Boolean(formState.errors.displayName)}
              {...register("displayName")}
            />
            <FieldError errors={[formState.errors.displayName]} />
          </Field>
          <Field data-invalid={Boolean(formState.errors.email)}>
            <FieldLabel htmlFor={`${ids}-email`}>Email công việc</FieldLabel>
            <Input
              id={`${ids}-email`}
              type="email"
              autoComplete="off"
              aria-invalid={Boolean(formState.errors.email)}
              {...register("email")}
            />
            <FieldError errors={[formState.errors.email]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(formState.errors.roleId)}>
              <FieldLabel id={`${ids}-role`}>Vai trò</FieldLabel>
              <Controller
                control={control}
                name="roleId"
                render={({ field }) => (
                  <Select
                    items={assignable.map((role) => ({ value: role.id, label: roleLabel(role) }))}
                    value={field.value || null}
                    onValueChange={(value: string | null) => field.onChange(value ?? "")}
                  >
                    <SelectTrigger className="w-full" aria-labelledby={`${ids}-role`}>
                      <SelectValue placeholder="Chọn vai trò" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignable.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {roleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[formState.errors.roleId]} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${ids}-title`}>
                Chức danh <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
              </FieldLabel>
              <Input id={`${ids}-title`} {...register("jobTitle")} />
            </Field>
          </div>
          <DepartmentFields
            idPrefix={ids}
            value={departments}
            onChange={(next, field) => {
              setDepartments(next);
              setDepartmentErrors((current) =>
                current[field] ? { ...current, [field]: undefined } : current
              );
              setFormError(null);
            }}
            errors={departmentErrors}
            locks={locks}
          />
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
              {mutations.create.isPending ? <Spinner /> : <UserPlus />}
              Tạo tài khoản
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** Shows a one-time temporary password. It lives only in component state and is never logged. */
const TemporaryPasswordDialog = ({
  secret,
  onClose
}: {
  secret: { name: string; password: string } | null;
  onClose: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!secret) return;
    void navigator.clipboard
      ?.writeText(secret.password)
      .then(() => {
        setCopied(true);
        toast.success("Đã sao chép mật khẩu tạm thời");
      })
      .catch(() => toast.error("Không sao chép được. Hãy chép thủ công."));
  };
  return (
    <Dialog
      open={secret !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Mật khẩu tạm thời của {secret?.name}</DialogTitle>
          <DialogDescription>
            Chỉ hiển thị một lần. Gửi cho người dùng qua kênh an toàn; họ sẽ phải đổi mật khẩu khi
            đăng nhập.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2.5">
          <code className="min-w-0 flex-1 truncate font-mono text-sm tracking-wide select-all">
            {secret?.password}
          </code>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Đã chép" : "Sao chép"}
          </Button>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            Tôi đã lưu mật khẩu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
