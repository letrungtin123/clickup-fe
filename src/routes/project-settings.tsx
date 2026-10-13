import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Globe, Lock, Search, Trash2, UserPlus, Users } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { Link } from "@/components/shared/router-link";
import { z } from "zod";

import { PageHeader } from "@/components/shared/page-header";
import { ProjectIcon } from "@/components/shared/project-icon";
import type { ProjectIconKey } from "@/components/shared/project-icons";
import {
  ColorSwatchPicker,
  ProjectIconPicker,
  SegmentedControl
} from "@/components/shared/radio-controls";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "@/components/ui/command";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  ColorTokenSchema,
  ProjectVisibilitySchema,
  type Project,
  type ProjectAccessLevel
} from "@/contracts/work";
import { P } from "@/features/auth/permissions";
import { usePermissions, useSessionContext } from "@/features/auth/hooks";
import { useDebouncedValue } from "@/features/command/search-api";
import {
  useArchiveProject,
  useProjectAbilities,
  useProjectMemberMutations,
  useProjectMembers,
  useUpdateProject
} from "@/features/projects/hooks";
import { projectKeyPattern, sanitizeProjectKey } from "@/features/projects/project-key";
import { useDirectory } from "@/features/tasks/hooks";
import { getErrorMessage, isApiError } from "@/lib/api/errors";

import { useProjectOutlet } from "./project-context";

const accessItems: { value: ProjectAccessLevel; label: string; description: string }[] = [
  { value: "view", label: "Chỉ xem", description: "Xem công việc, không chỉnh sửa." },
  { value: "submit", label: "Thao tác", description: "Tạo và cập nhật công việc theo vai trò." },
  { value: "manage", label: "Quản lý", description: "Quản lý dự án, danh sách và thành viên." }
];
const accessLabels = Object.fromEntries(
  accessItems.map((item) => [item.value, item.label])
) as Record<ProjectAccessLevel, string>;

export const ProjectSettingsRoute = () => {
  const { project } = useProjectOutlet();
  const abilities = useProjectAbilities(project);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow={
          <Link
            to={`/p/${project.id}`}
            className="rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {project.name}
          </Link>
        }
        leading={
          <ProjectIcon color={project.color} icon={project.icon} name={project.name} size="md" />
        }
        title="Cài đặt dự án"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-8">
          <GeneralSection
            key={project.updatedAt}
            project={project}
            canUpdate={abilities.canUpdate}
          />
          <MembersSection project={project} canManage={abilities.canManageMembers} />
          {abilities.canArchive ? <DangerSection project={project} /> : null}
        </div>
      </div>
    </div>
  );
};

const Section = ({
  title,
  description,
  actions,
  children,
  tone = "default"
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) => (
  <section
    className={
      tone === "danger"
        ? "rounded-xl border border-danger/30 bg-surface shadow-xs"
        : "rounded-xl border bg-surface shadow-xs"
    }
  >
    <div className="flex flex-wrap items-start gap-3 border-b px-5 py-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="text-[13px] text-foreground-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
    <div className="px-5 py-5">{children}</div>
  </section>
);

// --- General ------------------------------------------------------------------------------------------

const generalSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên dự án.").max(160),
  key: z
    .string()
    .trim()
    .regex(projectKeyPattern, "Mã gồm 2–12 chữ in hoa hoặc số, bắt đầu bằng chữ cái."),
  description: z.string().trim().max(1000, "Mô tả tối đa 1000 ký tự."),
  visibility: ProjectVisibilitySchema,
  color: ColorTokenSchema,
  icon: z.string().nullable()
});
type GeneralValues = z.infer<typeof generalSchema>;

const GeneralSection = ({ project, canUpdate }: { project: Project; canUpdate: boolean }) => {
  const ids = useId();
  const update = useUpdateProject(project.id);
  const form = useForm<GeneralValues>({
    resolver: zodResolver(generalSchema),
    defaultValues: {
      name: project.name,
      key: project.key,
      description: project.description ?? "",
      visibility: project.visibility,
      color: project.color,
      icon: project.icon
    },
    disabled: !canUpdate
  });
  const { register, control, handleSubmit, formState, setError, setValue, reset } = form;
  const [name, color, visibility] = useWatch({ control, name: ["name", "color", "visibility"] });

  const onSubmit = handleSubmit((values) => {
    const dirty = formState.dirtyFields;
    update.mutate(
      {
        ...(dirty.name ? { name: values.name } : {}),
        ...(dirty.key ? { key: values.key } : {}),
        ...(dirty.description ? { description: values.description || null } : {}),
        ...(dirty.visibility ? { visibility: values.visibility } : {}),
        ...(dirty.color ? { color: values.color } : {}),
        ...(dirty.icon ? { icon: values.icon } : {})
      },
      {
        onSuccess: (saved) =>
          reset({
            name: saved.name,
            key: saved.key,
            description: saved.description ?? "",
            visibility: saved.visibility,
            color: saved.color,
            icon: saved.icon
          }),
        onError: (error) => {
          if (isApiError(error) && error.code === "PROJECT_KEY_EXISTS") {
            setError("key", { message: getErrorMessage(error) });
          }
        }
      }
    );
  });

  return (
    <Section
      title="Thông tin chung"
      description={
        canUpdate
          ? "Tên, mã, giao diện và quyền truy cập của dự án."
          : "Bạn đang xem ở chế độ chỉ đọc."
      }
    >
      <form noValidate className="flex flex-col gap-5" onSubmit={(event) => void onSubmit(event)}>
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field data-invalid={Boolean(formState.errors.name)}>
            <FieldLabel htmlFor={`${ids}-name`}>Tên dự án</FieldLabel>
            <Input
              id={`${ids}-name`}
              aria-invalid={Boolean(formState.errors.name)}
              {...register("name")}
            />
            <FieldError errors={[formState.errors.name]} />
          </Field>
          <Field data-invalid={Boolean(formState.errors.key)}>
            <FieldLabel htmlFor={`${ids}-key`}>Mã dự án</FieldLabel>
            <Input
              id={`${ids}-key`}
              className="font-mono tracking-wider uppercase"
              maxLength={12}
              aria-invalid={Boolean(formState.errors.key)}
              {...register("key", {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  const sanitized = sanitizeProjectKey(event.target.value);
                  if (sanitized !== event.target.value)
                    setValue("key", sanitized, { shouldDirty: true });
                }
              })}
            />
            <FieldError errors={[formState.errors.key]} />
          </Field>
        </div>
        <Field data-invalid={Boolean(formState.errors.description)}>
          <FieldLabel htmlFor={`${ids}-description`}>Mô tả</FieldLabel>
          <Textarea
            id={`${ids}-description`}
            rows={3}
            className="resize-none"
            {...register("description")}
          />
          <FieldError errors={[formState.errors.description]} />
        </Field>
        <Field>
          <FieldLabel id={`${ids}-visibility`}>Quyền truy cập</FieldLabel>
          <Controller
            control={control}
            name="visibility"
            render={({ field }) => (
              <SegmentedControl
                aria-labelledby={`${ids}-visibility`}
                value={field.value}
                onChange={field.onChange}
                disabled={!canUpdate}
                className="w-full sm:w-fit"
                options={[
                  { value: "private", label: "Riêng tư", icon: Lock },
                  { value: "public", label: "Công khai", icon: Globe }
                ]}
              />
            )}
          />
          <FieldDescription className="text-xs">
            {visibility === "private"
              ? "Chỉ thành viên dự án thấy và được giao việc."
              : "Mọi thành viên tổ chức có quyền xem dự án đều thấy và thao tác được; quản lý vẫn cần được thêm vào dự án."}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel id={`${ids}-color`}>Màu</FieldLabel>
          <Controller
            control={control}
            name="color"
            render={({ field }) => (
              <ColorSwatchPicker
                aria-labelledby={`${ids}-color`}
                value={field.value}
                onChange={(value) => canUpdate && field.onChange(value)}
              />
            )}
          />
        </Field>
        <Field>
          <FieldLabel id={`${ids}-icon`}>Biểu tượng</FieldLabel>
          <Controller
            control={control}
            name="icon"
            render={({ field }) => (
              <ProjectIconPicker
                aria-labelledby={`${ids}-icon`}
                value={(field.value as ProjectIconKey | null) ?? null}
                onChange={(value) => canUpdate && field.onChange(value)}
                color={color}
                initial={(name.trim()[0] ?? "A").toLocaleUpperCase("vi")}
              />
            )}
          />
        </Field>
        {canUpdate ? (
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={!formState.isDirty || update.isPending}
              onClick={() => reset()}
            >
              Hoàn tác
            </Button>
            <Button type="submit" disabled={!formState.isDirty || update.isPending}>
              {update.isPending ? <Spinner /> : null}
              Lưu thay đổi
            </Button>
          </div>
        ) : null}
      </form>
    </Section>
  );
};

// --- Members ------------------------------------------------------------------------------------------

const MembersSection = ({ project, canManage }: { project: Project; canManage: boolean }) => {
  const session = useSessionContext();
  const members = useProjectMembers(project.id);
  const mutations = useProjectMemberMutations(project.id);
  const { can } = usePermissions();
  const items = members.data?.items ?? [];
  const managers = items.filter((member) => member.accessLevel === "manage").length;

  return (
    <Section
      title="Thành viên"
      description={
        project.visibility === "public"
          ? "Dự án công khai: thành viên được thêm ở đây có quyền cụ thể (ví dụ Quản lý)."
          : "Dự án riêng tư: chỉ những người dưới đây thấy dự án."
      }
      actions={
        canManage && can(P.MemberView) ? (
          <AddMemberPicker
            existingIds={new Set(items.map((member) => member.user.id))}
            pending={mutations.add.isPending}
            onAdd={(userId, accessLevel) => mutations.add.mutate({ userId, accessLevel })}
          />
        ) : null
      }
    >
      {members.isPending ? (
        <SkeletonRows rows={4} />
      ) : members.isError ? (
        <ErrorState size="sm" error={members.error} onRetry={() => void members.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={Users}
          title="Chưa có thành viên"
          description="Thêm người để cộng tác trong dự án."
        />
      ) : (
        <ul className="-my-2 divide-y">
          {items.map((member) => {
            const isSelf = member.user.id === session.user.id;
            const lastManager = member.accessLevel === "manage" && managers <= 1;
            return (
              <li key={member.user.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <UserAvatar user={member.user} size="md" />
                {/* Phones: name + email keep the first line; access and remove wrap below, indented. */}
                <div className="flex min-w-0 flex-1 flex-col max-sm:basis-[calc(100%-3.5rem)]">
                  <span className="truncate text-[13px] font-medium">
                    {member.user.displayName}
                    {isSelf ? (
                      <span className="font-normal text-foreground-muted"> (bạn)</span>
                    ) : null}
                  </span>
                  <span className="truncate text-xs text-foreground-muted">
                    {member.user.email ?? "—"}
                  </span>
                </div>
                {canManage ? (
                  <>
                    <Select
                      items={accessItems}
                      value={member.accessLevel}
                      onValueChange={(value: ProjectAccessLevel | null) => {
                        if (value && value !== member.accessLevel) {
                          mutations.update.mutate({ userId: member.user.id, accessLevel: value });
                        }
                      }}
                      disabled={lastManager}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-32 max-sm:ml-11 max-sm:w-auto max-sm:flex-1"
                        aria-label={`Quyền của ${member.user.displayName}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accessItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Gỡ ${member.user.displayName} khỏi dự án`}
                      title={lastManager ? "Dự án cần ít nhất một người quản lý" : "Gỡ khỏi dự án"}
                      disabled={lastManager || mutations.remove.isPending}
                      onClick={() => mutations.remove.mutate(member.user.id)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground-muted">
                    {accessLabels[member.accessLevel]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
};

const AddMemberPicker = ({
  existingIds,
  pending,
  onAdd
}: {
  existingIds: ReadonlySet<string>;
  pending: boolean;
  onAdd: (userId: string, accessLevel: ProjectAccessLevel) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [accessLevel, setAccessLevel] = useState<ProjectAccessLevel>("submit");
  const q = useDebouncedValue(term, 200);
  const directory = useDirectory({ q }, open);
  const candidates = useMemo(
    () => (directory.data?.items ?? []).filter((user) => !existingIds.has(user.id)),
    [directory.data, existingIds]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="sm" disabled={pending} />}>
        {pending ? <Spinner /> : <UserPlus />}
        Thêm thành viên
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Tìm theo tên hoặc email…"
          />
          <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-foreground-muted">
            Quyền khi thêm
            <SegmentedControl
              aria-label="Quyền khi thêm"
              size="sm"
              value={accessLevel}
              onChange={setAccessLevel}
              options={accessItems.map((item) => ({
                value: item.value,
                label: item.label,
                description: item.description
              }))}
              className="ml-auto"
            />
          </div>
          <CommandList>
            <CommandEmpty>
              {directory.isFetching ? (
                <span className="inline-flex items-center gap-2 text-foreground-muted">
                  <Spinner className="size-3.5" /> Đang tìm…
                </span>
              ) : directory.isError ? (
                getErrorMessage(directory.error)
              ) : (
                "Không còn ai để thêm."
              )}
            </CommandEmpty>
            {candidates.length > 0 ? (
              <CommandGroup>
                {candidates.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={user.id}
                    onSelect={() => {
                      onAdd(user.id, accessLevel);
                      setOpen(false);
                      setTerm("");
                    }}
                  >
                    <UserAvatar user={user} size="xs" />
                    <span className="truncate">{user.displayName}</span>
                    <CommandShortcut className="truncate tracking-normal text-foreground-muted">
                      {user.email}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          <p className="flex items-center gap-1.5 border-t px-3 py-2 text-[11px] text-foreground-subtle">
            <Search className="size-3" aria-hidden="true" /> Chỉ hiển thị thành viên tổ chức đang
            hoạt động.
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// --- Danger zone --------------------------------------------------------------------------------------

const DangerSection = ({ project }: { project: Project }) => {
  const [confirming, setConfirming] = useState(false);
  const archive = useArchiveProject();
  const navigate = useNavigate();
  return (
    <Section
      title="Lưu trữ dự án"
      tone="danger"
      description="Ẩn dự án cùng mọi danh sách và công việc khỏi tất cả thành viên."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-[13px] text-foreground-muted">
          Dữ liệu không bị xóa vĩnh viễn; quản trị viên có thể khôi phục khi cần.
        </p>
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          <Archive />
          Lưu trữ dự án
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lưu trữ “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Mọi thành viên sẽ không còn thấy dự án này.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archive.isPending}>Hủy</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={archive.isPending}
              onClick={() =>
                archive.mutate(project.id, {
                  onSuccess: () => {
                    setConfirming(false);
                    void navigate("/", { replace: true });
                  }
                })
              }
            >
              {archive.isPending ? <Spinner /> : <Archive />}
              Lưu trữ
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
};
