import { cn } from "cn";
import { ArrowDown, ArrowUp, ArrowUpDown, SearchX, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { Link } from "@/components/shared/router-link";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { KpiCloseDays } from "@/contracts/production-scores";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { formatCredit, formatInteger, formatPercent } from "../../format";
import { SearchField } from "../../components/settings-kit";
import { useProductionAccess } from "../../hooks";
import { useScoreBoard } from "../hooks";
import {
  emptyPeopleFilter,
  isPeopleFilterEmpty,
  peopleFilterFromParams,
  peopleFilterPairs,
  withPeopleFilterParams,
  type PeopleFilter
} from "../people-filter";
import { personScoresPath } from "../person-link";
import { periodLabel } from "../periods";
import {
  defaultTeamSort,
  nextTeamSort,
  searchTeamRows,
  sortTeamRows,
  teamSortOptions,
  teamSortValue,
  teamSummary,
  toTeamRow,
  type TeamRow,
  type TeamSort,
  type TeamSortKey,
  type TeamSummary
} from "../team-board";
import { ExportButton } from "./export-button";
import { Panel, PeriodPicker } from "./kit";
import { PeopleFilterButton } from "./people-filter";

const noKpiHint = "Người này phải có KPI kỳ này nhưng chưa được đặt — liên hệ Quản trị.";

/**
 * "Bảng điểm → Toàn đội" (PD-069, /production/scores?tab=team): everyone's official points of the period with their KPI
 * (prorated by leave like the close) and % reached. No Team / Khoán money column and no team filter (owner, 2026-10-20;
 * an old ?team= is ignored) — the money stays on each person's own scores. Not a ranking. Sortable headers (phones: a
 * sort select and cards), search by name, the ADMIN people filter (?tag=&cf.<key>=), the summary line, "Xuất Excel" (GET /production/scores/board/export). Each
 * person opens their "Điểm cá nhân" for the same period (your own row → "Bảng điểm của tôi").
 */
export const TeamBoard = ({
  meId,
  period,
  current,
  closeDays,
  onPeriodChange
}: {
  meId: string;
  period: string;
  current: string;
  closeDays: KpiCloseDays;
  onPeriodChange: (period: string) => void;
}) => {
  const access = useProductionAccess();
  const breakpoint = useBreakpoint();
  const phone = breakpoint === "mobile";
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TeamSort>(defaultTeamSort);

  // Members' tags / custom values are Admin data (others get 403): the filter is ADMIN only.
  const people: PeopleFilter = access.isAdmin ? peopleFilterFromParams(params) : emptyPeopleFilter;
  const board = useScoreBoard(period, null, people);

  const all = useMemo(() => (board.data?.items ?? []).map(toTeamRow), [board.data]);
  const found = useMemo(() => searchTeamRows(all, query), [all, query]);
  const rows = useMemo(() => sortTeamRows(found, sort), [found, sort]);
  const summary = useMemo(() => teamSummary(found), [found]);
  const hrefOf = (userId: string) =>
    personScoresPath(userId, meId, period === current ? null : period);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker
          value={period}
          onChange={onPeriodChange}
          latest={current}
          closeDays={closeDays}
        />
        {board.isFetching && !board.isPending ? (
          <Spinner className="size-4 shrink-0 text-foreground-muted" />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Tìm theo tên"
          label="Tìm người"
          className="basis-full sm:max-w-64 sm:basis-auto"
        />
        {access.isAdmin ? (
          <PeopleFilterButton
            value={people}
            onChange={(next) =>
              setParams((previous) => withPeopleFilterParams(previous, next), { replace: true })
            }
            className="max-sm:min-w-0 max-sm:flex-1"
          />
        ) : null}
        {board.data ? (
          <div className="sm:ml-auto">
            <ExportButton
              path="/production/scores/board/export"
              query={{ period }}
              extra={peopleFilterPairs(people)}
              fallbackName={`diem-toan-doi-${period}.xlsx`}
            />
          </div>
        ) : null}
      </div>

      {board.isPending ? (
        <TeamBoardSkeleton phone={phone} />
      ) : board.isError ? (
        <Panel>
          <ErrorState
            error={board.error}
            onRetry={() => void board.refetch()}
            retrying={board.isFetching}
          />
        </Panel>
      ) : all.length === 0 ? (
        <Panel>
          <EmptyState
            icon={UsersRound}
            title="Không có ai trong bảng"
            description={
              !isPeopleFilterEmpty(people)
                ? "Không có ai khớp bộ lọc nhân viên. Bỏ bớt điều kiện ở “Lọc nhân viên”."
                : "Chưa có nhân viên Photo Retouch nào."
            }
          />
        </Panel>
      ) : (
        <Panel
          title={`Toàn đội · ${periodLabel(period)}`}
          description="Bấm vào một người để xem Điểm cá nhân."
          actions={phone && found.length > 1 ? <PhoneSort sort={sort} onChange={setSort} /> : null}
        >
          <SummaryLine summary={summary} />
          {found.length === 0 ? (
            <EmptyState
              size="sm"
              icon={SearchX}
              title="Không tìm thấy ai"
              description={`Không có ai khớp “${query.trim()}”.`}
              action={
                <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                  Xóa tìm kiếm
                </Button>
              }
            />
          ) : phone ? (
            <TeamCards rows={rows} meId={meId} hrefOf={hrefOf} />
          ) : (
            <TeamTable
              rows={rows}
              meId={meId}
              hrefOf={hrefOf}
              sort={sort}
              onSort={(key) => setSort((previous) => nextTeamSort(previous, key))}
            />
          )}
        </Panel>
      )}
    </>
  );
};

/** "24 người · Tổng 52.340,50 điểm chính thức · 12/22 đạt KPI · 2 chưa có KPI". */
const SummaryLine = ({ summary }: { summary: TeamSummary }) => (
  <ul
    aria-label="Tóm tắt toàn đội"
    className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-2 text-xs text-foreground-muted tabular-nums"
  >
    <li>
      <span className="font-semibold text-foreground">{formatInteger(summary.people)}</span> người
    </li>
    <li>
      Tổng <span className="font-semibold text-foreground">{formatCredit(summary.points)}</span>{" "}
      điểm chính thức
    </li>
    <li>
      <span className="font-semibold text-foreground">{formatInteger(summary.met)}</span>
      {summary.withKpi > 0 ? `/${formatInteger(summary.withKpi)}` : ""} đạt KPI
    </li>
    <li className={cn(summary.missingKpi > 0 && "text-warning")}>
      <span className={cn("font-semibold", summary.missingKpi > 0 ? "" : "text-foreground")}>
        {formatInteger(summary.missingKpi)}
      </span>{" "}
      chưa có KPI
    </li>
  </ul>
);

const YouTag = () => (
  <span className="shrink-0 rounded bg-brand px-1 py-px text-[10px] font-semibold text-brand-foreground">
    Bạn
  </span>
);

const NoKpiChip = () => (
  <span
    title={noKpiHint}
    className="inline-flex shrink-0 items-center rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-foreground ring-1 ring-warning/30"
  >
    Chưa có KPI
  </span>
);

/** Official points / KPI as a static bar (many rows: no animation); green once reached. */
const KpiBar = ({ row, className }: { row: TeamRow; className?: string }) => (
  <span
    role="progressbar"
    aria-label={`% đạt KPI của ${row.item.user.displayName}`}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(Math.min(row.percent ?? 0, 100))}
    className={cn("block h-1.5 overflow-hidden rounded-full bg-muted", className)}
  >
    <span
      className={cn("block h-full rounded-full", row.met ? "bg-success" : "bg-brand")}
      style={{ width: `${Math.min(row.percent ?? 0, 100)}%` }}
    />
  </span>
);

const KpiValue = ({ row }: { row: TeamRow }) =>
  row.kpiState === "set" ? (
    <>{formatCredit(row.item.kpiTarget)}</>
  ) : row.kpiState === "missing" ? (
    <NoKpiChip />
  ) : (
    <span className="text-foreground-subtle" title="Không bắt buộc KPI">
      —
    </span>
  );

const SortIcon = ({ active, direction }: { active: boolean; direction: TeamSort["direction"] }) =>
  !active ? (
    <ArrowUpDown
      className="size-3 opacity-0 transition-opacity group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60"
      aria-hidden="true"
    />
  ) : direction === "asc" ? (
    <ArrowUp className="size-3" aria-hidden="true" />
  ) : (
    <ArrowDown className="size-3" aria-hidden="true" />
  );

const SortHeader = ({
  column,
  label,
  sort,
  onSort,
  align = "left",
  className
}: {
  column: TeamSortKey;
  label: string;
  sort: TeamSort;
  onSort: (key: TeamSortKey) => void;
  align?: "left" | "right";
  className?: string;
}) => {
  const active = sort.key === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
      className={cn(
        "px-3 py-2.5 font-medium",
        align === "right" ? "text-right" : "text-left",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-label={`Sắp xếp theo ${label}`}
        className={cn(
          "group/sort inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-foreground",
          align === "right" && "flex-row-reverse"
        )}
      >
        {label}
        <SortIcon active={active} direction={sort.direction} />
      </button>
    </th>
  );
};

const PersonName = ({ row, own, to }: { row: TeamRow; own: boolean; to: string }) => (
  <Link
    to={to}
    className="-mx-1 flex min-w-0 items-center gap-2 rounded px-1 py-0.5 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
  >
    <UserAvatar user={row.item.user} size="sm" />
    <span className="min-w-0 font-medium break-words">{row.item.user.displayName}</span>
    {own ? <YouTag /> : null}
  </Link>
);

const TeamTable = ({
  rows,
  meId,
  hrefOf,
  sort,
  onSort
}: {
  rows: readonly TeamRow[];
  meId: string;
  hrefOf: (userId: string) => string;
  sort: TeamSort;
  onSort: (key: TeamSortKey) => void;
}) => (
  <div className="overflow-x-auto overscroll-x-contain">
    <table className="w-full min-w-[34rem] text-[13px]">
      <caption className="sr-only">Điểm chính thức và KPI của toàn đội</caption>
      <thead>
        <tr className="border-b text-xs whitespace-nowrap text-foreground-muted">
          <SortHeader column="name" label="Họ tên" sort={sort} onSort={onSort} className="pl-4" />
          <SortHeader
            column="points"
            label="Điểm chính thức"
            sort={sort}
            onSort={onSort}
            align="right"
          />
          <SortHeader column="kpi" label="KPI" sort={sort} onSort={onSort} align="right" />
          <SortHeader
            column="percent"
            label="% đạt"
            sort={sort}
            onSort={onSort}
            className="w-44 pr-4"
          />
        </tr>
      </thead>
      <tbody className="divide-y divide-border/70">
        {rows.map((row) => {
          const own = row.item.user.id === meId;
          return (
            <tr
              key={row.item.user.id}
              className={cn("transition-colors hover:bg-muted/40", own && "bg-brand-soft/40")}
            >
              <td className="py-2 pr-3 pl-4">
                <PersonName row={row} own={own} to={hrefOf(row.item.user.id)} />
              </td>
              <td className="px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums">
                {formatCredit(row.item.pointsOfficial)}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                <KpiValue row={row} />
              </td>
              <td className="py-2 pr-4 pl-3">
                {row.percent === null ? (
                  <span className="text-foreground-subtle">—</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <KpiBar row={row} className="min-w-12 flex-1" />
                    <span
                      className={cn(
                        "w-14 shrink-0 text-right whitespace-nowrap tabular-nums",
                        row.met && "font-medium text-success"
                      )}
                    >
                      {formatPercent(row.percent)}
                    </span>
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const TeamCards = ({
  rows,
  meId,
  hrefOf
}: {
  rows: readonly TeamRow[];
  meId: string;
  hrefOf: (userId: string) => string;
}) => (
  <ul className="divide-y" aria-label="Điểm toàn đội">
    {rows.map((row) => {
      const own = row.item.user.id === meId;
      return (
        <li key={row.item.user.id} className={cn(own && "bg-brand-soft/40")}>
          <Link
            to={hrefOf(row.item.user.id)}
            className="flex min-w-0 flex-col gap-2 px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted/60"
          >
            <span className="flex min-w-0 items-center gap-3">
              <UserAvatar user={row.item.user} size="md" />
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] leading-snug font-medium">
                <span className="min-w-0 break-words">{row.item.user.displayName}</span>
                {own ? <YouTag /> : null}
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-sm font-semibold tabular-nums">
                  {formatCredit(row.item.pointsOfficial)}
                </span>
                <span className="text-[11px] text-foreground-muted">điểm chính thức</span>
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2 pl-11 text-xs text-foreground-muted tabular-nums">
              {row.kpiState === "set" ? (
                <>
                  <KpiBar row={row} className="min-w-8 flex-1" />
                  <span className={cn("shrink-0", row.met && "font-medium text-success")}>
                    {formatPercent(row.percent)}
                  </span>
                  <span className="shrink-0">/ KPI {formatCredit(row.item.kpiTarget)}</span>
                </>
              ) : row.kpiState === "missing" ? (
                <NoKpiChip />
              ) : (
                <span>Không bắt buộc KPI</span>
              )}
            </span>
          </Link>
        </li>
      );
    })}
  </ul>
);

/** Phones have no column headers: one select for the order. */
const PhoneSort = ({ sort, onChange }: { sort: TeamSort; onChange: (sort: TeamSort) => void }) => {
  const value = teamSortValue(sort);
  const items = teamSortOptions.some((option) => option.value === value)
    ? teamSortOptions
    : [{ value, label: "Đang sắp xếp theo cột", sort }, ...teamSortOptions];
  return (
    <Select
      items={items.map((item) => ({ value: item.value, label: item.label }))}
      value={value}
      onValueChange={(next: string | null) => {
        const option = items.find((item) => item.value === next);
        if (option) onChange(option.sort);
      }}
    >
      <SelectTrigger aria-label="Sắp xếp" className="w-44">
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
};

const TeamBoardSkeleton = ({ phone }: { phone: boolean }) => (
  <div
    className="flex flex-col gap-0 overflow-hidden rounded-xl border bg-surface shadow-xs"
    aria-hidden="true"
  >
    <div className="flex flex-col gap-1.5 border-b px-4 py-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-56" />
    </div>
    <div className="border-b px-4 py-2">
      <Skeleton className="h-3 w-full max-w-md" />
    </div>
    <div className="flex flex-col gap-3 px-4 py-3">
      {Array.from({ length: phone ? 5 : 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-16 shrink-0" />
          {phone ? null : <Skeleton className="h-1.5 w-32 shrink-0" />}
        </div>
      ))}
    </div>
  </div>
);
