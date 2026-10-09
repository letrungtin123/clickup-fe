import { cn } from "cn";
import { CheckCircle2, Sparkles } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ApplyDefaultKpiResult } from "@/contracts/production-scores";

import { FormAlert } from "../../components/settings-kit";
import { useProductionSettings } from "../../hooks";
import { scoreErrorMessage } from "../../scores/errors";
import { periodLabel } from "../../scores/periods";
import { sheetOnPhone } from "../../ui";
import { useApplyDefaultKpi } from "../hooks";
import { formatTarget } from "../matrix";

/**
 * "Áp KPI mặc định theo role" (SPEC Phase 3 §5, PLAN §10): every STAFF/LEADER/QC member without a
 * monthly target in force for the period gets settings.kpiDefaultLeader (LEADER) or
 * kpiDefaultMember. Existing targets are never overwritten. Two steps: review, then confirm.
 */
export const KpiDefaultsDialog = ({
  open,
  onOpenChange,
  periods,
  defaultPeriod,
  names
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: readonly string[];
  defaultPeriod: string;
  /** userId → display name, for the summary. */
  names: ReadonlyMap<string, string>;
}) => {
  const ids = useId();
  const settings = useProductionSettings(open);
  const apply = useApplyDefaultKpi();
  const [period, setPeriod] = useState(defaultPeriod);
  const [result, setResult] = useState<ApplyDefaultKpiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = periods.map((item) => ({ value: item, label: periodLabel(item) }));
  const chosen = periods.includes(period) ? period : defaultPeriod;

  const close = (next: boolean) => {
    if (!next) {
      setResult(null);
      setError(null);
      setPeriod(defaultPeriod);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
        <DialogHeader>
          <DialogTitle>Áp KPI mặc định theo role</DialogTitle>
          <DialogDescription>
            Tạo KPI tháng cho mọi người (Nhân viên, QC, Leader) chưa có chỉ tiêu ở kỳ đã chọn. Người đã
            có KPI giữ nguyên.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div role="status" className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-lg bg-success-soft px-3 py-3">
              <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
              <p className="text-[13px]">
                Đã tạo <span className="font-semibold">{result.created}</span> KPI cho{" "}
                {periodLabel(result.period).toLocaleLowerCase("vi")}; bỏ qua {result.skipped} người đã
                có KPI.
              </p>
            </div>
            {result.items.length > 0 ? (
              <ul className="flex max-h-56 flex-col divide-y overflow-y-auto rounded-lg border">
                {result.items.map((item) => (
                  <li key={item.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <span className="truncate">{names.get(item.userId) ?? "Thành viên"}</span>
                    <span className="font-medium tabular-nums">{formatTarget(item.targetPoints)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel id={`${ids}-period`}>Áp dụng từ kỳ</FieldLabel>
              <Select
                items={items}
                value={chosen}
                onValueChange={(next: string | null) => {
                  if (next) setPeriod(next);
                }}
              >
                <SelectTrigger aria-labelledby={`${ids}-period`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <DefaultValue label="Nhân viên, QC" value={settings.data?.kpiDefaultMember} pending={settings.isPending} />
              <DefaultValue label="Leader" value={settings.data?.kpiDefaultLeader} pending={settings.isPending} />
            </div>
            <p className="text-xs text-foreground-muted">
              Mức mặc định đổi ở Cấu hình › Cài đặt chung. Sau khi áp, sửa lẻ từng người trên bảng KPI.
            </p>
            <FormAlert>{error}</FormAlert>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => close(false)}>Xong</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => close(false)} disabled={apply.isPending}>
                Hủy
              </Button>
              <Button
                disabled={apply.isPending}
                onClick={() => {
                  setError(null);
                  apply.mutate(chosen, {
                    onSuccess: setResult,
                    onError: (failure) => setError(scoreErrorMessage(failure))
                  });
                }}
              >
                {apply.isPending ? <Spinner /> : <Sparkles />}
                Áp cho {periodLabel(chosen).toLocaleLowerCase("vi")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DefaultValue = ({
  label,
  value,
  pending
}: {
  label: string;
  value: number | undefined;
  pending: boolean;
}) => (
  <div className="flex flex-col gap-0.5 rounded-lg border px-3 py-2">
    <span className="text-xs text-foreground-muted">{label}</span>
    {pending ? (
      <Skeleton className="h-5 w-16" />
    ) : (
      <span className="text-sm font-semibold tabular-nums">
        {value === undefined ? "—" : `${formatTarget(value)} điểm`}
      </span>
    )}
  </div>
);
