import { zodResolver } from "@hookform/resolvers/zod";
import { Globe, Lock } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { DiscardDraftDialog } from "@/components/shared/discard-draft-dialog";
import { ProjectIcon } from "@/components/shared/project-icon";
import type { ProjectIconKey } from "@/components/shared/project-icons";
import { ColorSwatchPicker, ProjectIconPicker, SegmentedControl } from "@/components/shared/radio-controls";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ColorTokenSchema, ProjectVisibilitySchema } from "@/contracts/work";
import { useDiscardGuard } from "@/hooks/use-discard-guard";
import { isApiError } from "@/lib/api/errors";

import { knowledgeErrorMessage } from "../errors";
import { useCreateSpace } from "../hooks";
import { visibilityMeta } from "../model/labels";

const formSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên kho.").max(120, "Tên tối đa 120 ký tự."),
  description: z.string().trim().max(1000, "Mô tả tối đa 1000 ký tự."),
  visibility: ProjectVisibilitySchema,
  color: ColorTokenSchema,
  icon: z.string().nullable(),
  approvalRequired: z.boolean()
});
type FormValues = z.infer<typeof formSchema>;

const defaults: FormValues = {
  name: "",
  description: "",
  visibility: "private",
  color: "teal",
  icon: "book",
  approvalRequired: false
};

const visibilityOptions = [
  { value: "private", label: visibilityMeta.private.label, icon: Lock, description: visibilityMeta.private.description },
  { value: "public", label: visibilityMeta.public.label, icon: Globe, description: visibilityMeta.public.description }
] as const;

/** "Tạo kho" (PD-031 §08): like the new project dialog. The creator becomes the first Quản lý. */
export const NewSpaceDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const guard = useDiscardGuard(() => onOpenChange(false));
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : guard.requestClose())}>
        <DialogContent className="gap-0 p-0 sm:max-w-lg">
          <NewSpaceForm onDirtyChange={guard.setDirty} onCancel={guard.requestClose} onDone={guard.close} />
        </DialogContent>
      </Dialog>
      <DiscardDraftDialog {...guard.confirm} />
    </>
  );
};

const NewSpaceForm = ({
  onDirtyChange,
  onCancel,
  onDone
}: {
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onDone: () => void;
}) => {
  const ids = useId();
  const navigate = useNavigate();
  const create = useCreateSpace();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: defaults, mode: "onTouched" });
  const { register, handleSubmit, control, formState } = form;
  const [name, color, visibility, icon] = useWatch({ control, name: ["name", "color", "visibility", "icon"] });

  useEffect(() => onDirtyChange(formState.isDirty), [formState.isDirty, onDirtyChange]);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    create.mutate(
      {
        name: values.name,
        description: values.description || null,
        visibility: values.visibility,
        color: values.color,
        icon: values.icon,
        approvalRequired: values.approvalRequired
      },
      {
        onSuccess: (space) => {
          toast.success(`Đã tạo kho “${values.name}”`);
          onDone();
          void navigate(`/k/${space.id}`);
        },
        onError: (error) => {
          // A taken name belongs on the name field (the bottom alert can be scrolled out of view).
          if (isApiError(error) && error.code === "KNOWLEDGE_SPACE_EXISTS") {
            form.setError("name", { message: knowledgeErrorMessage(error) }, { shouldFocus: true });
            return;
          }
          setFormError(knowledgeErrorMessage(error, "Không tạo được kho. Vui lòng thử lại."));
        }
      }
    );
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex max-h-[min(88vh,780px)] flex-col">
      <DialogHeader className="flex-row items-center gap-3 border-b px-5 py-4 pr-12">
        <ProjectIcon color={color} icon={icon} name={name || "Kho"} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle>Kho tri thức mới</DialogTitle>
          <DialogDescription>
            Nơi cất thông tin đã chốt: quy trình, chính sách, hướng dẫn. Bạn sẽ là Quản lý đầu tiên.
          </DialogDescription>
        </div>
      </DialogHeader>

      <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
        <Field data-invalid={Boolean(formState.errors.name)}>
          <FieldLabel htmlFor={`${ids}-name`}>Tên kho</FieldLabel>
          <Input
            id={`${ids}-name`}
            autoFocus
            autoComplete="off"
            placeholder="Ví dụ: Quy trình Sản xuất"
            aria-invalid={Boolean(formState.errors.name)}
            {...register("name")}
          />
          <FieldError errors={[formState.errors.name]} />
        </Field>

        <Field data-invalid={Boolean(formState.errors.description)}>
          <FieldLabel htmlFor={`${ids}-description`}>
            Mô tả <span className="font-normal text-foreground-subtle">(không bắt buộc)</span>
          </FieldLabel>
          <Textarea id={`${ids}-description`} rows={2} className="min-h-14 resize-none" {...register("description")} />
          <FieldError errors={[formState.errors.description]} />
        </Field>

        <Field>
          <FieldLabel id={`${ids}-visibility`}>Ai thấy kho</FieldLabel>
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
          <FieldDescription className="text-xs">{visibilityMeta[visibility].description}</FieldDescription>
        </Field>

        <Controller
          control={control}
          name="approvalRequired"
          render={({ field }) => (
            <label className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
              <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Bật bước duyệt</span>
                <span className="text-xs text-foreground-muted">
                  Chỉ Quản lý kho mới chuyển được mục sang “Đang áp dụng” hoặc “Hết hiệu lực”. Có thể đổi sau trong Cài đặt
                  kho.
                </span>
              </span>
            </label>
          )}
        />

        <Field>
          <FieldLabel id={`${ids}-color`}>Màu</FieldLabel>
          <Controller
            control={control}
            name="color"
            render={({ field }) => (
              <ColorSwatchPicker aria-labelledby={`${ids}-color`} value={field.value} onChange={field.onChange} />
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
                initial={(name.trim()[0] ?? "K").toLocaleUpperCase("vi")}
              />
            )}
          />
        </Field>
      </div>

      {/* Outside the scrolling body so the error is seen next to the button that caused it. */}
      {formError ? (
        <p role="alert" className="mx-5 mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {formError}
        </p>
      ) : null}

      <DialogFooter className="mx-0 mb-0 border-t px-5 py-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Spinner /> : null}
          Tạo kho
        </Button>
      </DialogFooter>
    </form>
  );
};
