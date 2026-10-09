import { ChartNoAxesColumn } from "lucide-react";
import { useState } from "react";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { EmptyState, ErrorState } from "@/components/shared/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

import { formatPercent } from "../../scores/forecast";
import { ExportButton } from "../../scores/components/export-button";
import { Panel, TeamSelect } from "../../scores/components/kit";
import {
  periodLabel,
  periodsBetween,
  quarterOfPeriod,
  rollupLabel,
  shiftPeriod
} from "../../scores/periods";
import { useKpiReport } from "../hooks";
import { attainment, reportKeys, reportRowsFor, type ReportView } from "../report";
import { KpiFiguresTable, type KpiFiguresRow } from "./kpi-figures-table";

/**
 * KPI report (SPEC Phase 6 §4, /admin/kpi/report): person × period — target, official points,
 * Khoán converted, total, % đạt, vượt/thiếu, Khoán money — with quarter and year rollups and the
 * Excel export (GET /production/kpi/export, same query).
 */
export const KpiReportPanel = ({
  currentPeriod,
  focusPeriod
}: {
  currentPeriod: string;
  /** Period to show first (e.g. just settled). */
  focusPeriod: string;
}) => {
  const [from, setFrom] = useState(() => {
    const base = shiftPeriod(currentPeriod, -5);
    return focusPeriod < base ? focusPeriod : base;
  });
  const [to, setTo] = useState(currentPeriod);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [view, setView] = useState<ReportView>("MONTH");
  const [picked, setPicked] = useState<string | null>(null);
  const report = useKpiReport({ from, to, teamId });

  const choices = periodsBetween(shiftPeriod(currentPeriod, -35), currentPeriod).reverse();
  const choiceItems = choices.map((period) => ({ value: period, label: periodLabel(period) }));
  const periods = periodsBetween(from, to);
  const keys = reportKeys(view, periods);
  const preferred = view === "MONTH" ? focusPeriod : view === "QUARTER" ? quarterOfPeriod(focusPeriod) : focusPeriod.slice(0, 4);
  const key = picked && keys.includes(picked) ? picked : keys.includes(preferred) ? preferred : (keys[0] ?? "");
  const keyItems = keys.map((item) => ({
    value: item,
    label: view === "MONTH" ? periodLabel(item) : rollupLabel(item)
  }));
  const rows: KpiFiguresRow[] = report.data
    ? reportRowsFor(report.data, view, key).map((row) => ({
        key: row.user.id,
        label: row.user.displayName,
        sublabel: row.teamName ?? "Chưa có team",
        ...row.figures,
        state: row.settled === null ? undefined : row.settled ? "settled" : "provisional",
        met: row.met ?? undefined
      }))
    : [];
  const showMoney = rows.some((row) => row.khoanMoney !== null);
  const { withTarget, met, average } = attainment(rows);

  const setRange = (nextFrom: string, nextTo: string) => {
    // At most 24 periods, from ≤ to.
    const start = nextFrom > nextTo ? nextTo : nextFrom;
    const end = nextFrom > nextTo ? nextFrom : nextTo;
    setFrom(periodsBetween(start, end).length > 24 ? shiftPeriod(end, -23) : start);
    setTo(end);
  };

  return (
    <Panel
      title="Báo cáo KPI"
      description="% đạt = tổng điểm (chính thức + Khoán quy đổi) / chỉ tiêu. Kỳ chưa chốt là số tạm tính."
      actions={
        <ExportButton
          path="/production/kpi/export"
          query={{ from, to, teamId }}
          fallbackName={`kpi-${from}-${to}.xlsx`}
          size="sm"
          compactOnPhone={false}
        />
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-1.5">
          <RangeSelect label="Từ kỳ" items={choiceItems} value={from} onChange={(next) => setRange(next, to)} />
          <span className="text-xs text-foreground-muted">→</span>
          <RangeSelect label="Đến kỳ" items={choiceItems} value={to} onChange={(next) => setRange(from, next)} />
        </div>
        <TeamSelect value={teamId} onChange={setTeamId} />
        {report.isFetching && !report.isPending ? <Spinner className="size-4 text-foreground-muted" /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <SegmentedControl<ReportView>
          aria-label="Gộp theo"
          size="sm"
          value={view}
          onChange={(next) => {
            setView(next);
            setPicked(null);
          }}
          options={[
            { value: "MONTH", label: "Tháng" },
            { value: "QUARTER", label: "Quý" },
            { value: "YEAR", label: "Năm" }
          ]}
        />
        {keyItems.length > 0 ? (
          <Select items={keyItems} value={key} onValueChange={(next: string | null) => next && setPicked(next)}>
            <SelectTrigger size="sm" aria-label="Chọn kỳ báo cáo" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keyItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {report.data && rows.length > 0 ? (
          <span className="ml-auto flex flex-wrap gap-x-3 text-xs text-foreground-muted tabular-nums">
            <span>{rows.length} người</span>
            <span>
              Đạt <span className="font-medium text-success">{met}</span>/{withTarget}
            </span>
            <span>TB {formatPercent(average)}</span>
          </span>
        ) : null}
      </div>
      {report.isPending ? (
        <div className="flex flex-col gap-2 p-4" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : report.isError ? (
        <ErrorState size="sm" error={report.error} onRetry={() => void report.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState size="sm" icon={ChartNoAxesColumn} title="Không có dữ liệu KPI trong khoảng này" />
      ) : (
        <KpiFiguresTable
          rows={rows}
          firstColumn="Nhân viên"
          showMoney={showMoney}
          caption={`Báo cáo KPI ${view === "MONTH" ? periodLabel(key) : rollupLabel(key)}`}
        />
      )}
    </Panel>
  );
};

const RangeSelect = ({
  label,
  items,
  value,
  onChange
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) => (
  <Select items={items} value={value} onValueChange={(next: string | null) => next && onChange(next)}>
    <SelectTrigger aria-label={label} className="w-32">
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
);
