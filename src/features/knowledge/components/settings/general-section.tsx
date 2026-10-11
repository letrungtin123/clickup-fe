import { zodResolver } from "@hookform/resolvers/zod";
import {
  BookOpenText,
  Globe,
  Lock,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { useEffect, useEffectEvent, useId, useMemo, useState, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  KnowledgeVisibilitySchema,
  type KnowledgeSpaceDetail,
  type UpdateKnowledgeSpaceRequest
} from "@/contracts/knowledge";
import { ColorTokenSchema } from "@/contracts/work";
import { isApiError } from "@/lib/api/errors";

import { knowledgeErrorMessage } from "../../errors";
import { useUpdateSpace } from "../../hooks";
import { accessLevelMeta, visibilityMeta } from "../../model/labels";
import { SettingsSection } from "./settings-section";

/** Same fields and rules as "Tạo kho" (new-space-dialog); the approval step has its own card. */
const formSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên kho.").max(120, "Tên tối đa 120 ký tự."),
  description: z.string().trim().max(1000, "Mô tả tối đa 1000 ký tự."),
  visibility: KnowledgeVisibilitySchema,
  color: ColorTokenSchema,
  icon: z.string().nullable()
});
type FormValues = z.infer<typeof formSchema>;

const visibilityOptions = [
  {
    value: "private",
    label: visibilityMeta.private.label,
    icon: Lock,
    description: visibilityMeta.private.description
  },
  {
    value: "public",
    label: visibilityMeta.public.label,
    icon: Globe,
    description: visibilityMeta.public.description
  }
] as const;

/** What changes for people when the saved visibility flips (shown before saving). */
const visibilityChangeNote = {
  private:
    "Sau khi lưu, người không có trong danh sách thành viên sẽ không còn thấy kho, các mục và kết quả tìm kiếm của kho.",
  public:
    "Sau khi lưu, mọi người có quyền xem tri thức sẽ thấy kho, đọc và bình luận các mục đang áp dụng."
} as const;

export const SpaceGeneralSection = ({
  space,
  editable
}: {
  space: KnowledgeSpaceDetail;
  editable: boolean;
}) => {
  const id = useId();
  return (
    <SettingsSection
      id={`${id}-general`}
      title="Thông tin chung"
      description={
        editable
          ? "Tên, mô tả, giao diện và ai thấy kho."
          : space.archivedAt
            ? "Kho đã lưu trữ nên thông tin chỉ xem được."
            : "Chỉ Quản lý kho mới sửa được thông tin này."
      }
    >
      {editable ? <GeneralForm space={space} /> : <GeneralSummary space={space} />}
    </SettingsSection>
  );
};

const GeneralForm = ({ space }: { space: KnowledgeSpaceDetail }) => {
  const ids = useId();
  const update = useUpdateSpace(space.id);
  const [formError, setFormError] = useState<string | null>(null);
  const serverValues = useMemo<FormValues>(
    () => ({
      name: space.name,
      description: space.description ?? "",
      visibility: space.visibility,
      color: space.color,
      icon: space.icon
    }),
    [space.name, space.description, space.visibility, space.color, space.icon]
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: serverValues,
    mode: "onTouched"
  });
  const { register, control, handleSubmit, reset, formState } = form;
  const { errors, isDirty, dirtyFields } = formState;
  const [name, color, visibility] = useWatch({ control, name: ["name", "color", "visibility"] });

  // Someone else saved (realtime refetch): adopt it unless the manager is in the middle of an edit.
  const adoptServerValues = useEffectEvent((next: FormValues) => {
    if (!form.formState.isDirty) reset(next);
  });
  useEffect(() => adoptServerValues(serverValues), [serverValues]);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const patch: UpdateKnowledgeSpaceRequest = {
      ...(dirtyFields.name ? { name: values.name } : {}),
      ...(dirtyFields.description ? { description: values.description || null } : {}),
      ...(dirtyFields.visibility ? { visibility: values.visibility } : {}),
      ...(dirtyFields.color ? { color: values.color } : {}),
      ...(dirtyFields.icon ? { icon: values.icon } : {})
    };
    if (Object.keys(patch).length === 0) {
      reset(values);
      return;
    }
    update.mutate(patch, {
      onSuccess: () => {
        reset(values);
        toast.success("Đã lưu thông tin kho");
      },
      onError: (error) => {
        if (isApiError(error) && error.code === "KNOWLEDGE_SPACE_EXISTS") {
          form.setError("name", { message: knowledgeErrorMessage(error) }, { shouldFocus: true });
          return;
        }
        setFormError(knowledgeErrorMessage(error, "Không lưu được thay đổi. Vui lòng thử lại."));
      }
    });
  });

  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={(event) => void onSubmit(event)}>
      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor={`${ids}-name`}>Tên kho</FieldLabel>
        <Input
          id={`${ids}-name`}
          autoComplete="off"
          maxLength={120}
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
        <FieldError errors={[errors.name]} />
      </Field>

      <Field data-invalid={Boolean(errors.description)}>
        <FieldLabel htmlFor={`${ids}-description`}>
          Mô tả <span className="font-normal text-foreground-subtle">(không bắt buộc)</span>
        </FieldLabel>
        <Textarea
          id={`${ids}-description`}
          rows={3}
          maxLength={1000}
          className="min-h-20 resize-none"
          placeholder="Kho này chứa gì, dành cho ai."
          aria-invalid={Boolean(errors.description)}
          {...register("description")}
        />
        <FieldError errors={[errors.description]} />
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
        <FieldDescription className="text-xs">
          {visibilityMeta[visibility].description}
        </FieldDescription>
        {visibility !== space.visibility ? (
          <p
            className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-foreground"
            role="note"
          >
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
            {visibilityChangeNote[visibility]}
          </p>
        ) : null}
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
              initial={(name.trim()[0] ?? "K").toLocaleUpperCase("vi")}
            />
          )}
        />
      </Field>

      {formError ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {isDirty ? (
          <span className="mr-auto text-xs text-foreground-subtle" aria-live="polite">
            Có thay đổi chưa lưu
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          disabled={!isDirty || update.isPending}
          onClick={() => {
            setFormError(null);
            reset();
          }}
        >
          Hoàn tác
        </Button>
        <Button type="submit" disabled={!isDirty || update.isPending}>
          {update.isPending ? <Spinner /> : null}
          Lưu thay đổi
        </Button>
      </div>
    </form>
  );
};

/** Read-only view for readers, members and archived spaces: what the space is and what I can do. */
const GeneralSummary = ({ space }: { space: KnowledgeSpaceDetail }) => {
  const VisibilityIcon = space.visibility === "private" ? Lock : Globe;
  const access = space.myAccess
    ? accessLevelMeta[space.myAccess]
    : space.capabilities.canManage
      ? { label: "Quản trị tổ chức", description: "Bạn thấy và quản lý được mọi kho tri thức." }
      : {
          label: "Người đọc",
          description:
            "Kho công khai: bạn đọc, bình luận và theo dõi được. Muốn sửa, hãy nhờ Quản lý kho thêm bạn làm Thành viên."
        };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex min-w-0 items-start gap-3">
        <ProjectIcon color={space.color} icon={space.icon} name={space.name} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[15px] font-semibold tracking-[-0.01em] break-words">{space.name}</p>
          <p className="text-[13px] leading-relaxed whitespace-pre-line break-words text-foreground-muted">
            {space.description?.trim() || "Chưa có mô tả."}
          </p>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-4 border-t pt-4 sm:grid-cols-2">
        <SummaryItem
          icon={VisibilityIcon}
          label="Ai thấy kho"
          value={visibilityMeta[space.visibility].label}
        >
          {visibilityMeta[space.visibility].description}
        </SummaryItem>
        <SummaryItem
          icon={ShieldCheck}
          label="Bước duyệt"
          value={space.approvalRequired ? "Đang bật" : "Đang tắt"}
        >
          {space.approvalRequired
            ? "Chỉ Quản lý kho mới chuyển được mục sang Đang áp dụng hoặc Hết hiệu lực, và sửa mục đã ban hành."
            : "Thành viên tự chuyển mục sang Đang áp dụng hoặc Hết hiệu lực."}
        </SummaryItem>
        <SummaryItem icon={UserRound} label="Quyền của bạn" value={access.label}>
          {access.description}
        </SummaryItem>
        <SummaryItem
          icon={BookOpenText}
          label="Quy mô"
          value={`${space.itemCount} mục · ${space.memberCount} thành viên`}
        />
      </dl>
    </div>
  );
};

const SummaryItem = ({
  icon: Icon,
  label,
  value,
  children
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  children?: ReactNode;
}) => (
  <div className="flex min-w-0 gap-2.5">
    <Icon className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-foreground-subtle">{label}</dt>
      <dd className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium">{value}</span>
        {children ? (
          <span className="text-xs leading-relaxed text-foreground-muted">{children}</span>
        ) : null}
      </dd>
    </div>
  </div>
);
