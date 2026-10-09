import { cn } from "cn";
import { Flag, GitBranch, Plus } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ColorSwatchPicker } from "@/components/shared/radio-controls";
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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { ProductionRole, ProductionStatus } from "@/contracts/production-catalog";
import type { ColorToken } from "@/contracts/work";
import { RoleBadges, RoleToggleGroup } from "@/features/production/components/role-chips";
import {
  ActiveState,
  ArchivedToggle,
  FormAlert,
  PageIntro,
  RowMenu,
  RowsSkeleton,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { SortableList } from "@/features/production/components/sortable-list";
import { TransitionsEditor } from "@/features/production/components/transitions-editor";
import { productionErrorMessage, toastProductionError } from "@/features/production/errors";
import { useReorderStatuses, useStatusMutations, useWorkflow } from "@/features/production/hooks";
import {
  orderedStatuses,
  STATUS_CODE_PATTERN,
  statusCodeFrom,
  statusOrderIds
} from "@/features/production/workflow";
import { toneClass } from "@/lib/colors";
import { sheetOnPhone } from "@/features/production/ui";

const codeConflict = "Mã trạng thái đã tồn tại. Hãy chọn mã khác.";

const Flags = ({ status }: { status: ProductionStatus }) => {
  const flags = [
    status.isInitial && { label: "Bắt đầu", className: "bg-muted text-foreground-muted" },
    status.countsDone && { label: "Ghi điểm NV", className: "bg-brand-soft text-brand-text" },
    status.countsChecked && { label: "Ghi điểm QC", className: "bg-success-soft text-success" },
    status.isTerminal && { label: "Kết thúc", className: "bg-warning-soft text-foreground" }
  ].filter((flag): flag is { label: string; className: string } => Boolean(flag));
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag.label}
          className={cn(
            "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
            flag.className
          )}
        >
          {flag.label}
        </span>
      ))}
    </span>
  );
};

/**
 * Task statuses and transitions (PLAN §4/§9). Flags decide when scores are written: `countsDone`
 * credits the worker, `countsChecked` the QC. Statuses are archived, never deleted.
 */
export const ProductionWorkflowRoute = () => {
  const workflow = useWorkflow();
  const reorder = useReorderStatuses();
  const mutations = useStatusMutations();
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<{ status: ProductionStatus | null } | null>(null);

  const statuses = useMemo(() => orderedStatuses(workflow.data?.statuses ?? []), [workflow.data]);
  const active = statuses.filter((status) => status.active);
  const archived = statuses.filter((status) => !status.active);

  const toggleActive = (status: ProductionStatus) =>
    mutations.update.mutate(
      {
        id: status.id,
        input: {
          code: status.code,
          name: status.name,
          color: status.color,
          countsDone: status.countsDone,
          countsChecked: status.countsChecked,
          isTerminal: status.isTerminal,
          setByRoles: status.setByRoles,
          active: !status.active
        }
      },
      {
        onSuccess: () =>
          toast.success(
            status.active ? `Đã lưu trữ trạng thái ${status.name}` : `Đã khôi phục ${status.name}`
          ),
        onError: (error) => toastProductionError(error, { conflict: codeConflict })
      }
    );

  const row = (status: ProductionStatus, handle?: ReactNode) => (
    <div
      className={cn("flex items-center gap-2 px-3 py-2.5 md:px-4", !status.active && "bg-muted/30")}
    >
      {handle ?? <span className="size-6 shrink-0" aria-hidden="true" />}
      <button
        type="button"
        onClick={() => setDialog({ status })}
        className="flex min-w-0 flex-1 flex-col gap-1.5 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-row md:items-center md:gap-3"
      >
        <span className="flex min-w-0 items-center gap-2 md:w-56 md:shrink-0">
          <span
            className={cn(
              toneClass(status.color),
              "inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md bg-(--tone-soft) px-2 text-xs font-semibold text-(--tone-text)"
            )}
          >
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-(--tone)" />
            <span className="truncate">{status.name}</span>
          </span>
          <code className="truncate font-mono text-[11px] text-foreground-subtle">
            {status.code}
          </code>
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <Flags status={status} />
          {status.setByRoles.length > 0 ? (
            <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
              Ai được đặt: <RoleBadges roles={status.setByRoles} />
            </span>
          ) : null}
        </span>
      </button>
      {!status.active ? <ActiveState active={false} className="hidden sm:inline-flex" /> : null}
      <RowMenu
        label={status.name}
        active={status.active}
        onEdit={() => setDialog({ status })}
        onToggleActive={() => toggleActive(status)}
      />
    </div>
  );

  return (
    <SettingsPage>
      <PageIntro
        slug="workflow"
        actions={
          <Button onClick={() => setDialog({ status: null })}>
            <Plus />
            Thêm trạng thái
          </Button>
        }
      />
      {workflow.isPending ? (
        <SettingsSection title="Trạng thái">
          <RowsSkeleton rows={6} />
        </SettingsSection>
      ) : workflow.isError ? (
        <ErrorState error={workflow.error} onRetry={() => void workflow.refetch()} />
      ) : (
        <>
          <SettingsSection
            title="Trạng thái"
            description="Kéo để sắp xếp thứ tự trên bảng task. Cờ quyết định thời điểm ghi điểm."
            actions={
              <ArchivedToggle
                checked={showArchived}
                onChange={setShowArchived}
                count={archived.length}
              />
            }
          >
            {statuses.length === 0 ? (
              <EmptyState size="sm" icon={Flag} title="Chưa có trạng thái" />
            ) : (
              <>
                <SortableList
                  aria-label="Trạng thái đang dùng"
                  items={active}
                  disabled={reorder.isPending}
                  onReorder={(ordered) =>
                    reorder.mutate(statusOrderIds(ordered, statuses), {
                      onError: (error) =>
                        toast.error(
                          productionErrorMessage(error, { fallback: "Không lưu được thứ tự." })
                        )
                    })
                  }
                  renderItem={(status, handle) =>
                    row(status, handle({ label: `Kéo để sắp xếp ${status.name}` }))
                  }
                />
                {showArchived && archived.length > 0 ? (
                  <ul aria-label="Trạng thái đã lưu trữ" className="divide-y border-t">
                    {archived.map((status) => (
                      <li key={status.id}>{row(status)}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </SettingsSection>

          {statuses.length >= 2 ? (
            <TransitionsEditor workflow={workflow.data} />
          ) : (
            <SettingsSection title="Luồng chuyển">
              <EmptyState
                size="sm"
                icon={GitBranch}
                title="Cần ít nhất hai trạng thái để tạo luồng chuyển"
              />
            </SettingsSection>
          )}
        </>
      )}

      <StatusDialog
        key={dialog?.status?.id ?? "new"}
        open={dialog !== null}
        status={dialog?.status ?? null}
        statuses={statuses}
        onClose={() => setDialog(null)}
      />
    </SettingsPage>
  );
};

const FlagSwitch = ({
  checked,
  onChange,
  title,
  hint
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  hint: string;
}) => (
  <label className="flex items-start gap-3 rounded-lg border p-3">
    <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    <span className="flex flex-col gap-0.5">
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-foreground-muted">{hint}</span>
    </span>
  </label>
);

const StatusDialog = ({
  open,
  status,
  statuses,
  onClose
}: {
  open: boolean;
  status: ProductionStatus | null;
  statuses: readonly ProductionStatus[];
  onClose: () => void;
}) => {
  const ids = useId();
  const mutations = useStatusMutations();
  const [name, setName] = useState(status?.name ?? "");
  const [code, setCode] = useState(status?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(Boolean(status));
  const [color, setColor] = useState<ColorToken>(status?.color ?? "sky");
  const [countsDone, setCountsDone] = useState(status?.countsDone ?? false);
  const [countsChecked, setCountsChecked] = useState(status?.countsChecked ?? false);
  const [isTerminal, setIsTerminal] = useState(status?.isTerminal ?? false);
  const [setByRoles, setSetByRoles] = useState<ProductionRole[]>(status?.setByRoles ?? []);
  const [errors, setErrors] = useState<{ name?: string | undefined; code?: string | undefined }>(
    {}
  );
  const [formError, setFormError] = useState<string | null>(null);
  const pending = mutations.create.isPending || mutations.update.isPending;
  const codeValue = codeTouched ? code : statusCodeFrom(name);

  const submit = () => {
    const problems: typeof errors = {};
    if (!name.trim()) problems.name = "Nhập tên trạng thái.";
    if (!STATUS_CODE_PATTERN.test(codeValue)) {
      problems.code = "Mã gồm chữ in hoa A–Z, số và _, bắt đầu bằng chữ, 2–40 ký tự.";
    } else if (statuses.some((item) => item.code === codeValue && item.id !== status?.id)) {
      problems.code = codeConflict;
    }
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const input = {
      code: codeValue,
      name: name.trim(),
      color,
      countsDone,
      countsChecked,
      isTerminal,
      setByRoles
    };
    const callbacks = {
      onSuccess: () => {
        toast.success(
          status ? `Đã cập nhật trạng thái ${input.name}` : `Đã thêm trạng thái ${input.name}`
        );
        onClose();
      },
      onError: (failure: unknown) =>
        setFormError(productionErrorMessage(failure, { conflict: codeConflict }))
    };
    if (status) mutations.update.mutate({ id: status.id, input }, callbacks);
    else mutations.create.mutate(input, callbacks);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl",
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
              {status ? `Sửa trạng thái ${status.name}` : "Thêm trạng thái"}
            </DialogTitle>
            <DialogDescription>
              Trạng thái mới được thêm vào cuối danh sách; sau đó tạo luồng chuyển tới và đi từ
              trạng thái này.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor={`${ids}-name`}>Tên hiển thị</FieldLabel>
                <Input
                  id={`${ids}-name`}
                  autoFocus
                  value={name}
                  maxLength={80}
                  aria-invalid={Boolean(errors.name)}
                  onChange={(event) => {
                    setName(event.target.value);
                    setErrors((current) => ({ ...current, name: undefined }));
                  }}
                />
                {errors.name ? <FieldError>{errors.name}</FieldError> : null}
              </Field>
              <Field data-invalid={Boolean(errors.code)}>
                <FieldLabel htmlFor={`${ids}-code`}>Mã</FieldLabel>
                <Input
                  id={`${ids}-code`}
                  value={codeValue}
                  maxLength={40}
                  disabled={status !== null}
                  className="font-mono uppercase"
                  aria-invalid={Boolean(errors.code)}
                  onChange={(event) => {
                    setCodeTouched(true);
                    setCode(event.target.value.toUpperCase());
                    setErrors((current) => ({ ...current, code: undefined }));
                  }}
                />
                {errors.code ? (
                  <FieldError>{errors.code}</FieldError>
                ) : (
                  <FieldDescription className="text-xs">
                    {status
                      ? "Mã cố định sau khi tạo (dùng trong quy tắc và lịch sử)."
                      : "Tự sinh từ tên, có thể sửa."}
                  </FieldDescription>
                )}
              </Field>
            </div>
            <Field>
              <FieldLabel id={`${ids}-color`}>Màu</FieldLabel>
              <ColorSwatchPicker
                aria-labelledby={`${ids}-color`}
                value={color}
                onChange={setColor}
              />
            </Field>
            <div className="grid gap-2 sm:grid-cols-3">
              <FlagSwitch
                checked={countsDone}
                onChange={setCountsDone}
                title="Ghi điểm NV"
                hint="Vào trạng thái này thì ghi điểm cho người làm."
              />
              <FlagSwitch
                checked={countsChecked}
                onChange={setCountsChecked}
                title="Ghi điểm QC"
                hint="Vào trạng thái này thì ghi điểm QC cho người kiểm."
              />
              <FlagSwitch
                checked={isTerminal}
                onChange={setIsTerminal}
                title="Kết thúc"
                hint="Trạng thái cuối, task không còn việc."
              />
            </div>
            <Field>
              <FieldLabel id={`${ids}-roles`}>Ai được đặt trạng thái này</FieldLabel>
              <RoleToggleGroup
                aria-label="Vai trò được đặt trạng thái"
                value={setByRoles}
                onChange={setSetByRoles}
                className="max-sm:[&_button]:h-9"
              />
              <FieldDescription className="text-xs">
                Để trống nếu chỉ hệ thống tự chuyển (ví dụ Chờ QC). Luồng chuyển bên dưới giới hạn
                thêm theo người liên quan tới task.
              </FieldDescription>
            </Field>
            <FormAlert>{formError}</FormAlert>
          </div>
          <DialogFooter className="mx-0 mb-0 px-4 py-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {status ? "Lưu thay đổi" : "Thêm trạng thái"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
