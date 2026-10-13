import { cn } from "cn";
import { CheckCircle2, HandCoins, Play, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "@/components/shared/router-link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { KhoanPayPolicy } from "@/contracts/production-catalog";
import {
  closeDayOfPeriod,
  kpiPeriodRange,
  type KpiCloseDays,
  type KpiSettlementRunResult
} from "@/contracts/production-scores";

import { ConfirmDialog, FormAlert, InfoNote } from "../../components/settings-kit";
import { closeDayLabel, formatCredit, formatInteger, formatMoney } from "../../format";
import { scoreErrorMessage } from "../../scores/errors";
import { Panel } from "../../scores/components/kit";
import { formatDayRange, periodLabel, periodsBetween, shiftPeriod } from "../../scores/periods";
import { useRunKpiSettlement } from "../hooks";
import { khoanPolicyMeta, khoanPolicyRule } from "../khoan-policy";

/**
 * Manual KPI settlement (SPEC Phase 6 §5): pick a period, give a mandatory reason, confirm. The
 * period's current results are replaced (idempotent: same inputs give the same numbers) and members
 * plus admins are notified. The run uses the Khoán pay policy of the settings (PD-033): to compare
 * both, switch it in Cài đặt chung and run the period again — the history keeps every run's policy.
 */
export const SettlementRunPanel = ({
  currentPeriod,
  closeDays,
  khoanPolicy,
  onDone
}: {
  currentPeriod: string;
  /** settings.kpiCloseDays (closeDaysOf): each period keeps the close day in force for it. */
  closeDays: KpiCloseDays;
  /** settings.khoanPayPolicy: the policy the next run uses. */
  khoanPolicy: KhoanPayPolicy;
  /** Called with the settled period (the page shows its report). */
  onDone: (period: string) => void;
}) => {
  const ids = useId();
  const run = useRunKpiSettlement();
  const periods = periodsBetween(shiftPeriod(currentPeriod, -23), currentPeriod).reverse();
  const items = periods.map((period) => ({
    value: period,
    label: period === currentPeriod ? `${periodLabel(period)} (đang chạy)` : periodLabel(period)
  }));
  const [period, setPeriod] = useState(shiftPeriod(currentPeriod, -1));
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<KpiSettlementRunResult | null>(null);
  const range = kpiPeriodRange(period, closeDays);
  const closeDay = closeDayOfPeriod(closeDays, currentPeriod);

  const review = () => {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setReasonError("Nhập lý do (ít nhất 3 ký tự).");
      return;
    }
    if (trimmed.length > 500) {
      setReasonError("Lý do tối đa 500 ký tự.");
      return;
    }
    setError(null);
    setConfirming(true);
  };

  const submit = () => {
    run.mutate(
      { period, reason: reason.trim() },
      {
        onSuccess: (value) => {
          setConfirming(false);
          setResult(value);
          setReason("");
          toast.success(`Đã chốt KPI ${periodLabel(value.run.period).toLocaleLowerCase("vi")}`);
          onDone(value.run.period);
        },
        onError: (failure) => {
          setConfirming(false);
          setError(scoreErrorMessage(failure));
        }
      }
    );
  };

  return (
    <Panel
      title="Chạy chốt KPI"
      description={`Hệ thống tự chốt lúc 23:59 ngày chốt của mỗi kỳ (kỳ đang chạy: ${closeDayLabel(closeDay)}). Chạy tay khi cần sửa kết quả của một kỳ.`}
      bodyClassName="flex flex-col gap-4 p-4"
    >
      <InfoNote icon={HandCoins}>
        Tiền Khoán:{" "}
        <span className="font-medium text-foreground">{khoanPolicyMeta[khoanPolicy].label}</span> —{" "}
        {khoanPolicyRule(khoanPolicy)}. Muốn so sánh, đổi ở{" "}
        <Link
          to="/production/settings/general"
          className="font-medium text-brand-text underline-offset-2 hover:underline"
        >
          Cài đặt chung
        </Link>{" "}
        rồi chạy lại kỳ.
      </InfoNote>
      <form
        noValidate
        className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"
        onSubmit={(event) => {
          event.preventDefault();
          review();
        }}
      >
        <Field>
          <FieldLabel id={`${ids}-period`}>Kỳ cần chốt</FieldLabel>
          <Select
            items={items}
            value={period}
            onValueChange={(next: string | null) => {
              if (next) {
                setPeriod(next);
                setResult(null);
              }
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
          <FieldDescription className="text-xs tabular-nums">
            {formatDayRange(range.from, range.to)}
          </FieldDescription>
        </Field>
        <Field data-invalid={Boolean(reasonError)}>
          <FieldLabel htmlFor={`${ids}-reason`}>Lý do chạy lại (bắt buộc)</FieldLabel>
          <Textarea
            id={`${ids}-reason`}
            rows={2}
            maxLength={500}
            value={reason}
            aria-invalid={Boolean(reasonError)}
            placeholder="Ví dụ: Leader sửa số lượng task sau ngày chốt"
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(null);
            }}
            className="min-h-16"
          />
          {reasonError ? <FieldError className="text-xs">{reasonError}</FieldError> : null}
        </Field>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          {period === currentPeriod ? (
            <InfoNote icon={TriangleAlert} tone="warning" className="min-w-60 flex-1">
              Kỳ này chưa tới ngày chốt; kết quả sẽ được tính với số liệu tới hiện tại và bị thay
              thế khi hệ thống tự chốt.
            </InfoNote>
          ) : (
            <span className="min-w-60 flex-1 text-xs text-foreground-muted">
              Kết quả cũ của kỳ (nếu có) sẽ được thay thế và lưu lại trong lịch sử.
            </span>
          )}
          <Button type="submit" disabled={run.isPending}>
            {run.isPending ? <Spinner /> : <Play />}
            Chạy chốt {periodLabel(period).toLocaleLowerCase("vi")}
          </Button>
        </div>
      </form>
      <FormAlert>{error}</FormAlert>
      {result ? <RunResult result={result} /> : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !open && !run.isPending && setConfirming(false)}
        title={`Chốt KPI ${periodLabel(period).toLocaleLowerCase("vi")}?`}
        description={
          <>
            Tính lại cho mọi người có điểm hoặc KPI trong kỳ {formatDayRange(range.from, range.to)}
            theo chính sách “{khoanPolicyMeta[khoanPolicy].label}”: {khoanPolicyRule(khoanPolicy)}.
            Kết quả hiện tại của kỳ bị thay thế và mỗi người nhận thông báo. Lý do: “{reason.trim()}
            ”.
          </>
        }
        confirmLabel="Chạy chốt"
        pending={run.isPending}
        onConfirm={submit}
      />
    </Panel>
  );
};

const RunResult = ({ result }: { result: KpiSettlementRunResult }) => {
  const { run } = result;
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-success/30 bg-success-soft/50 p-3"
    >
      <p className="flex items-center gap-2 text-[13px] font-medium">
        <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
        Đã chốt {periodLabel(run.period).toLocaleLowerCase("vi")} cho {formatInteger(run.userCount)}{" "}
        người
        {run.replacedCount > 0
          ? ` (thay ${formatInteger(run.replacedCount)} kết quả cũ)`
          : ""} · {khoanPolicyMeta[run.khoanPolicy].short}.
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Đạt KPI" value={formatInteger(run.metCount)} tone="success" />
        <Stat label="Không đạt" value={formatInteger(run.notMetCount)} tone="danger" />
        <Stat label="Tiền Khoán trả" value={formatMoney(run.khoanMoneyTotal)} />
        <Stat label="Khoán quy điểm" value={formatCredit(run.khoanPointsConvertedTotal)} />
      </dl>
    </div>
  );
};

const Stat = ({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) => (
  <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-surface px-2.5 py-2 shadow-xs ring-1 ring-border/60">
    <dt className="text-[11px] text-foreground-muted">{label}</dt>
    <dd
      className={cn(
        "truncate text-sm font-semibold tabular-nums",
        tone === "success" && "text-success",
        tone === "danger" && "text-danger"
      )}
    >
      {value}
    </dd>
  </div>
);
