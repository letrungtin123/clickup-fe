import { ChartNoAxesColumn, UsersRound } from "lucide-react";
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

import { useCustomFields, useProductionAccess, useTags } from "../../hooks";
import { formatPercent } from "../../scores/forecast";
import { ExportButton } from "../../scores/components/export-button";
import { Panel, TeamSelect } from "../../scores/components/kit";
import { PeopleFilterButton } from "../../scores/components/people-filter";
import {
  describePeopleFilter,
  emptyPeopleFilter,
  isPeopleFilterEmpty,
  peopleFilterFields,
  peopleFilterPairs,
  type PeopleFilter
} from "../../scores/people-filter";
import {
  periodLabel,
  periodsBetween,
  quarterOfPeriod,
  rollupLabel,
  shiftPeriod
} from "../../scores/periods";
import { useKpiReport } from "../hooks";
import {
  attainment,
  reportKeys,
  reportRowsFor,
  rollupStatus,
  rollupStatusInfo,
  totalSummary,
  totalsFor,
  type ReportView
} from "../report";
import { KpiFiguresTable, RollupStatusBadge, type KpiFiguresRow } from "./kpi-figures-table";

/**
 * KPI report (SPEC Phase 6 §4, /admin/kpi/report): person × period — target, official points,
 * Khoán converted, total, % đạt, vượt/thiếu, Khoán money — with quarter and year rollups (always the
 * whole quarter / year, "Đã chốt" / "Tạm tính" / "Chưa hết kỳ"), the team and organization totals
 * (ADMIN, PLAN §6 "theo NV, team"), people filters by team, members' custom fields (e.g. Năng lực) and
 * tags (ADMIN), and the Excel export (GET /production/kpi/export, same query; sheet "Tổng theo team").
 */
export const KpiReportPanel = ({
  currentPeriod,
  focusPeriod
}: {
  currentPeriod: string;
  /** Period to show first (e.g. just settled). */
  focusPeriod: string;
}) => {
  const access = useProductionAccess();
  const [from, setFrom] = useState(() => {
    const base = shiftPeriod(currentPeriod, -5);
    return focusPeriod < base ? focusPeriod : base;
  });
  const [to, setTo] = useState(currentPeriod);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [people, setPeople] = useState<PeopleFilter>(emptyPeopleFilter);
  const [view, setView] = useState<ReportView>("MONTH");
  const [picked, setPicked] = useState<string | null>(null);
  const filter = access.isAdmin ? people : emptyPeopleFilter;
  const report = useKpiReport({ from, to, teamId }, filter);
  const customFields = useCustomFields(access.isAdmin);
  const tags = useTags(access.isAdmin);

  const choices = periodsBetween(shiftPeriod(currentPeriod, -35), currentPeriod).reverse();
  const choiceItems = choices.map((period) => ({ value: period, label: periodLabel(period) }));
  const periods = periodsBetween(from, to);
  const keys = reportKeys(view, periods);
  const preferred =
    view === "MONTH"
      ? focusPeriod
      : view === "QUARTER"
        ? quarterOfPeriod(focusPeriod)
        : focusPeriod.slice(0, 4);
  const key =
    picked && keys.includes(picked)
      ? picked
      : keys.includes(preferred)
        ? preferred
        : (keys[0] ?? "");
  const keyLabel = (item: string) => (view === "MONTH" ? periodLabel(item) : rollupLabel(item));
  const keyItems = keys.map((item) => {
    const status = report.data ? rollupStatus(report.data, view, item) : null;
    return {
      value: item,
      label: status ? `${keyLabel(item)} · ${rollupStatusInfo[status].label}` : keyLabel(item)
    };
  });
  const status = report.data ? rollupStatus(report.data, view, key) : null;
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
  const totals = report.data ? totalsFor(report.data, view, key) : { teams: [], org: null };
  const totalRows: KpiFiguresRow[] = [
    ...totals.teams.map((total) => ({
      key: `team:${total.teamId ?? "none"}`,
      label: total.teamName ?? "Chưa có team",
      sublabel: totalSummary(total),
      target: total.target,
      pointsOfficial: total.pointsOfficial,
      khoanPointsConverted: total.khoanPointsConverted,
      totalPoints: total.totalPoints,
      percent: total.percent,
      difference: total.difference,
      khoanMoney: total.khoanMoney
    })),
    ...(totals.org
      ? [
          {
            key: "org",
            label: "Toàn bộ phận",
            sublabel: totalSummary(totals.org),
            target: totals.org.target,
            pointsOfficial: totals.org.pointsOfficial,
            khoanPointsConverted: totals.org.khoanPointsConverted,
            totalPoints: totals.org.totalPoints,
            percent: totals.org.percent,
            difference: totals.org.difference,
            khoanMoney: totals.org.khoanMoney,
            total: true
          }
        ]
      : [])
  ];
  const showMoney = rows.some((row) => row.khoanMoney !== null);
  const { withTarget, met, average } = attainment(rows);
  const filtered = !isPeopleFilterEmpty(filter);
  const filterText = filtered
    ? describePeopleFilter(filter, {
        fields: peopleFilterFields(customFields.data?.items ?? []),
        tagName: (id) => tags.data?.items.find((tag) => tag.id === id)?.name
      })
    : "";

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
      description="% đạt = tổng điểm (chính thức + Khoán quy đổi) / chỉ tiêu. Kỳ chưa chốt là số tạm tính; quý và năm luôn tính đủ cả kỳ."
      actions={
        <ExportButton
          path="/production/kpi/export"
          query={{ from, to, teamId }}
          extra={peopleFilterPairs(filter)}
          fallbackName={`kpi-${from}-${to}.xlsx`}
          size="sm"
          compactOnPhone={false}
        />
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-1.5">
          <RangeSelect
            label="Từ kỳ"
            items={choiceItems}
            value={from}
            onChange={(next) => setRange(next, to)}
          />
          <span className="text-xs text-foreground-muted">→</span>
          <RangeSelect
            label="Đến kỳ"
            items={choiceItems}
            value={to}
            onChange={(next) => setRange(from, next)}
          />
        </div>
        <TeamSelect value={teamId} onChange={setTeamId} />
        {access.isAdmin ? (
          <PeopleFilterButton value={people} onChange={setPeople} className="max-sm:w-full" />
        ) : null}
        {report.isFetching && !report.isPending ? (
          <Spinner className="size-4 text-foreground-muted" />
        ) : null}
      </div>
      {filtered ? (
        <p className="border-b bg-brand-soft/40 px-4 py-2 text-xs text-foreground-muted">
          Đang lọc nhân viên: <span className="font-medium text-foreground">{filterText}</span>
        </p>
      ) : null}
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
          <Select
            items={keyItems}
            value={key}
            onValueChange={(next: string | null) => next && setPicked(next)}
          >
            <SelectTrigger size="sm" aria-label="Chọn kỳ báo cáo" className="w-36">
              <SelectValue>{keyLabel(key)}</SelectValue>
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
        {status ? <RollupStatusBadge status={status} /> : null}
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
      {status && status !== "SETTLED" ? (
        <p className="border-b px-4 py-2 text-xs text-foreground-muted">
          {rollupStatusInfo[status].hint}
        </p>
      ) : null}
      {report.isPending ? (
        <div className="flex flex-col gap-2 p-4" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : report.isError ? (
        <ErrorState size="sm" error={report.error} onRetry={() => void report.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          size="sm"
          icon={ChartNoAxesColumn}
          title={
            filtered
              ? "Không có nhân viên nào khớp bộ lọc"
              : "Không có dữ liệu KPI trong khoảng này"
          }
          description={filtered ? "Bỏ bớt điều kiện ở “Lọc nhân viên”." : undefined}
        />
      ) : (
        <>
          <KpiFiguresTable
            rows={rows}
            firstColumn="Nhân viên"
            showMoney={showMoney}
            caption={`Báo cáo KPI ${keyLabel(key)}`}
          />
          {totalRows.length > 0 ? (
            <section aria-labelledby="kpi-team-totals" className="border-t">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 pt-3 pb-2">
                <h3
                  id="kpi-team-totals"
                  className="flex items-center gap-1.5 text-sm font-semibold"
                >
                  <UsersRound className="size-4 text-foreground-muted" aria-hidden="true" />
                  Tổng theo team
                </h3>
                <p className="text-xs text-foreground-muted">
                  Cộng điểm và chỉ tiêu của những người đang hiện; % đạt = tổng điểm / tổng chỉ
                  tiêu.
                </p>
              </div>
              <KpiFiguresTable
                rows={totalRows}
                firstColumn="Team"
                showMoney={totalRows.some((row) => row.khoanMoney !== null)}
                caption={`Tổng theo team ${keyLabel(key)}`}
              />
            </section>
          ) : null}
        </>
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
  <Select
    items={items}
    value={value}
    onValueChange={(next: string | null) => next && onChange(next)}
  >
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
