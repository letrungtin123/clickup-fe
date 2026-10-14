import { zodResolver } from "@hookform/resolvers/zod";
import { PencilLine, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { roleLabel } from "@/components/layout/role-label";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useRoleMutations } from "@/features/admin/api";
import { getErrorMessage } from "@/lib/api/errors";
import type { AdminRole } from "@/lib/api/schemas";

/** Create / rename / delete a custom organization role (Cài đặt → Vai trò & phân quyền). */

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

export const CreateRoleDialog = ({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (role: AdminRole) => void;
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
                    onCreated?.(role);
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
            <DialogDescription>
              Tạo xong, tích quyền cho vai trò ở cột mới trong bảng rồi bấm “Lưu thay đổi”.
            </DialogDescription>
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

const renameSchema = roleSchema.pick({ name: true, description: true });
type RenameValues = z.infer<typeof renameSchema>;

/** Rename a custom role (name + description); mount it only while open so it starts from the role. */
export const RenameRoleDialog = ({
  role,
  onOpenChange
}: {
  role: AdminRole;
  onOpenChange: (open: boolean) => void;
}) => {
  const ids = useId();
  const mutations = useRoleMutations();
  const { register, handleSubmit, formState } = useForm<RenameValues>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name: role.name, description: role.description ?? "" }
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) =>
            void handleSubmit((values) =>
              mutations.update.mutate(
                {
                  roleId: role.id,
                  input: { name: values.name, description: values.description || null }
                },
                { onSuccess: () => onOpenChange(false) }
              )
            )(event)
          }
        >
          <DialogHeader>
            <DialogTitle>Đổi tên vai trò</DialogTitle>
            <DialogDescription>
              Mã <span className="font-mono">{role.key}</span> giữ nguyên.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(formState.errors.name)}>
            <FieldLabel htmlFor={`${ids}-name`}>Tên vai trò</FieldLabel>
            <Input
              id={`${ids}-name`}
              autoFocus
              aria-invalid={Boolean(formState.errors.name)}
              {...register("name")}
            />
            <FieldError errors={[formState.errors.name]} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-description`}>
              Mô tả <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
            </FieldLabel>
            <Input id={`${ids}-description`} {...register("description")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={mutations.update.isPending}>
              {mutations.update.isPending ? <Spinner /> : <PencilLine />}
              Lưu tên
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const DeleteRoleDialog = ({
  role,
  onOpenChange,
  onDeleted
}: {
  role: AdminRole;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (role: AdminRole) => void;
}) => {
  const mutations = useRoleMutations();
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
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
                  onOpenChange(false);
                  onDeleted?.(role);
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
  );
};
