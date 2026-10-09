import { cn } from "cn";
import {
  Asterisk,
  CalendarDays,
  Hash,
  ListChecks,
  ListTodo,
  Plus,
  SquareCheck,
  Table2,
  TextCursorInput,
  Trash2,
  TriangleAlert,
  type LucideIcon
} from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ColorSwatchPicker, SegmentedControl } from "@/components/shared/radio-controls";
import { EmptyState, ErrorState } from "@/components/shared/states";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  customFieldEntities,
  type CustomField,
  type CustomFieldEntity
} from "@/contracts/production-catalog";
import type { ColorToken } from "@/contracts/work";
import { nextSortOrder } from "@/features/production/catalog";
import { CustomFieldInput } from "@/features/production/components/custom-field-input";
import {
  ActiveState,
  ArchivedToggle,
  FormAlert,
  InfoNote,
  PageIntro,
  RowMenu,
  RowsSkeleton,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { SortableList } from "@/features/production/components/sortable-list";
import {
  customFieldEntityLabels,
  customFieldTypeLabels,
  FIELD_KEY_PATTERN,
  isOptionType,
  optionValueFrom,
  slugifyFieldKey,
  type CustomFieldType,
  type CustomValue
} from "@/features/production/custom-fields";
import { productionErrorMessage, toastProductionError } from "@/features/production/errors";
import {
  useCustomFieldMutations,
  useCustomFields,
  useReorderCustomFields
} from "@/features/production/hooks";
import { colorTokenLabels, toneClass } from "@/lib/colors";
import { sheetOnPhone } from "@/features/production/ui";

const typeIcons: Record<CustomFieldType, LucideIcon> = {
  TEXT: TextCursorInput,
  NUMBER: Hash,
  DATE: CalendarDays,
  SELECT: SquareCheck,
  MULTISELECT: ListChecks
};
const fieldTypes: readonly CustomFieldType[] = ["TEXT", "NUMBER", "DATE", "SELECT", "MULTISELECT"];
const optionColors: readonly ColorToken[] = [
  "blue",
  "emerald",
  "amber",
  "violet",
  "rose",
  "teal",
  "orange",
  "slate"
];

/** Admin-defined fields for jobs, tasks, members and clients (SPEC Phase 1, PLAN §8/§10). */
export const ProductionCustomFieldsRoute = () => {
  const fields = useCustomFields();
  const reorder = useReorderCustomFields();
  const mutations = useCustomFieldMutations();
  const [entity, setEntity] = useState<CustomFieldEntity>("JOB");
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<{ field: CustomField | null } | null>(null);

  const all = useMemo(() => fields.data?.items ?? [], [fields.data]);
  const ofEntity = all.filter((field) => field.entity === entity);
  const active = ofEntity.filter((field) => field.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = ofEntity.filter((field) => !field.active);
  const counts = useMemo(() => {
    const map = new Map<CustomFieldEntity, number>();
    for (const field of all)
      if (field.active) map.set(field.entity, (map.get(field.entity) ?? 0) + 1);
    return map;
  }, [all]);

  const toggleActive = (field: CustomField) =>
    mutations.update.mutate(
      {
        id: field.id,
        input: { active: !field.active }
      },
      {
        onSuccess: () =>
          toast.success(
            field.active ? `Đã lưu trữ trường ${field.label}` : `Đã khôi phục trường ${field.label}`
          ),
        onError: (error) => toastProductionError(error)
      }
    );

  const row = (field: CustomField, handle?: ReactNode) => {
    const Icon = typeIcons[field.type];
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 md:px-4",
          !field.active && "bg-muted/30"
        )}
      >
        {handle ?? <span className="size-6 shrink-0" aria-hidden="true" />}
        <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground-muted sm:flex">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <button
          type="button"
          onClick={() => setDialog({ field })}
          className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex max-w-full items-center gap-2">
            <span
              className={cn(
                "truncate text-[13px] font-medium",
                !field.active && "text-foreground-muted"
              )}
            >
              {field.label}
            </span>
            {field.required ? (
              <span title="Bắt buộc" className="text-danger">
                <Asterisk className="size-3.5" aria-label="bắt buộc" />
              </span>
            ) : null}
          </span>
          <span className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-muted">
            <code className="rounded bg-muted px-1 font-mono text-[11px]">{field.key}</code>
            <span>{customFieldTypeLabels[field.type]}</span>
            {isOptionType(field.type) ? <span>· {field.options.length} lựa chọn</span> : null}
            {field.showInTable ? (
              <span className="inline-flex items-center gap-1">
                · <Table2 className="size-3" aria-hidden="true" /> Hiện trong bảng
              </span>
            ) : null}
          </span>
        </button>
        {!field.active ? <ActiveState active={false} className="hidden sm:inline-flex" /> : null}
        <RowMenu
          label={field.label}
          active={field.active}
          onEdit={() => setDialog({ field })}
          onToggleActive={() => toggleActive(field)}
        />
      </div>
    );
  };

  return (
    <SettingsPage>
      <PageIntro
        slug="custom-fields"
        actions={
          <Button onClick={() => setDialog({ field: null })}>
            <Plus />
            Thêm trường
          </Button>
        }
      />
      <SegmentedControl<CustomFieldEntity>
        aria-label="Loại bản ghi"
        value={entity}
        onChange={(next) => {
          setEntity(next);
          setShowArchived(false);
        }}
        className="w-full sm:w-fit max-sm:[&_button]:h-9"
        options={customFieldEntities.map((value) => ({
          value,
          label: `${customFieldEntityLabels[value]}${counts.get(value) ? ` · ${counts.get(value)}` : ""}`
        }))}
      />
      <SettingsSection
        title={`Trường cho ${customFieldEntityLabels[entity]}`}
        description="Kéo để sắp xếp thứ tự trong form và bảng. Trường lưu trữ giữ nguyên dữ liệu đã nhập."
        actions={
          <ArchivedToggle
            checked={showArchived}
            onChange={setShowArchived}
            count={archived.length}
          />
        }
      >
        {fields.isPending ? (
          <RowsSkeleton rows={3} />
        ) : fields.isError ? (
          <ErrorState size="sm" error={fields.error} onRetry={() => void fields.refetch()} />
        ) : ofEntity.length === 0 ? (
          <EmptyState
            size="sm"
            icon={ListTodo}
            title={`Chưa có trường cho ${customFieldEntityLabels[entity]}`}
            description="Ví dụ: “Mã đơn hàng” cho Job, “Năng lực” (A++, A, B) cho Thành viên."
            action={
              <Button size="sm" onClick={() => setDialog({ field: null })}>
                <Plus />
                Thêm trường
              </Button>
            }
          />
        ) : (
          <>
            <SortableList
              aria-label={`Trường đang dùng của ${customFieldEntityLabels[entity]}`}
              items={active}
              disabled={reorder.isPending}
              onReorder={(ordered) =>
                reorder.mutate(ordered, {
                  onError: (error) =>
                    toast.error(
                      productionErrorMessage(error, { fallback: "Không lưu được thứ tự." })
                    )
                })
              }
              renderItem={(field, handle) =>
                row(field, handle({ label: `Kéo để sắp xếp ${field.label}` }))
              }
            />
            {showArchived && archived.length > 0 ? (
              <ul aria-label="Trường đã lưu trữ" className="divide-y border-t">
                {archived.map((field) => (
                  <li key={field.id}>{row(field)}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </SettingsSection>

      <FieldDialog
        key={dialog?.field?.id ?? `new-${entity}`}
        open={dialog !== null}
        field={dialog?.field ?? null}
        entity={dialog?.field?.entity ?? entity}
        siblings={all.filter((item) => item.entity === (dialog?.field?.entity ?? entity))}
        onClose={() => setDialog(null)}
      />
    </SettingsPage>
  );
};

type DraftOption = {
  id: string;
  value: string;
  label: string;
  color: ColorToken;
  valueTouched: boolean;
};

let optionSeq = 0;
const newOptionId = () => `opt-${(optionSeq += 1)}`;

const FieldDialog = ({
  open,
  field,
  entity,
  siblings,
  onClose
}: {
  open: boolean;
  field: CustomField | null;
  entity: CustomFieldEntity;
  siblings: readonly CustomField[];
  onClose: () => void;
}) => {
  const ids = useId();
  const mutations = useCustomFieldMutations();
  const [label, setLabel] = useState(field?.label ?? "");
  const [key, setKey] = useState(field?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(Boolean(field));
  const [type, setType] = useState<CustomFieldType>(field?.type ?? "TEXT");
  const [required, setRequired] = useState(field?.required ?? false);
  const [showInTable, setShowInTable] = useState(field?.showInTable ?? false);
  const [options, setOptions] = useState<DraftOption[]>(() =>
    (field?.options ?? []).map((option) => ({
      id: newOptionId(),
      value: option.value,
      label: option.label,
      color: option.color ?? "slate",
      valueTouched: true
    }))
  );
  const [preview, setPreview] = useState<CustomValue>(null);
  const [errors, setErrors] = useState<{
    label?: string | undefined;
    key?: string | undefined;
    options?: string | undefined;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const pending = mutations.create.isPending || mutations.update.isPending;
  const keyValue = keyTouched ? key : slugifyFieldKey(label);
  const optionType = isOptionType(type);
  const typeChanged = field !== null && field.type !== type;

  const updateOption = (id: string, patch: Partial<DraftOption>) =>
    setOptions((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.label !== undefined && !item.valueTouched) {
          const taken = new Set(
            items.filter((other) => other.id !== id).map((other) => other.value)
          );
          next.value = optionValueFrom(patch.label, taken);
        }
        return next;
      })
    );

  const addOption = () =>
    setOptions((items) => [
      ...items,
      {
        id: newOptionId(),
        value: "",
        label: "",
        color: optionColors[items.length % optionColors.length] ?? "slate",
        valueTouched: false
      }
    ]);

  const draftField: CustomField = {
    id: field?.id ?? "00000000-0000-4000-8000-000000000000",
    entity,
    key: keyValue || "preview",
    label: label || "Xem trước",
    type,
    options: options
      .filter((option) => option.label.trim())
      .map((option) => ({
        value: option.value || option.label,
        label: option.label,
        color: option.color
      })),
    required,
    showInTable,
    sortOrder: 0,
    active: true
  };

  const submit = () => {
    const problems: typeof errors = {};
    const trimmedLabel = label.trim();
    if (!trimmedLabel) problems.label = "Nhập tên trường.";
    if (!FIELD_KEY_PATTERN.test(keyValue)) {
      problems.key = "Mã bắt đầu bằng chữ thường, chỉ gồm a–z, 0–9 và _, tối đa 40 ký tự.";
    } else if (!field && siblings.some((item) => item.key === keyValue)) {
      problems.key = `Mã “${keyValue}” đã có trong ${customFieldEntityLabels[entity]}.`;
    }
    const cleaned = options
      .map((option) => ({ ...option, label: option.label.trim(), value: option.value.trim() }))
      .filter((option) => option.label);
    if (optionType) {
      const values = cleaned.map((option) => option.value);
      if (cleaned.length === 0) problems.options = "Thêm ít nhất một lựa chọn.";
      else if (cleaned.some((option) => !option.value || option.value.length > 80))
        problems.options = "Mỗi lựa chọn cần mã (tối đa 80 ký tự).";
      else if (new Set(values).size !== values.length)
        problems.options = "Các lựa chọn bị trùng mã.";
    }
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    const input = {
      entity,
      key: keyValue,
      label: trimmedLabel,
      type,
      options: optionType
        ? cleaned.map((option) => ({
            value: option.value,
            label: option.label,
            color: option.color
          }))
        : [],
      required,
      showInTable,
      sortOrder: field?.sortOrder ?? nextSortOrder(siblings.filter((item) => item.active))
    };
    const callbacks = {
      onSuccess: () => {
        toast.success(
          field ? `Đã cập nhật trường ${trimmedLabel}` : `Đã thêm trường ${trimmedLabel}`
        );
        onClose();
      },
      onError: (failure: unknown) =>
        setFormError(
          productionErrorMessage(failure, {
            conflict: `Mã “${keyValue}” đã có trong ${customFieldEntityLabels[entity]}.`
          })
        )
    };
    if (field) mutations.update.mutate({ id: field.id, input }, callbacks);
    else mutations.create.mutate(input, callbacks);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl",
          sheetOnPhone
        )}
      >
        <form
          noValidate
          className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col max-sm:max-h-[92dvh]"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader className="border-b px-4 pt-4 pb-3">
            <DialogTitle>
              {field
                ? `Sửa trường ${field.label}`
                : `Thêm trường cho ${customFieldEntityLabels[entity]}`}
            </DialogTitle>
            <DialogDescription>
              Giá trị được kiểm tra ở máy chủ theo kiểu trường; trường bắt buộc phải có giá trị khi
              tạo mới bản ghi.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.label)}>
                <FieldLabel htmlFor={`${ids}-label`}>Tên trường</FieldLabel>
                <Input
                  id={`${ids}-label`}
                  autoFocus
                  value={label}
                  maxLength={120}
                  placeholder="Ví dụ: Mã đơn hàng"
                  aria-invalid={Boolean(errors.label)}
                  onChange={(event) => {
                    setLabel(event.target.value);
                    setErrors((current) => ({ ...current, label: undefined }));
                  }}
                />
                {errors.label ? <FieldError>{errors.label}</FieldError> : null}
              </Field>
              <Field data-invalid={Boolean(errors.key)}>
                <FieldLabel htmlFor={`${ids}-key`}>Mã trường</FieldLabel>
                <Input
                  id={`${ids}-key`}
                  value={keyValue}
                  maxLength={40}
                  disabled={field !== null}
                  className="font-mono"
                  aria-invalid={Boolean(errors.key)}
                  onChange={(event) => {
                    setKeyTouched(true);
                    setKey(event.target.value.toLowerCase());
                    setErrors((current) => ({ ...current, key: undefined }));
                  }}
                />
                {errors.key ? (
                  <FieldError>{errors.key}</FieldError>
                ) : (
                  <FieldDescription className="text-xs">
                    {field
                      ? "Mã không đổi được sau khi tạo (dữ liệu đã lưu theo mã)."
                      : "Tự sinh từ tên; dùng trong báo cáo và nhập liệu."}
                  </FieldDescription>
                )}
              </Field>
            </div>

            <Field>
              <FieldLabel id={`${ids}-type`}>Kiểu dữ liệu</FieldLabel>
              <Select
                items={fieldTypes.map((value) => ({ value, label: customFieldTypeLabels[value] }))}
                value={type}
                onValueChange={(value: CustomFieldType | null) => {
                  if (!value) return;
                  setType(value);
                  setPreview(null);
                  if (isOptionType(value) && options.length === 0) addOption();
                }}
              >
                <SelectTrigger className="w-full sm:w-64" aria-labelledby={`${ids}-type`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map((value) => {
                    const Icon = typeIcons[value];
                    return (
                      <SelectItem key={value} value={value}>
                        <Icon className="text-foreground-muted" aria-hidden="true" />
                        {customFieldTypeLabels[value]}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {typeChanged ? (
                <InfoNote icon={TriangleAlert} tone="warning" className="mt-1">
                  Đổi kiểu dữ liệu không chuyển đổi giá trị đã lưu; giá trị cũ không hợp lệ sẽ phải
                  nhập lại khi sửa bản ghi.
                </InfoNote>
              ) : null}
            </Field>

            {optionType ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Lựa chọn</legend>
                <SortableList
                  aria-label="Các lựa chọn"
                  items={options}
                  onReorder={setOptions}
                  className="divide-y-0 rounded-lg border"
                  renderItem={(option, handle) => (
                    <div className="flex items-center gap-2 border-b px-2 py-1.5 last:border-b-0">
                      {handle({ label: `Kéo để sắp xếp ${option.label || "lựa chọn"}` })}
                      <Popover>
                        <PopoverTrigger
                          aria-label={`Màu: ${colorTokenLabels[option.color]}`}
                          className={cn(
                            toneClass(option.color),
                            "flex size-8 shrink-0 items-center justify-center rounded-md outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring max-sm:size-10"
                          )}
                        >
                          <span aria-hidden="true" className="size-3 rounded-full bg-(--tone)" />
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64">
                          <ColorSwatchPicker
                            aria-label="Màu lựa chọn"
                            value={option.color}
                            onChange={(color) => updateOption(option.id, { color })}
                          />
                        </PopoverContent>
                      </Popover>
                      <Input
                        value={option.label}
                        maxLength={120}
                        placeholder="Nhãn hiển thị"
                        aria-label="Nhãn lựa chọn"
                        autoFocus={!option.label && !option.valueTouched}
                        onChange={(event) => updateOption(option.id, { label: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addOption();
                          }
                        }}
                        className="min-w-0 flex-1"
                      />
                      <Input
                        value={option.value}
                        maxLength={80}
                        placeholder="mã"
                        aria-label="Mã lựa chọn"
                        title="Mã lưu trong dữ liệu; đổi mã làm giá trị cũ không còn khớp"
                        onChange={(event) =>
                          updateOption(option.id, { value: event.target.value, valueTouched: true })
                        }
                        className="hidden w-32 font-mono text-xs sm:block"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Xóa lựa chọn ${option.label}`}
                        className="text-foreground-subtle hover:text-danger"
                        onClick={() =>
                          setOptions((items) => items.filter((item) => item.id !== option.id))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={addOption}
                  disabled={options.length >= 200}
                >
                  <Plus />
                  Thêm lựa chọn
                </Button>
                {errors.options ? (
                  <p role="alert" className="text-xs text-danger">
                    {errors.options}
                  </p>
                ) : null}
              </fieldset>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-lg border p-3">
                <Switch checked={required} onCheckedChange={setRequired} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Bắt buộc</span>
                  <span className="text-xs text-foreground-muted">
                    Phải có giá trị khi tạo mới.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-3">
                <Switch checked={showInTable} onCheckedChange={setShowInTable} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Hiện trong bảng</span>
                  <span className="text-xs text-foreground-muted">
                    Thêm cột vào danh sách và bộ lọc.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
              <p className="text-xs font-semibold tracking-[0.06em] text-foreground-subtle uppercase">
                Xem trước
              </p>
              <Field>
                <FieldLabel htmlFor={`${ids}-preview`}>
                  {draftField.label}
                  {required ? <span className="text-danger">*</span> : null}
                </FieldLabel>
                <CustomFieldInput
                  id={`${ids}-preview`}
                  field={draftField}
                  value={preview}
                  onChange={setPreview}
                />
              </Field>
            </div>
            <FormAlert>{formError}</FormAlert>
          </div>
          <DialogFooter className="mx-0 mb-0 px-4 py-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {field ? "Lưu thay đổi" : "Thêm trường"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
