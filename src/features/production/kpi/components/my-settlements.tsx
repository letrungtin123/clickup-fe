import { cn } from "cn";
import {
  CalendarCheck2,
  CircleCheck,
  CircleX,
  Coins,
  HandCoins,
  Repeat2,
  Target
} from "lucide-react";
import { useState } from "react";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { KpiSettlement } from "@/contracts/production-scores";

import { formatCredit, formatMoney, formatNumber } from "../../format";
import { formatPercent } from "../../scores/forecast";
import { ExportButton } from "../../scores/components/export-button";
import { Panel } from "../../scores/components/kit";
import { formatDayRange, periodLabel, rollupLabel, shiftPeriod } from "../../scores/periods";
import { useKpiReport, useKpiSettlements } from "../hooks";
import { khoanPolicyMeta, kpiTotalHint, settlementKhoanSentence } from "../khoan-policy";
import { figuresOfRollup, figuresOfRow, statusOfRollup } from "../report";
import { KpiFiguresTable, type KpiFiguresRow } from "./kpi-figures-table";

type View = "MONTH" | "QUARTER" | "YEAR";

// "10:05 06/10/2026": full dates like the rest of the module (dateStyle short gives "6/10/26").
const dateTime = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh"
});

/**
 * "Kết quả chốt" on /production/scores: the caller's latest settled period (Phase 6 §1–§2) and
 * their KPI report for the last 12 periods with quarter/year rollups. ADMIN gets everyone from the
 * API; only the caller's own rows are shown here. `self` false: another member's "Điểm cá nhân"
 * (PD-052) — the API is asked for that `userId` only and sends money only when the caller may see it.
 * PD-066 "Kết quả chốt": điểm chính thức, KPI, thiếu, điểm bù từ Khoán, tiền Khoán đã làm / nhận; a settled period is
 * explained with the rule of its own run (TOP_UP, or a retired policy on older runs).
 */
export const MySettlements = ({
  userId,
  self = true,
  currentPeriod
}: {
  userId: string;
  self?: boolean;
  currentPeriod: string;
}) => {
  const [view, setView] = useState<View>("MONTH");
  const subject = self ? null : userId;
  const latest = useKpiSettlements(null, true, subject);
  const range = {
    from: shiftPeriod(currentPeriod, -11),
    to: currentPeriod,
    teamId: null,
    userId: subject
  };
  const report = useKpiReport(range);
  const own = latest.data?.items.find((item) => item.user.id === userId) ?? null;

  const rows: KpiFiguresRow[] = (() => {
    if (!report.data) return [];
    if (view === "MONTH") {
      return report.data.rows
        .filter((row) => row.userId === userId)
        .sort((a, b) => b.period.localeCompare(a.period))
        .map((row) => ({
          key: row.period,
          label: periodLabel(row.period),
          sublabel:
            row.leaveDays > 0 ? `${formatNumber(row.leaveDays)} ngày nghỉ được duyệt` : undefined,
          ...figuresOfRow(row),
          state: row.settled ? "settled" : "provisional",
          met: row.met,
          highlight: row.period === currentPeriod
        }));
    }
    return report.data.rollups
      .filter((rollup) => rollup.userId === userId && rollup.periodType === view)
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((rollup) => ({
        key: rollup.key,
        label: rollupLabel(rollup.key),
        sublabel: rollup.explicitTarget ? "Chỉ tiêu riêng của kỳ" : "Chỉ tiêu = tổng các tháng",
        ...figuresOfRollup(rollup),
        rollupStatus: statusOfRollup(rollup)
      }));
  })();
  const showMoney = rows.some((row) => row.khoanMoneyPaid !== null);

  return (
    <div className="flex flex-col gap-4">
      {latest.isPending ? (
        <Skeleton className="h-36 rounded-xl" />
      ) : latest.isError ? (
        <Panel>
          <ErrorState size="sm" error={latest.error} onRetry={() => void latest.refetch()} />
        </Panel>
      ) : own ? (
        <LatestSettlement settlement={own} />
      ) : (
        <Panel>
          <EmptyState
            size="sm"
            icon={CalendarCheck2}
            title="Chưa có kỳ nào được chốt"
            description={`Ngày chốt KPI hằng tháng, hệ thống tính KPI và tiền Khoán: thiếu KPI bao nhiêu thì bù từ Khoán bấy nhiêu, phần còn lại được trả tiền. Kỳ gần nhất (${periodLabel(latest.data.period)}) chưa có kết quả cho ${self ? "bạn" : "người này"}.`}
          />
        </Panel>
      )}

      <Panel
        title="KPI 12 kỳ gần nhất"
        description={`${kpiTotalHint} Kỳ chưa chốt là số tạm tính; quý và năm tính đủ cả kỳ.`}
        actions={
          <>
            <SegmentedControl<View>
              aria-label="Gộp theo"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "MONTH", label: "Tháng" },
                { value: "QUARTER", label: "Quý" },
                { value: "YEAR", label: "Năm" }
              ]}
            />
            <ExportButton
              path="/production/kpi/export"
              query={{ from: range.from, to: range.to, userId: subject }}
              fallbackName={`${self ? "kpi-cua-toi" : "kpi-ca-nhan"}-${range.from}-${range.to}.xlsx`}
              size="sm"
            />
          </>
        }
      >
        {report.isPending ? (
          <div className="flex flex-col gap-2 p-4" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : report.isError ? (
          <ErrorState size="sm" error={report.error} onRetry={() => void report.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState size="sm" icon={CalendarCheck2} title="Chưa có số liệu KPI" />
        ) : (
          <KpiFiguresTable
            rows={rows}
            firstColumn="Kỳ"
            showMoney={showMoney}
            caption="Kết quả KPI theo kỳ"
          />
        )}
      </Panel>
    </div>
  );
};

const LatestSettlement = ({ settlement }: { settlement: KpiSettlement }) => {
  const converted = settlement.khoanPointsConverted > 0;
  const money = settlement.khoanMoneyPaid !== null;
  return (
    <section
      aria-label={`Kết quả chốt ${periodLabel(settlement.period)}`}
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-4 shadow-xs",
        settlement.met
          ? "border-success/30 bg-success-soft/50"
          : "border-danger/25 bg-danger-soft/45"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface shadow-xs",
              settlement.met ? "text-success" : "text-danger"
            )}
          >
            {settlement.met ? (
              <CircleCheck className="size-5" aria-hidden="true" />
            ) : (
              <CircleX className="size-5" aria-hidden="true" />
            )}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-xs text-foreground-muted">
              {periodLabel(settlement.period)} · {formatDayRange(settlement.from, settlement.to)}
            </p>
            <p className="text-[15px] font-semibold">
              {settlement.met ? "Đạt KPI" : "Không đạt KPI"} · {formatPercent(settlement.percent)}
              {converted ? (
                <span className="font-normal text-foreground-muted"> (có bù từ Khoán)</span>
              ) : null}
            </p>
          </div>
        </div>
        <p className="text-xs text-foreground-muted">
          Chốt lúc {dateTime.format(new Date(settlement.runAt))} ·{" "}
          {khoanPolicyMeta[settlement.khoanPolicy].short}
        </p>
      </div>
      <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", money && "lg:grid-cols-6")}>
        <Fact label="Điểm chính thức" value={formatCredit(settlement.pointsOfficial)} />
        <Fact
          label="KPI"
          value={formatCredit(settlement.target)}
          icon={<Target className="size-3.5" aria-hidden="true" />}
        />
        <Fact
          label="Thiếu"
          value={formatCredit(settlement.shortfall)}
          tone={settlement.shortfall > 0 ? "danger" : undefined}
        />
        <Fact
          label="Điểm bù từ Khoán"
          value={formatCredit(settlement.khoanPointsConverted)}
          icon={<Repeat2 className="size-3.5" aria-hidden="true" />}
        />
        {money ? (
          <>
            <Fact
              label="Tiền Khoán đã làm"
              value={formatMoney(settlement.khoanMoneyEarned)}
              icon={<HandCoins className="size-3.5" aria-hidden="true" />}
            />
            <Fact
              label="Tiền Khoán nhận"
              value={formatMoney(settlement.khoanMoneyPaid)}
              icon={<Coins className="size-3.5" aria-hidden="true" />}
              tone="success"
            />
          </>
        ) : null}
      </dl>
      <p className="text-xs text-foreground-muted">
        {settlementKhoanSentence(settlement)}
        {settlement.leaveDays > 0
          ? ` Nghỉ được duyệt: ${formatNumber(settlement.leaveDays)} ngày.`
          : ""}
        {settlement.note ? ` Ghi chú: ${settlement.note}` : ""}
      </p>
    </section>
  );
};

const Fact = ({
  label,
  value,
  icon,
  tone
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "success" | "danger" | undefined;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-surface/80 px-3 py-2 shadow-xs ring-1 ring-border/60">
    <dt className="flex items-center gap-1 text-[11px] text-foreground-muted">
      {icon}
      {label}
    </dt>
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
