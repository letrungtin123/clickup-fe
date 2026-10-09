import { cn } from "cn";
import { CalendarClock, Clock, Coins, Plus, Sparkles } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/shared/radio-controls";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { PayMode, Shift } from "@/contracts/production-catalog";
import { hasDuplicateName, nextSortOrder } from "@/features/production/catalog";
import {
  ArchivedToggle,
  ActiveState,
  FormAlert,
  PageIntro,
  RowMenu,
  RowsSkeleton,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { SortableList } from "@/features/production/components/sortable-list";
import { productionErrorMessage, toastProductionError } from "@/features/production/errors";
import { useReorderShifts, useShiftMutations, useShifts } from "@/features/production/hooks";
import { sheetOnPhone } from "@/features/production/ui";

const conflict = "Đã có ca làm cùng tên (không phân biệt hoa thường).";

const payModeLabels: Record<PayMode, string> = {
  POINTS: "Tính điểm",
  MONEY_IF_KPI: "Khoán"
};

const payModeHelp: Record<PayMode, string> = {
  POINTS: "Chỉ ghi credit và cộng vào KPI tháng (ca chính thức, OT).",
  MONEY_IF_KPI:
    "Hiện song song credit và tiền tạm tính; ngày chốt KPI quyết định nhận tiền (đủ KPI) hay quy về điểm."
};

/** Work shifts and how they pay (PLAN §5): points, or money if the monthly KPI is met. */
export const ProductionShiftsRoute = () => {
  const shifts = useShifts();
  const mutations = useShiftMutations();
  const reorder = useReorderShifts();
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<{ shift: Shift | null } | null>(null);

  const items = useMemo(() => shifts.data?.items ?? [], [shifts.data]);
  const active = useMemo(
    () => items.filter((item) => item.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [items]
  );
  const archived = items.filter((item) => !item.active);

  const toggleActive = (shift: Shift) =>
    mutations.update.mutate(
      { id: shift.id, input: { name: shift.name, payMode: shift.payMode, active: !shift.active } },
      {
        onSuccess: () =>
          toast.success(
            shift.active ? `Đã lưu trữ ca ${shift.name}` : `Đã khôi phục ca ${shift.name}`
          ),
        onError: (error) => toastProductionError(error, { conflict })
      }
    );

  const row = (shift: Shift, handle?: ReactNode) => (
    <div
      className={cn("flex items-center gap-2 px-3 py-2.5 md:px-4", !shift.active && "bg-muted/30")}
    >
      {handle ?? <span className="size-6 shrink-0" aria-hidden="true" />}
      <button
        type="button"
        onClick={() => setDialog({ shift })}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-3"
      >
        <span
          className={cn(
            "truncate text-[13px] font-medium",
            !shift.active && "text-foreground-muted"
          )}
        >
          {shift.name}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium",
              shift.payMode === "POINTS"
                ? "bg-brand-soft text-brand-text"
                : "bg-warning-soft text-foreground"
            )}
          >
            {shift.payMode === "POINTS" ? (
              <Sparkles className="size-3" aria-hidden="true" />
            ) : (
              <Coins className="size-3 text-warning" aria-hidden="true" />
            )}
            {payModeLabels[shift.payMode]}
          </span>
          {shift.requiresOtHours ? (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-2 text-[11px] font-medium text-foreground-muted">
              <Clock className="size-3" aria-hidden="true" />
              Nhập giờ OT
            </span>
          ) : null}
        </span>
      </button>
      {!shift.active ? <ActiveState active={false} className="hidden sm:inline-flex" /> : null}
      <RowMenu
        label={shift.name}
        active={shift.active}
        onEdit={() => setDialog({ shift })}
        onToggleActive={() => toggleActive(shift)}
      />
    </div>
  );

  return (
    <SettingsPage>
      <PageIntro
        slug="shifts"
        actions={
          <Button onClick={() => setDialog({ shift: null })}>
            <Plus />
            Thêm ca
          </Button>
        }
      />
      <SettingsSection
        title="Danh sách ca"
        description="Kéo để sắp xếp thứ tự trong form chia task."
        actions={
          <ArchivedToggle
            checked={showArchived}
            onChange={setShowArchived}
            count={archived.length}
          />
        }
      >
        {shifts.isPending ? (
          <RowsSkeleton rows={3} />
        ) : shifts.isError ? (
          <ErrorState size="sm" error={shifts.error} onRetry={() => void shifts.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            size="sm"
            icon={CalendarClock}
            title="Chưa có ca làm"
            description="Thêm ca chính thức, OT (tính điểm) và ca khoán (tiền nếu đạt KPI)."
            action={
              <Button size="sm" onClick={() => setDialog({ shift: null })}>
                <Plus />
                Thêm ca
              </Button>
            }
          />
        ) : (
          <>
            <SortableList
              aria-label="Ca đang dùng"
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
              renderItem={(shift, handle) =>
                row(shift, handle({ label: `Kéo để sắp xếp ${shift.name}` }))
              }
            />
            {showArchived && archived.length > 0 ? (
              <ul aria-label="Ca đã lưu trữ" className="divide-y border-t">
                {archived.map((shift) => (
                  <li key={shift.id}>{row(shift)}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </SettingsSection>

      <ShiftDialog
        key={dialog?.shift?.id ?? "new"}
        open={dialog !== null}
        shift={dialog?.shift ?? null}
        shifts={items}
        onClose={() => setDialog(null)}
        sortOrder={nextSortOrder(active)}
      />
    </SettingsPage>
  );
};

const ShiftDialog = ({
  open,
  shift,
  shifts,
  sortOrder,
  onClose
}: {
  open: boolean;
  shift: Shift | null;
  shifts: readonly Shift[];
  sortOrder: number;
  onClose: () => void;
}) => {
  const ids = useId();
  const mutations = useShiftMutations();
  const [name, setName] = useState(shift?.name ?? "");
  const [payMode, setPayMode] = useState<PayMode>(shift?.payMode ?? "POINTS");
  const [requiresOtHours, setRequiresOtHours] = useState(shift?.requiresOtHours ?? false);
  const [error, setError] = useState<string | null>(null);
  const pending = mutations.create.isPending || mutations.update.isPending;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nhập tên ca.");
      return;
    }
    if (hasDuplicateName(shifts, trimmed, shift?.id)) {
      setError(conflict);
      return;
    }
    const callbacks = {
      onSuccess: () => {
        toast.success(shift ? `Đã cập nhật ca ${trimmed}` : `Đã thêm ca ${trimmed}`);
        onClose();
      },
      onError: (failure: unknown) => setError(productionErrorMessage(failure, { conflict }))
    };
    if (shift) {
      mutations.update.mutate(
        { id: shift.id, input: { name: trimmed, payMode, requiresOtHours } },
        callbacks
      );
    } else {
      mutations.create.mutate({ name: trimmed, payMode, requiresOtHours, sortOrder }, callbacks);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{shift ? `Sửa ca ${shift.name}` : "Thêm ca làm"}</DialogTitle>
            <DialogDescription>
              Cách tính công áp dụng cho task được giao ở ca này; điểm đã ghi không đổi khi sửa.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(error && !name.trim())}>
            <FieldLabel htmlFor={`${ids}-name`}>Tên ca</FieldLabel>
            <Input
              id={`${ids}-name`}
              autoFocus
              value={name}
              maxLength={80}
              placeholder="Ví dụ: Chính thức"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </Field>
          <Field>
            <FieldLabel id={`${ids}-mode`}>Cách tính</FieldLabel>
            <SegmentedControl<PayMode>
              aria-labelledby={`${ids}-mode`}
              value={payMode}
              onChange={setPayMode}
              className="w-full"
              options={[
                { value: "POINTS", label: payModeLabels.POINTS, icon: Sparkles },
                { value: "MONEY_IF_KPI", label: payModeLabels.MONEY_IF_KPI, icon: Coins }
              ]}
            />
            <FieldDescription className="text-xs">{payModeHelp[payMode]}</FieldDescription>
          </Field>
          <label className="flex items-start gap-3 rounded-lg border p-3">
            <Switch
              checked={requiresOtHours}
              onCheckedChange={setRequiresOtHours}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Yêu cầu nhập giờ OT</span>
              <span className="text-xs text-foreground-muted">
                Nhân viên nhập số giờ OT khi chuyển task sang Done; dùng cho báo cáo tổng giờ OT.
              </span>
            </span>
          </label>
          <FormAlert>{error}</FormAlert>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {shift ? "Lưu thay đổi" : "Thêm ca"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
