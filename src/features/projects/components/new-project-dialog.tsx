import { zodResolver } from "@hookform/resolvers/zod";
import { Globe, Lock } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { ProjectIcon } from "@/components/shared/project-icon";
import type { ProjectIconKey } from "@/components/shared/project-icons";
import {
  ColorSwatchPicker,
  ProjectIconPicker,
  SegmentedControl
} from "@/components/shared/radio-controls";
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
import { Textarea } from "@/components/ui/textarea";
import { ColorTokenSchema, ProjectVisibilitySchema } from "@/contracts/work";
import { getErrorMessage, isApiError } from "@/lib/api/errors";

import { useCreateProject, useProjects } from "../hooks";
import { projectKeyPattern, sanitizeProjectKey, suggestProjectKey } from "../project-key";

const formSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên dự án.").max(160, "Tên tối đa 160 ký tự."),
  key: z
    .string()
    .trim()
    .regex(projectKeyPattern, "Mã gồm 2–12 chữ in hoa hoặc số, bắt đầu bằng chữ cái."),
  description: z.string().trim().max(1000, "Mô tả tối đa 1000 ký tự."),
  visibility: ProjectVisibilitySchema,
  color: ColorTokenSchema,
  icon: z.string().nullable()
});
type FormValues = z.infer<typeof formSchema>;

const defaults: FormValues = {
  name: "",
  key: "",
  description: "",
  visibility: "private",
  color: "indigo",
  icon: null
};

const visibilityOptions = [
  {
    value: "private",
    label: "Riêng tư",
    icon: Lock,
    description: "Chỉ thành viên được mời mới thấy dự án."
  },
  {
    value: "public",
    label: "Công khai",
    icon: Globe,
    description: "Mọi thành viên tổ chức đều thấy và tham gia được."
  }
] as const;

type NewProjectDialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

export const NewProjectDialog = ({ open, onOpenChange }: NewProjectDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="gap-0 p-0 sm:max-w-lg">
      {/* Mounted with the popup only (Base UI unmounts it after the exit animation). */}
      <NewProjectForm onDone={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

const NewProjectForm = ({ onDone }: { onDone: () => void }) => {
  const navigate = useNavigate();
  const ids = useId();
  const projects = useProjects();
  const createProject = useCreateProject();
  const [formError, setFormError] = useState<string | null>(null);
  const [keyEdited, setKeyEdited] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
    mode: "onTouched"
  });
  const { register, handleSubmit, control, setValue, setError, formState } = form;
  const [name, color, icon, visibility, keyValue] = useWatch({
    control,
    name: ["name", "color", "icon", "visibility", "key"]
  });

  // Suggest a key from the name until the user edits the key themselves.
  useEffect(() => {
    if (keyEdited) return;
    const existing = projects.data?.items.map((project) => project.key) ?? [];
    setValue("key", suggestProjectKey(name, existing), { shouldValidate: formState.isSubmitted });
  }, [formState.isSubmitted, keyEdited, name, projects.data?.items, setValue]);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    createProject.mutate(
      {
        name: values.name,
        key: values.key,
        description: values.description || null,
        visibility: values.visibility,
        color: values.color,
        icon: values.icon
      },
      {
        onSuccess: (project) => {
          toast.success(`Đã tạo dự án “${project.name}”`);
          onDone();
          const firstList = project.lists[0];
          void navigate(
            firstList ? `/p/${project.id}/l/${firstList.id}` : `/p/${project.id}/settings`
          );
        },
        onError: (error) => {
          if (isApiError(error) && error.code === "PROJECT_KEY_EXISTS") {
            setError("key", { message: getErrorMessage(error) }, { shouldFocus: true });
            return;
          }
          setFormError(getErrorMessage(error, "Không tạo được dự án. Vui lòng thử lại."));
        }
      }
    );
  });

  const keyField = register("key", {
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setKeyEdited(true);
      const sanitized = sanitizeProjectKey(event.target.value);
      if (sanitized !== event.target.value) setValue("key", sanitized);
    }
  });

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="flex max-h-[min(88vh,760px)] flex-col"
    >
      <DialogHeader className="flex-row items-center gap-3 border-b px-5 py-4 pr-12">
        <ProjectIcon color={color} icon={icon} name={name || "Dự án"} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle>Dự án mới</DialogTitle>
          <DialogDescription>
            Dự án gom các danh sách công việc và thành viên của một mảng việc.
          </DialogDescription>
        </div>
      </DialogHeader>

      <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field data-invalid={Boolean(formState.errors.name)}>
            <FieldLabel htmlFor={`${ids}-name`}>Tên dự án</FieldLabel>
            <Input
              id={`${ids}-name`}
              autoFocus
              autoComplete="off"
              placeholder="Ví dụ: Ứng dụng di động"
              aria-invalid={Boolean(formState.errors.name)}
              {...register("name")}
            />
            <FieldError errors={[formState.errors.name]} />
          </Field>
          <Field data-invalid={Boolean(formState.errors.key)}>
            <FieldLabel htmlFor={`${ids}-key`}>Mã dự án</FieldLabel>
            <Input
              id={`${ids}-key`}
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
              className="font-mono tracking-wider uppercase"
              aria-invalid={Boolean(formState.errors.key)}
              aria-describedby={`${ids}-key-hint`}
              {...keyField}
            />
            <FieldError errors={[formState.errors.key]} />
          </Field>
        </div>
        <FieldDescription id={`${ids}-key-hint`} className="-mt-3 text-xs">
          Mã dùng làm tiền tố cho công việc, ví dụ{" "}
          <span className="font-mono">{keyValue || "KEY"}-12</span>.
        </FieldDescription>

        <Field data-invalid={Boolean(formState.errors.description)}>
          <FieldLabel htmlFor={`${ids}-description`}>
            Mô tả <span className="font-normal text-foreground-subtle">(không bắt buộc)</span>
          </FieldLabel>
          <Textarea
            id={`${ids}-description`}
            rows={2}
            className="min-h-14 resize-none"
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
                options={visibilityOptions}
                className="w-full sm:w-fit"
              />
            )}
          />
          <FieldDescription className="text-xs">
            {visibilityOptions.find((option) => option.value === visibility)?.description}
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
                onChange={field.onChange}
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
                onChange={field.onChange}
                color={color}
                initial={(name.trim()[0] ?? "A").toLocaleUpperCase("vi")}
              />
            )}
          />
        </Field>

        {formError ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {formError}
          </p>
        ) : null}
      </div>

      <DialogFooter className="mx-0 mb-0 border-t px-5 py-3">
        <Button type="button" variant="ghost" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" disabled={createProject.isPending}>
          {createProject.isPending ? <Spinner /> : null}
          Tạo dự án
        </Button>
      </DialogFooter>
    </form>
  );
};
