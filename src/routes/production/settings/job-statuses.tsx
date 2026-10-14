import { cn } from "cn";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  CircleCheck,
  CircleDot,
  LockKeyhole,
  Pencil,
  Trash2,
  TriangleAlert
} from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ColorSwatchPicker } from "@/components/shared/radio-controls";
import { Link } from "@/components/shared/router-link";
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
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  jobStatusLimit,
  jobStatusNameMaxLength,
  type JobStatus
} from "@/contracts/production-catalog";
import type { ColorToken } from "@/contracts/work";
import type { JobStatusUpdateInput } from "@/features/production/api";
import { hasDuplicateName } from "@/features/production/catalog";
import { JobStatusChip } from "@/features/production/components/jobs/job-bits";
import {
  FormAlert,
  InfoNote,
  InlineText,
  PageIntro,
  QuickAdd,
  RowMenu,
  RowsSkeleton,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { SortableList } from "@/features/production/components/sortable-list";
import { productionErrorMessage } from "@/features/production/errors";
import { formatInteger } from "@/features/production/format";
import {
  useJobStatuses,
  useJobStatusMutations,
  useProductionMe
} from "@/features/production/hooks";
import { formatDateTime, formatWorkDay } from "@/features/production/jobs-model";
import { settingsPageBySlug } from "@/features/production/nav";
import { sheetOnPhone } from "@/features/production/ui";
import { isApiError } from "@/lib/api/errors";
import { colorTokenLabels, toneClass } from "@/lib/colors";
import { moveItem } from "@/lib/ordering";

const FALLBACK_TIMEZONE = "Asia/Ho_Chi_Minh";
const nameConflict = "Đã có trạng thái job cùng tên (không phân biệt hoa thường).";
const limitReached = `Tối đa ${jobStatusLimit} trạng thái job. Xoá bớt trạng thái không dùng trước khi thêm.`;
const closedHint =
  "Trạng thái đóng (ví dụ “Đã giao khách”): job được coi là đã xong, không còn đếm ngược hạn giao, và luôn xếp sau các trạng thái đang mở khi chọn.";

/** Copy for the PD-038 codes (the shared production map does not know them yet). */
const jobStatusMessages: Record<string, string> = {
  JOB_STATUS_NAME_TAKEN: nameConflict,
  JOB_STATUS_LIMIT: limitReached,
  JOB_STATUS_LAST: "Phải còn ít nhất một trạng thái job.",
  JOB_STATUS_REPLACEMENT_INVALID:
    "Trạng thái thay thế không còn tồn tại. Hãy chọn trạng thái khác.",
  JOB_STATUS_NOT_FOUND: "Không tìm thấy trạng thái job. Danh sách đã được làm mới."
};

const errorMessage = (error: unknown, fallback?: string) =>
  (isApiError(error) ? jobStatusMessages[error.code] : undefined) ??
  productionErrorMessage(error, { conflict: nameConflict, fallback });

/** Colours offered to a new status: the first one no status uses yet. */
const palette: readonly ColorToken[] = [
  "blue",
  "violet",
  "amber",
  "rose",
  "teal",
  "emerald",
  "orange",
  "sky",
  "indigo",
  "pink",
  "lime",
  "cyan"
];
const suggestColor = (items: readonly JobStatus[]): ColorToken =>
  palette.find((color) => !items.some((item) => item.color === color)) ??
  palette[items.length % palette.length] ??
  "blue";

const byIds = (items: readonly JobStatus[], ids: readonly string[]) => {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length));
};

const jobCountLabel = (count: number | null) =>
  count === null ? "—" : `${formatInteger(count)} job`;

const auditLabel = (status: JobStatus, timeZone: string) => {
  const day = formatWorkDay(status.updatedAt, timeZone);
  return status.updatedBy
    ? `Sửa bởi ${status.updatedBy.displayName} · ${day}`
    : `Mặc định · ${day}`;
};

const auditTitle = (status: JobStatus, timeZone: string) =>
  `Sửa lần cuối ${formatDateTime(status.updatedAt, timeZone, true)}${
    status.updatedBy ? ` bởi ${status.updatedBy.displayName}` : " (tạo sẵn)"
  }`;

/**
 * Cấu hình → Trạng thái job (PD-038, ADMIN): the manual, ClickUp-style status people set on a job,
 * separate from the line workflow ("Trạng thái & luồng chuyển"). Add, rename in place, colour,
 * order (drag, keyboard or the row menu), "đóng" and delete; every write answers the whole catalog.
 * A status jobs use is deleted together with moving those jobs to a replacement (one request).
 *
 * Rows are one grid per status sized by the list's own width (container query, not the viewport):
 * narrow lists put the job count and the last change under the name, wide ones give them aligned
 * columns. The same elements move between both (no hidden duplicates).
 */
export const ProductionJobStatusesRoute = () => {
  const statuses = useJobStatuses();
  const mutations = useJobStatusMutations();
  const me = useProductionMe();
  const timeZone = me.data?.settings.timezone ?? FALLBACK_TIMEZONE;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newColor, setNewColor] = useState<ColorToken | null>(null);
  const [newClosed, setNewClosed] = useState(false);
  // The order being saved: the reorder answer is not optimistic, so the rows keep the drop meanwhile.
  const [order, setOrder] = useState<readonly string[] | null>(null);
  const [deleting, setDeleting] = useState<JobStatus | null>(null);

  const items = useMemo(() => statuses.data?.items ?? [], [statuses.data]);
  const rows = useMemo(() => (order ? byIds(items, order) : items), [items, order]);
  const color = newColor ?? suggestColor(items);
  const first = rows[0] ?? null;
  const validate = (exceptId: string | null) => (name: string) =>
    hasDuplicateName(items, name, exceptId) ? nameConflict : null;
  const updatingId = mutations.update.isPending ? (mutations.update.variables?.id ?? null) : null;

  const save = (status: JobStatus, input: JobStatusUpdateInput, message?: string) =>
    mutations.update.mutate(
      { id: status.id, input },
      {
        onSuccess: () => {
          if (input.name !== undefined) setEditingId(null);
          if (message) toast.success(message);
        },
        onError: (error) => toast.error(errorMessage(error))
      }
    );

  const reorder = (ordered: readonly JobStatus[]) => {
    const ids = ordered.map((status) => status.id);
    setOrder(ids);
    mutations.reorder.mutate(ids, {
      onError: (error) => toast.error(errorMessage(error, "Không lưu được thứ tự.")),
      onSettled: () => setOrder(null)
    });
  };

  const move = (status: JobStatus, delta: number) => {
    const from = rows.findIndex((row) => row.id === status.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= rows.length) return;
    reorder(moveItem(rows, from, to));
  };

  const add = (name: string) =>
    mutations.create.mutateAsync({ name, color, isClosed: newClosed }).then(
      () => {
        toast.success(`Đã thêm trạng thái ${name}`);
        setNewColor(null);
        setNewClosed(false);
        return true;
      },
      (error: unknown) => {
        toast.error(errorMessage(error));
        return false;
      }
    );

  const row = (status: JobStatus, index: number, handle: ReactNode) => {
    const editing = editingId === status.id;
    return (
      <div
        className={cn(
          "grid items-center gap-x-2 gap-y-0.5 px-3 py-2 md:px-4",
          // Narrow list: name over "N job · Sửa bởi …"; the controls span both lines.
          "grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] grid-rows-[1.5rem_auto]",
          // Wide list: one line, count and last change in fixed columns so every row lines up.
          "@2xl:grid-cols-[auto_auto_minmax(0,1fr)_4.5rem_11rem_auto_auto] @2xl:grid-rows-1 @2xl:gap-x-3"
        )}
      >
        <span className="col-start-1 row-span-2 row-start-1 flex @2xl:row-span-1">{handle}</span>
        <span className="col-start-2 row-span-2 row-start-1 flex @2xl:row-span-1">
          <ColorButton
            color={status.color}
            disabled={updatingId === status.id}
            onChange={(next) => {
              if (next !== status.color) save(status, { color: next });
            }}
            label={`Màu của trạng thái ${status.name}`}
          />
        </span>
        {editing ? (
          <InlineText
            value={status.name}
            label={`Tên mới cho trạng thái ${status.name}`}
            maxLength={jobStatusNameMaxLength}
            validate={validate(status.id)}
            pending={mutations.update.isPending}
            onSubmit={(name) => save(status, { name })}
            onCancel={() => setEditingId(null)}
            className="col-start-3 row-span-2 row-start-1 @2xl:row-span-1"
          />
        ) : (
          <button
            type="button"
            title="Bấm để đổi tên"
            onClick={() => setEditingId(status.id)}
            // Spans both lines on narrow lists: the line below is part of the ≥ 40px tap target.
            className="col-start-3 row-span-2 row-start-1 flex min-w-0 items-start self-stretch rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring @2xl:row-span-1 @2xl:items-center @2xl:self-center"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <JobStatusChip status={status} />
              {index === 0 ? (
                // Narrow lists: the name keeps the room (the line below says "Job mới" instead).
                <span
                  title="Job mới tạo bắt đầu ở trạng thái này"
                  className="hidden h-5 shrink-0 items-center rounded-full bg-muted px-2 text-[11px] font-medium text-foreground-muted @2xl:inline-flex"
                >
                  Job mới
                </span>
              ) : null}
            </span>
          </button>
        )}
        <span
          className={cn(
            "col-start-3 row-start-2 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-foreground-muted @max-2xl:pointer-events-none @2xl:contents",
            editing && "@max-2xl:hidden"
          )}
        >
          {index === 0 ? (
            <span
              title="Job mới tạo bắt đầu ở trạng thái này"
              className="shrink-0 font-medium @2xl:hidden"
            >
              Job mới ·
            </span>
          ) : null}
          <span
            title="Job đang ở trạng thái này (không tính job đã xoá)"
            className={cn(
              "shrink-0 tabular-nums @2xl:col-start-4 @2xl:row-start-1 @2xl:text-right @2xl:text-xs",
              status.jobCount === 0 && "text-foreground-subtle"
            )}
          >
            {jobCountLabel(status.jobCount)}
          </span>
          <span aria-hidden="true" className="text-foreground-subtle @2xl:hidden">
            ·
          </span>
          <span
            title={auditTitle(status, timeZone)}
            className="min-w-0 truncate text-foreground-subtle @2xl:col-start-5 @2xl:row-start-1 @2xl:text-xs"
          >
            {auditLabel(status, timeZone)}
          </span>
        </span>
        <span className="col-start-4 row-span-2 row-start-1 flex @2xl:col-start-6 @2xl:row-span-1">
          <ClosedToggle
            checked={status.isClosed}
            disabled={updatingId === status.id}
            label={`Trạng thái đóng: ${status.name}`}
            onChange={(isClosed) =>
              save(
                status,
                { isClosed },
                isClosed
                  ? `${status.name} là trạng thái đóng`
                  : `${status.name} không còn là trạng thái đóng`
              )
            }
            className="flex-col gap-1 text-[10px] leading-none @2xl:flex-row @2xl:gap-2 @2xl:text-xs"
          />
        </span>
        <span className="col-start-5 row-span-2 row-start-1 flex @2xl:col-start-7 @2xl:row-span-1">
          <RowMenu
            label={status.name}
            active
            extra={
              <>
                <DropdownMenuItem onClick={() => setEditingId(status.id)}>
                  <Pencil />
                  Đổi tên
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={index === 0 || mutations.reorder.isPending}
                  onClick={() => move(status, -1)}
                >
                  <ArrowUp />
                  Chuyển lên
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={index === rows.length - 1 || mutations.reorder.isPending}
                  onClick={() => move(status, 1)}
                >
                  <ArrowDown />
                  Chuyển xuống
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={items.length <= 1}
                  onClick={() => setDeleting(status)}
                >
                  <Trash2 />
                  Xoá
                </DropdownMenuItem>
                {items.length <= 1 ? (
                  <p className="px-1.5 pb-1 text-[11px] leading-snug text-foreground-muted">
                    Phải còn ít nhất một trạng thái.
                  </p>
                ) : null}
              </>
            }
          />
        </span>
      </div>
    );
  };

  return (
    <SettingsPage>
      <PageIntro slug="job-statuses" />
      <div className="flex flex-col gap-2">
        <InfoNote icon={CircleDot} tone="brand">
          Trạng thái job do người đặt bằng tay (giống ClickUp), riêng với luồng của dòng việc:{" "}
          <SettingsLink slug="workflow" /> của từng dòng công việc vẫn giữ nguyên. Job mới bắt đầu ở
          trạng thái đầu tiên của danh sách.
        </InfoNote>
        <InfoNote icon={LockKeyhole}>
          Ai được đổi trạng thái của job: theo quyền “Sửa” ở{" "}
          <Link
            to="/settings/roles"
            className="font-medium text-brand-text underline-offset-2 hover:underline"
          >
            Cài đặt → Vai trò & phân quyền
          </Link>{" "}
          — “Tất cả”: mọi job; “Của mình”: chỉ job mình được giao dòng việc hoặc là Leader. Quản trị
          luôn đổi được.
        </InfoNote>
      </div>
      <SettingsSection
        className="@container"
        title="Danh sách trạng thái"
        description="Kéo để sắp xếp (hoặc dùng menu ⋯ của từng dòng). Bấm vào tên để đổi tên."
        actions={
          items.length >= jobStatusLimit - 5 ? (
            <span className="text-xs whitespace-nowrap text-foreground-muted tabular-nums">
              {items.length}/{jobStatusLimit} trạng thái
            </span>
          ) : null
        }
      >
        {/* Phones: the name gets its own line, colour / "Đóng" / add button share the next one. */}
        <div className="max-sm:[&_form_[data-slot=input]]:basis-full">
          <QuickAdd
            label="Tên trạng thái mới"
            placeholder="Tên trạng thái, ví dụ: Chờ duyệt"
            buttonLabel="Thêm trạng thái"
            maxLength={jobStatusNameMaxLength}
            validate={(name) =>
              items.length >= jobStatusLimit ? limitReached : validate(null)(name)
            }
            onAdd={add}
          >
            <ColorButton color={color} onChange={setNewColor} label="Màu trạng thái mới" />
            <ClosedToggle
              checked={newClosed}
              onChange={setNewClosed}
              label="Trạng thái mới là trạng thái đóng"
              className="max-sm:mr-auto"
            />
          </QuickAdd>
        </div>
        {statuses.isPending ? (
          <RowsSkeleton rows={6} />
        ) : statuses.isError ? (
          <ErrorState size="sm" error={statuses.error} onRetry={() => void statuses.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={CircleDot}
            title="Chưa có trạng thái job"
            description="Thêm các trạng thái như Mới nhận, Đang làm, Đã giao khách để cả team cập nhật tiến độ job."
          />
        ) : (
          <SortableList
            aria-label="Trạng thái job"
            items={rows}
            disabled={mutations.reorder.isPending}
            onReorder={reorder}
            renderItem={(status, handle) =>
              row(status, rows.indexOf(status), handle({ label: `Kéo để sắp xếp ${status.name}` }))
            }
          />
        )}
        {first?.isClosed ? (
          <div className="border-t p-3">
            <InfoNote icon={TriangleAlert} tone="warning">
              Trạng thái đầu tiên (“{first.name}”) đang là trạng thái đóng: job mới tạo sẽ được coi
              là đã xong. Kéo một trạng thái đang mở lên đầu.
            </InfoNote>
          </div>
        ) : null}
        <div className="border-t p-3">
          <InfoNote icon={CircleCheck}>{closedHint}</InfoNote>
        </div>
      </SettingsSection>

      <DeleteStatusDialog
        status={deleting}
        statuses={items}
        remove={mutations.remove}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => {
          setDeleting(null);
          if (editingId === id) setEditingId(null);
        }}
        onRefresh={() => void statuses.refetch()}
      />
    </SettingsPage>
  );
};

const SettingsLink = ({ slug }: { slug: string }) => (
  <Link
    to={`/production/settings/${slug}`}
    className="font-medium text-brand-text underline-offset-2 hover:underline"
  >
    {settingsPageBySlug(slug)?.label ?? slug}
  </Link>
);

/** Swatch button + palette (same picker as tags); closes after a pick. */
const ColorButton = ({
  color,
  onChange,
  label,
  disabled
}: {
  color: ColorToken;
  onChange: (color: ColorToken) => void;
  label: string;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={`${label}: ${colorTokenLabels[color]}`}
        title={`Đổi màu (${colorTokenLabels[color]})`}
        className={cn(
          toneClass(color),
          "flex size-8 shrink-0 items-center justify-center rounded-lg border outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 max-sm:size-10"
        )}
      >
        <span
          aria-hidden="true"
          className="size-4 rounded-full bg-(--tone) ring-1 ring-foreground/10"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <span className="text-xs font-medium text-foreground-muted">{label}</span>
        <ColorSwatchPicker
          aria-label={label}
          value={color}
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
          // Portaled out of the page: phones need the 40px swatches here too.
          className="max-sm:[&_button]:size-10"
        />
      </PopoverContent>
    </Popover>
  );
};

const ClosedToggle = ({
  checked,
  onChange,
  label,
  disabled,
  className
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) => {
  // Base UI names a switch after its wrapping <label> ("Đóng" on every row) and ignores aria-label:
  // point it at the full name instead.
  const labelId = useId();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <label
            className={cn(
              "flex shrink-0 cursor-pointer items-center justify-center gap-2 text-xs text-foreground-muted select-none max-sm:min-h-10 max-sm:min-w-10",
              className
            )}
          />
        }
      >
        <span id={labelId} className="sr-only">
          {label}
        </span>
        <Switch
          size="sm"
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-labelledby={labelId}
        />
        <span aria-hidden="true">Đóng</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{closedHint}</TooltipContent>
    </Tooltip>
  );
};

type RemoveMutation = ReturnType<typeof useJobStatusMutations>["remove"];

type DeleteDialogProps = {
  status: JobStatus | null;
  statuses: readonly JobStatus[];
  remove: RemoveMutation;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onRefresh: () => void;
};

/**
 * Delete one status. Unused: a plain confirm. Used by jobs: a replacement is required and the jobs
 * move with the delete (one request, one history row per job). Counts can be stale (another Admin,
 * or deleted jobs that keep the status): 409 JOB_STATUS_IN_USE turns the confirm into the
 * replacement form. A bottom sheet on phones.
 */
const DeleteStatusDialog = ({ status, onClose, remove, ...rest }: DeleteDialogProps) => {
  // Keep the wording while the dialog animates out.
  const [shown, setShown] = useState(status);
  if (status && status !== shown) setShown(status);
  return (
    <Dialog
      open={status !== null}
      onOpenChange={(open) => !open && !remove.isPending && onClose()}
      onOpenChangeComplete={(open) => {
        if (!open) setShown(null);
      }}
    >
      <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
        {shown ? (
          <DeleteStatusForm
            key={shown.id}
            status={shown}
            remove={remove}
            onClose={onClose}
            {...rest}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const DeleteStatusForm = ({
  status,
  statuses,
  remove,
  onClose,
  onDeleted,
  onRefresh
}: Omit<DeleteDialogProps, "status"> & { status: JobStatus }) => {
  const ids = useId();
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [inUse, setInUse] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live row (refetched after a 409) for the count; the snapshot once it is gone.
  const current = statuses.find((item) => item.id === status.id) ?? status;
  const count = current.jobCount ?? 0;
  const needsReplacement = count > 0 || inUse;
  const others = statuses.filter((item) => item.id !== status.id);
  const replacement = others.find((item) => item.id === replacementId) ?? null;
  const pending = remove.isPending;

  const submit = () => {
    if (needsReplacement && !replacement) {
      setMissing(true);
      return;
    }
    setError(null);
    remove.mutate(
      { id: status.id, replacementId: needsReplacement ? (replacement?.id ?? null) : null },
      {
        onSuccess: (result) => {
          toast.success(
            result.movedJobs > 0 && replacement
              ? `Đã xoá trạng thái ${status.name} · ${formatInteger(result.movedJobs)} job chuyển sang ${replacement.name}`
              : `Đã xoá trạng thái ${status.name}`
          );
          onDeleted(status.id);
        },
        onError: (failure) => {
          const code = isApiError(failure) ? failure.code : null;
          if (code === "JOB_STATUS_IN_USE") {
            // The counts were stale: ask for a replacement and refresh them.
            setInUse(true);
            onRefresh();
            return;
          }
          if (code === "JOB_STATUS_REPLACEMENT_INVALID") {
            setReplacementId(null);
            onRefresh();
          }
          if (code === "JOB_STATUS_NOT_FOUND" || code === "JOB_STATUS_LAST") {
            toast.error(errorMessage(failure));
            onRefresh();
            onClose();
            return;
          }
          setError(errorMessage(failure));
        }
      }
    );
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle className="pr-8 leading-snug wrap-anywhere">
          Xoá trạng thái “{status.name}”?
        </DialogTitle>
        <DialogDescription>
          {needsReplacement
            ? "Các job đang ở trạng thái này được chuyển sang trạng thái bạn chọn, cùng lúc với việc xoá."
            : "Chưa có job nào ở trạng thái này."}{" "}
          Không khôi phục được; lịch sử job vẫn ghi tên cũ.
        </DialogDescription>
      </DialogHeader>
      {needsReplacement ? (
        <>
          <InfoNote icon={ArrowRightLeft} tone="warning">
            {count > 0 ? (
              <>
                <span className="font-semibold">{formatInteger(count)} job</span> đang ở trạng thái{" "}
                <JobStatusChip status={current} className="max-w-48 align-middle" /> sẽ chuyển sang
                trạng thái được chọn.
              </>
            ) : (
              <>
                Trạng thái này vẫn còn job (số liệu vừa thay đổi, hoặc có job đã xoá còn giữ trạng
                thái này). Các job đó sẽ chuyển sang trạng thái được chọn.
              </>
            )}
          </InfoNote>
          <Field data-invalid={missing || undefined}>
            <FieldLabel htmlFor={`${ids}-replacement`}>Chuyển job sang</FieldLabel>
            <Select
              items={others.map((item) => ({ value: item.id, label: item.name }))}
              value={replacementId}
              disabled={pending}
              onValueChange={(next: string | null) => {
                setReplacementId(next);
                setMissing(false);
              }}
            >
              <SelectTrigger
                id={`${ids}-replacement`}
                aria-label="Chuyển job sang trạng thái"
                aria-invalid={missing || undefined}
                className="w-full min-w-0"
              >
                <SelectValue>
                  {replacement ? (
                    <JobStatusChip status={replacement} />
                  ) : (
                    <span className="truncate text-muted-foreground">Chọn trạng thái</span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72 max-w-[min(22rem,var(--available-width))]">
                {others.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <JobStatusChip status={item} className="max-w-52" />
                    {item.jobCount !== null ? (
                      <span className="ml-auto pl-3 text-xs text-foreground-subtle tabular-nums">
                        {jobCountLabel(item.jobCount)}
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {missing ? <FieldError>Chọn trạng thái thay thế.</FieldError> : null}
          </Field>
        </>
      ) : null}
      <FormAlert>{error}</FormAlert>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? <Spinner /> : <Trash2 />}
          {needsReplacement ? "Chuyển job và xoá" : "Xoá trạng thái"}
        </Button>
      </DialogFooter>
    </form>
  );
};
