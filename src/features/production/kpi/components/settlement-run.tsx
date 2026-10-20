import { cn } from "cn";
import { CheckCircle2, HandCoins, Play, Target, TriangleAlert } from "lucide-react";
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
import {
  closeDayOfPeriod,
  KpiTargetsMissingDetailsSchema,
  kpiPeriodRange,
  type KpiCloseDays,
  type KpiSettlementRunResult
} from "@/contracts/production-scores";
import { isApiError } from "@/lib/api/errors";

import { ConfirmDialog, FormAlert, InfoNote } from "../../components/settings-kit";
import {
  closeDayLabel,
  formatCredit,
  formatInteger,
  formatMoney,
  formatNumber
} from "../../format";
import { scoreErrorMessage } from "../../scores/errors";
import { Panel } from "../../scores/components/kit";
import { formatDayRange, periodLabel, periodsBetween, shiftPeriod } from "../../scores/periods";
import { useKpiTargetsMissing, useRunKpiSettlement } from "../hooks";
import { khoanPolicyMeta, topUpRule } from "../khoan-policy";
import { KpiFiguresTable, type KpiFiguresRow } from "./kpi-figures-table";
import { missingPeopleOf } from "../missing";
import { KpiMissingNotice } from "./kpi-missing";

/**
 * Manual KPI settlement (SPEC Phase 6 §5): pick a period, give a mandatory reason, confirm. The
 * period's current results are replaced (idempotent: same inputs give the same numbers) and members
 * plus admins are notified. Khoán rule TOP_UP (PD-066, "thiếu bao nhiêu bù bấy nhiêu"). PD-066: KPI is mandatory —
 * while someone has no KPI for the period the run is blocked (the list and a link to Cấu hình → KPI; the API answers
 * 409 KPI_TARGETS_MISSING). The result lists each person: điểm chính thức, KPI, thiếu, điểm bù từ Khoán, tiền Khoán
 * đã làm / nhận.
 *
 * PD-050: only the organization superadmin runs it; `readOnly` keeps the automatic schedule, the rule and who still
 * has no KPI for the current period, without the form.
 */
export const SettlementRunPanel = ({
  readOnly = false,
  ...props
}: SettlementRunProps & { readOnly?: boolean }) =>
  readOnly ? (
    <SettlementSchedulePanel currentPeriod={props.currentPeriod} closeDays={props.closeDays} />
  ) : (
    <SettlementRunForm {...props} />
  );

type SettlementRunProps = {
  currentPeriod: string;
  /** settings.kpiCloseDays (closeDaysOf): each period keeps the close day in force for it. */
  closeDays: KpiCloseDays;
  /** Called with the settled period (the page shows its report). */
  onDone: (period: string) => void;
};

const autoCloseNote = (closeDays: KpiCloseDays, currentPeriod: string) =>
  `Hệ thống tự chốt lúc 23:59 ngày chốt của mỗi kỳ (kỳ đang chạy: ${closeDayLabel(closeDayOfPeriod(closeDays, currentPeriod))}).`;

const RuleNote = () => (
  <InfoNote icon={HandCoins}>
    Tiền Khoán: <span className="font-medium text-foreground">{khoanPolicyMeta.TOP_UP.label}</span>{" "}
    — {topUpRule}
  </InfoNote>
);

const kpiPageLink = (
  <Button
    variant="outline"
    size="sm"
    render={<Link to="/production/settings/kpi" />}
    nativeButton={false}
  >
    <Target />
    Đặt KPI
  </Button>
);

/** Read-only viewers: when the period closes, the Khoán rule and who has no KPI yet; no run form. */
const SettlementSchedulePanel = ({
  currentPeriod,
  closeDays
}: Omit<SettlementRunProps, "onDone">) => {
  const missing = useKpiTargetsMissing(currentPeriod);
  return (
    <Panel
      title="Chốt KPI"
      description={autoCloseNote(closeDays, currentPeriod)}
      bodyClassName="flex flex-col gap-4 p-4"
    >
      <RuleNote />
      {missing.data && missing.data.items.length > 0 ? (
        <KpiMissingNotice
          period={missing.data.period}
          people={missingPeopleOf(missing.data)}
          requiredCount={missing.data.requiredCount}
          description="Hệ thống chỉ tự chốt khi mọi người đã có KPI của kỳ. Siêu quản trị set KPI ở Cấu hình → KPI."
          action={kpiPageLink}
        />
      ) : null}
    </Panel>
  );
};

/** The people of a 409 KPI_TARGETS_MISSING answer (names only), or null for any other failure. */
const missingFromError = (failure: unknown) => {
  if (!isApiError(failure) || failure.code !== "KPI_TARGETS_MISSING") return null;
  const parsed = KpiTargetsMissingDetailsSchema.safeParse(failure.details);
  return parsed.success ? parsed.data.users : [];
};

const SettlementRunForm = ({ currentPeriod, closeDays, onDone }: SettlementRunProps) => {
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
  /** People of a refused run (409), until the period changes. */
  const [refused, setRefused] = useState<{ id: string; displayName: string }[] | null>(null);
  const range = kpiPeriodRange(period, closeDays);
  const missing = useKpiTargetsMissing(period);
  const missingPeople = missing.data
    ? missingPeopleOf(missing.data)
    : refused
      ? refused.map((person) => ({ ...person }))
      : [];
  const blocked = missingPeople.length > 0;

  const review = () => {
    if (blocked) return;
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
          const people = missingFromError(failure);
          if (people) {
            // Someone lost their KPI meanwhile: show who, refresh the list.
            setRefused(people);
            setError(null);
            void missing.refetch();
            return;
          }
          setError(scoreErrorMessage(failure));
        }
      }
    );
  };

  return (
    <Panel
      title="Chạy chốt KPI"
      description={`${autoCloseNote(closeDays, currentPeriod)} Chạy tay khi cần sửa kết quả của một kỳ.`}
      bodyClassName="flex flex-col gap-4 p-4"
    >
      <RuleNote />
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
                setRefused(null);
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
        {blocked ? (
          <KpiMissingNotice
            className="md:col-span-2"
            period={period}
            people={missingPeople}
            requiredCount={missing.data?.requiredCount ?? null}
            title={`Còn ${missingPeople.length} người chưa có KPI ${periodLabel(period).toLocaleLowerCase("vi")} — set KPI trước khi chốt`}
            description="KPI là bắt buộc: chưa set đủ cho mọi thành viên Photo Retouch (trừ Director và Siêu quản trị) thì không chốt được kỳ này."
            action={kpiPageLink}
          />
        ) : null}
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
          <Button type="submit" disabled={run.isPending || blocked || missing.isPending}>
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
            Tính lại cho mọi người có điểm hoặc KPI trong kỳ {formatDayRange(range.from, range.to)}{" "}
            theo quy tắc “{khoanPolicyMeta.TOP_UP.label}”: {topUpRule} Kết quả hiện tại của kỳ bị
            thay thế và mỗi người nhận thông báo. Lý do: “{reason.trim()}”.
          </>
        }
        confirmLabel="Chạy chốt"
        pending={run.isPending}
        onConfirm={submit}
      />
    </Panel>
  );
};

/** The run's totals and "Kết quả chốt" per person (PD-066 figures). */
const RunResult = ({ result }: { result: KpiSettlementRunResult }) => {
  const { run } = result;
  const rows: KpiFiguresRow[] = result.items.map((item) => ({
    key: item.id,
    label: item.user.displayName,
    sublabel:
      item.leaveDays > 0 ? `${formatNumber(item.leaveDays)} ngày nghỉ được duyệt` : undefined,
    target: item.target,
    pointsOfficial: item.pointsOfficial,
    shortfall: item.shortfall,
    khoanPointsConverted: item.khoanPointsConverted,
    totalPoints: item.totalPoints,
    percent: item.percent,
    difference: item.difference,
    khoanMoneyEarned: item.khoanMoneyEarned,
    khoanMoneyPaid: item.khoanMoneyPaid,
    state: "settled",
    met: item.met
  }));
  return (
    <div role="status" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg border border-success/30 bg-success-soft/50 p-3">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
          <span>
            Đã chốt {periodLabel(run.period).toLocaleLowerCase("vi")} cho{" "}
            {formatInteger(run.userCount)} người
            {run.replacedCount > 0
              ? ` (thay ${formatInteger(run.replacedCount)} kết quả cũ)`
              : ""}{" "}
            · {khoanPolicyMeta[run.khoanPolicy].short}.
          </span>
        </p>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Đạt KPI" value={formatInteger(run.metCount)} tone="success" />
          <Stat label="Không đạt" value={formatInteger(run.notMetCount)} tone="danger" />
          <Stat label="Điểm bù từ Khoán" value={formatCredit(run.khoanPointsConvertedTotal)} />
          {run.khoanMoneyTotal !== null ? (
            <Stat label="Tiền Khoán trả" value={formatMoney(run.khoanMoneyTotal)} />
          ) : null}
        </dl>
      </div>
      {rows.length > 0 ? (
        <section aria-label="Kết quả chốt từng người" className="overflow-hidden rounded-lg border">
          <KpiFiguresTable
            rows={rows}
            firstColumn="Nhân viên"
            showMoney={rows.some((row) => row.khoanMoneyPaid !== null)}
            caption={`Kết quả chốt ${periodLabel(run.period)}`}
          />
        </section>
      ) : null}
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
