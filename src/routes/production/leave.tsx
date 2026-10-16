import {
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Inbox,
  ListChecks
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Link } from "@/components/shared/router-link";

import { PageHeader } from "@/components/shared/page-header";
import { SegmentedControl } from "@/components/shared/radio-controls";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LeaveRequest } from "@/contracts/production-leave";
import { DateField } from "@/features/production/components/date-field";
import { todayIn } from "@/features/production/format";
import { useProductionAccess, useProductionMe } from "@/features/production/hooks";
import {
  bucketLeaveByDay,
  formatLeaveDates,
  monthBounds,
  monthGrid,
  monthOfDay,
  shiftDay,
  shiftMonth,
  showsAdminOnlyNote
} from "@/features/production/leave/calendar";
import {
  AdminOnlyDecisionNote,
  LeaveAvatar
} from "@/features/production/leave/components/leave-bits";
import {
  LeaveAgenda,
  LeaveDayDetail,
  LeaveMonthGrid
} from "@/features/production/leave/components/leave-calendar";
import { LeaveExportButton } from "@/features/production/leave/components/leave-export-button";
import { LeaveRangeList } from "@/features/production/leave/components/leave-range-list";
import { LeaveRequestDialog } from "@/features/production/leave/components/leave-request-dialog";
import { LeaveRequestRow } from "@/features/production/leave/components/leave-requests";
import { useLeaveActions } from "@/features/production/leave/components/use-leave-actions";
import { LEAVE_EXPORT_HINT } from "@/features/production/leave/export";
import {
  useLeaveCalendar,
  useMyLeaveRequests,
  usePendingLeave
} from "@/features/production/leave/hooks";
import {
  leaveFilterWindow,
  leaveModePatch,
  leaveRangeRows,
  leaveRangeSummaryText,
  parseLeaveTimeFilter,
  validateLeaveRange,
  type LeaveTimeFilter,
  type LeaveTimeMode
} from "@/features/production/leave/range";
import { PageBody, Panel, TeamSelect } from "@/features/production/scores/components/kit";
import { useBreakpoint } from "@/hooks/use-breakpoint";

type Tab = "calendar" | "mine" | "pending";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthLabel = (month: string) => `Tháng ${month.slice(5, 7)}/${month.slice(0, 4)}`;

const timeModes = [
  { value: "month", label: "Theo tháng", icon: CalendarDays },
  { value: "range", label: "Khoảng ngày", icon: CalendarRange }
] as const;

/**
 * /production/leave — shared leave calendar (SPEC §6.3, PLAN §10): month grid with avatars of people
 * on leave (half days marked), team filter, "Xin nghỉ", own requests with cancel, and the pending
 * queue (LEADER/ADMIN and whoever holds "Duyệt lịch nghỉ" read it; deciding follows each request's `canDecide`,
 * PD-057/PD-065). Phones get an agenda list. PD-057 adds a time filter — "Theo tháng" or "Khoảng ngày" (a list of
 * the requests overlapping the range) — and, with the "Duyệt lịch nghỉ" feature (PD-065, Quản trị by default),
 * "Xuất Excel" of the current filter (payroll attendance). Live via `production:leave`
 * (ProductionRuntime). ?month=YYYY-MM | ?from=YYYY-MM-DD&to=YYYY-MM-DD, &tab=mine|pending, &team=<id>.
 */
export const ProductionLeaveRoute = () => {
  const me = useProductionMe();
  const access = useProductionAccess();
  const breakpoint = useBreakpoint();
  const [params, setParams] = useSearchParams();
  const settings = me.data?.settings;
  const today = todayIn(settings?.timezone ?? "Asia/Ho_Chi_Minh");
  // PD-065: "Duyệt lịch nghỉ" decides (`canDecide` per request) and exports; LEADER/ADMIN also read the queue.
  const approves = access.hasFeature("leave_approval");
  const seesQueue = access.can("LEADER") || approves;

  const filter = parseLeaveTimeFilter(params, today);
  const tabParam = params.get("tab");
  const tab: Tab =
    tabParam === "mine" ? "mine" : tabParam === "pending" && seesQueue ? "pending" : "calendar";
  const teamParam = params.get("team");
  const teamId = teamParam && uuidPattern.test(teamParam) ? teamParam : null;

  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; day: string | null; key: number }>({
    open: false,
    day: null,
    key: 0
  });
  const actions = useLeaveActions();
  const pending = usePendingLeave(seesQueue);
  const pendingCount = pending.data?.items.length ?? 0;

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );

  const openRequest = (day: string | null) =>
    setDialog((current) => ({ open: true, day, key: current.key + 1 }));

  const renderActions = (request: LeaveRequest) => {
    const adminOnly = showsAdminOnlyNote(request, seesQueue);
    return request.canDecide || request.canCancel || adminOnly ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {adminOnly ? <AdminOnlyDecisionNote /> : null}
        {request.canDecide ? (
          <>
            <Button size="sm" variant="outline" onClick={() => actions.decide(request, "REJECTED")}>
              Từ chối
            </Button>
            <Button size="sm" onClick={() => actions.decide(request, "APPROVED")}>
              Duyệt
            </Button>
          </>
        ) : null}
        {request.canCancel ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:text-danger"
            onClick={() => actions.cancel(request)}
          >
            Hủy đơn
          </Button>
        ) : null}
      </div>
    ) : null;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow={
          <Link
            to="/production"
            className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-3 max-sm:py-3 max-sm:pr-3"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Photo Retouch
          </Link>
        }
        title="Lịch nghỉ"
        description={
          breakpoint === "mobile"
            ? undefined
            : "Ai nghỉ ngày nào để sắp việc. Mọi người chỉ thấy tên và ngày; lý do chỉ người xin và Leader/Quản trị thấy. Người có quyền Duyệt lịch nghỉ duyệt đơn."
        }
        actions={
          <Button onClick={() => openRequest(null)}>
            <CalendarPlus />
            Xin nghỉ
          </Button>
        }
      >
        <Tabs
          value={tab}
          onValueChange={(value) => update({ tab: value === "calendar" ? null : String(value) })}
        >
          <TabsList variant="line" className="-mb-3 h-9 max-w-full overflow-x-auto scrollbar-none">
            <TabsTrigger value="calendar" className="max-sm:min-h-10">
              Lịch
            </TabsTrigger>
            <TabsTrigger value="mine" className="max-sm:min-h-10">
              Đơn của tôi
            </TabsTrigger>
            {seesQueue ? (
              <TabsTrigger value="pending" className="max-sm:min-h-10">
                Chờ duyệt
                {pendingCount > 0 ? (
                  <span className="ml-1 rounded-full bg-warning-soft px-1.5 text-[11px] leading-4 font-semibold text-foreground tabular-nums ring-1 ring-warning/50 ring-inset">
                    {pendingCount}
                  </span>
                ) : null}
              </TabsTrigger>
            ) : null}
          </TabsList>
        </Tabs>
      </PageHeader>

      <PageBody>
        {tab === "calendar" ? (
          <CalendarTab
            filter={filter}
            today={today}
            teamId={teamId}
            canExport={approves}
            selected={selected}
            mobile={breakpoint === "mobile"}
            maxAvatars={breakpoint === "desktop" ? 3 : 4}
            withNames={breakpoint === "desktop"}
            onPatch={(patch) => {
              if ("month" in patch || "from" in patch || "to" in patch) setSelected(null);
              update(patch);
            }}
            onSelect={setSelected}
            onRequest={openRequest}
            renderActions={renderActions}
          />
        ) : tab === "mine" ? (
          <MineTab
            today={today}
            onRequest={() => openRequest(null)}
            onDecide={actions.decide}
            onCancel={actions.cancel}
          />
        ) : (
          <Panel
            title="Đơn chờ duyệt"
            description={
              approves
                ? "Duyệt hoặc từ chối; người xin nghỉ nhận thông báo ngay."
                : "Bạn không có quyền duyệt đơn nghỉ; bạn xem để sắp việc cho team."
            }
          >
            {pending.isPending ? (
              <ListSkeleton />
            ) : pending.isError ? (
              <ErrorState size="sm" error={pending.error} onRetry={() => void pending.refetch()} />
            ) : pending.data.items.length === 0 ? (
              <EmptyState size="sm" icon={Inbox} title="Không có đơn nào chờ duyệt" />
            ) : (
              <ul className="flex flex-col divide-y">
                {pending.data.items.map((request) => (
                  <LeaveRequestRow
                    key={request.id}
                    request={request}
                    showUser
                    inQueue
                    onDecide={actions.decide}
                    onCancel={actions.cancel}
                  />
                ))}
              </ul>
            )}
          </Panel>
        )}
      </PageBody>

      <LeaveRequestDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        today={today}
        initialDay={dialog.day}
      />
      {actions.dialogs}
    </div>
  );
};

const CalendarTab = ({
  filter,
  today,
  teamId,
  canExport,
  selected,
  mobile,
  maxAvatars,
  withNames,
  onPatch,
  onSelect,
  onRequest,
  renderActions
}: {
  filter: LeaveTimeFilter;
  today: string;
  teamId: string | null;
  /** "Duyệt lịch nghỉ" (PD-065, Quản trị by default): "Xuất Excel" of the current filter (PD-057). */
  canExport: boolean;
  selected: string | null;
  mobile: boolean;
  maxAvatars: number;
  withNames: boolean;
  onPatch: (patch: Record<string, string | null>) => void;
  onSelect: (day: string) => void;
  onRequest: (day: string | null) => void;
  renderActions: (request: LeaveRequest) => React.ReactNode;
}) => {
  // Month mode always has a month; the range mode keeps the grid helpers on today's month (unused).
  const month = filter.mode === "month" ? filter.month : monthOfDay(today);
  const grid = useMemo(() => monthGrid(month), [month]);
  const span = leaveFilterWindow(filter);
  const rangeProblem = filter.mode === "range" ? validateLeaveRange(filter.from, filter.to) : null;
  // One query: the visible weeks of the month grid, or the chosen range (none while it is invalid).
  const query = filter.mode === "month" ? { from: grid.from, to: grid.to } : span;
  const calendar = useLeaveCalendar(
    query?.from ?? today,
    query?.to ?? today,
    teamId,
    query !== null
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<LeaveTimeMode>
            aria-label="Lọc theo thời gian"
            value={filter.mode}
            onChange={(next) => onPatch(leaveModePatch(filter, next, today))}
            options={timeModes}
            className="w-full sm:w-auto"
          />
          {filter.mode === "month" ? (
            <MonthNav
              month={month}
              today={today}
              onMonth={(next) => onPatch({ month: next === monthOfDay(today) ? null : next })}
            />
          ) : (
            <RangeFields
              from={filter.from}
              to={filter.to}
              today={today}
              invalid={rangeProblem !== null}
              onChange={(patch) => onPatch(patch)}
            />
          )}
          {calendar.isFetching && !calendar.isPending ? (
            <Spinner className="ml-1 size-4 text-foreground-muted" />
          ) : null}
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <TeamSelect
              value={teamId}
              onChange={(next) => onPatch({ team: next })}
              className="min-w-0 flex-1 sm:flex-none"
            />
            {canExport ? (
              <LeaveExportButton span={span} teamId={teamId} className="shrink-0" />
            ) : null}
          </div>
        </div>
        {rangeProblem ? (
          <p role="alert" className="text-xs text-danger">
            {rangeProblem}
          </p>
        ) : null}
        {canExport && mobile ? (
          <p className="text-[11px] text-foreground-muted">Xuất Excel: {LEAVE_EXPORT_HINT}</p>
        ) : null}
      </div>

      {filter.mode === "month" ? (
        <MonthView
          month={month}
          grid={grid}
          today={today}
          calendar={calendar}
          selected={selected}
          mobile={mobile}
          maxAvatars={maxAvatars}
          withNames={withNames}
          onSelect={onSelect}
          onRequest={onRequest}
          renderActions={renderActions}
        />
      ) : !span ? (
        <Panel>
          <EmptyState
            size="sm"
            icon={CalendarRange}
            title="Chọn khoảng ngày để xem"
            description="Chọn Từ ngày và Đến ngày (tối đa một năm) để xem ai nghỉ trong khoảng đó."
          />
        </Panel>
      ) : calendar.isPending ? (
        <ListSkeleton />
      ) : calendar.isError ? (
        <Panel>
          <ErrorState
            error={calendar.error}
            onRetry={() => void calendar.refetch()}
            retrying={calendar.isFetching}
          />
        </Panel>
      ) : (
        <RangePanel
          span={span}
          items={calendar.data.items}
          mobile={mobile}
          renderActions={renderActions}
        />
      )}
    </>
  );
};

const MonthNav = ({
  month,
  today,
  onMonth
}: {
  month: string;
  today: string;
  onMonth: (month: string) => void;
}) => (
  <div className="flex items-center gap-1">
    <Button
      variant="outline"
      size="icon"
      aria-label="Tháng trước"
      onClick={() => onMonth(shiftMonth(month, -1))}
    >
      <ChevronLeft />
    </Button>
    <span className="min-w-28 text-center text-sm font-semibold tabular-nums" aria-live="polite">
      {monthLabel(month)}
    </span>
    <Button
      variant="outline"
      size="icon"
      aria-label="Tháng sau"
      onClick={() => onMonth(shiftMonth(month, 1))}
    >
      <ChevronRight />
    </Button>
    {month !== monthOfDay(today) ? (
      <Button variant="ghost" size="sm" onClick={() => onMonth(monthOfDay(today))}>
        Hôm nay
      </Button>
    ) : null}
  </div>
);

/** "Khoảng ngày": Từ ngày → Đến ngày, kept in the URL; problems are shown under the toolbar. */
const RangeFields = ({
  from,
  to,
  today,
  invalid,
  onChange
}: {
  from: string | null;
  to: string | null;
  today: string;
  invalid: boolean;
  onChange: (patch: { from?: string; to?: string }) => void;
}) => (
  <div
    role="group"
    aria-label="Khoảng ngày"
    className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:flex sm:w-auto"
  >
    <DateField
      aria-label="Từ ngày"
      placeholder="Từ ngày"
      value={from}
      today={today}
      aria-invalid={invalid && (!from || (to !== null && to < from)) ? true : undefined}
      onChange={(day) => {
        if (day) onChange({ from: day });
      }}
      className="sm:w-40"
    />
    <span aria-hidden="true" className="text-xs text-foreground-muted">
      đến
    </span>
    <DateField
      aria-label="Đến ngày"
      placeholder="Đến ngày"
      value={to}
      today={today}
      minDay={from ?? undefined}
      aria-invalid={invalid ? true : undefined}
      onChange={(day) => {
        if (day) onChange({ to: day });
      }}
      className="sm:w-40"
    />
  </div>
);

const MonthView = ({
  month,
  grid,
  today,
  calendar,
  selected,
  mobile,
  maxAvatars,
  withNames,
  onSelect,
  onRequest,
  renderActions
}: {
  month: string;
  grid: ReturnType<typeof monthGrid>;
  today: string;
  calendar: ReturnType<typeof useLeaveCalendar>;
  selected: string | null;
  mobile: boolean;
  maxAvatars: number;
  withNames: boolean;
  onSelect: (day: string) => void;
  onRequest: (day: string | null) => void;
  renderActions: (request: LeaveRequest) => React.ReactNode;
}) => {
  const items = calendar.data?.items;
  const byDay = useMemo(
    () => bucketLeaveByDay(items ?? [], grid.from, grid.to),
    [grid.from, grid.to, items]
  );
  const { first, last } = monthBounds(month);
  const monthDays = useMemo(() => {
    const days: string[] = [];
    for (let day = first; day <= last; day = shiftDay(day, 1)) days.push(day);
    return days;
  }, [first, last]);
  const focusDay =
    selected && selected >= grid.from && selected <= grid.to
      ? selected
      : today >= first && today <= last
        ? today
        : first;
  const todayEntries = byDay.get(today) ?? [];

  return (
    <>
      {month === monthOfDay(today) && calendar.data ? (
        <section
          aria-label="Hôm nay"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-surface px-4 py-3 shadow-xs"
        >
          <span className="text-[13px] font-medium">Hôm nay</span>
          {todayEntries.length === 0 ? (
            <span className="text-[13px] text-foreground-muted">Không ai nghỉ.</span>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              {todayEntries.map((entry) => (
                <span
                  key={entry.request.id}
                  className="inline-flex items-center gap-1.5 text-[13px]"
                >
                  <LeaveAvatar
                    user={entry.request.user}
                    part={entry.part}
                    status={entry.request.status}
                    size="sm"
                  />
                  {entry.request.user.displayName}
                </span>
              ))}
            </span>
          )}
          <Legend />
        </section>
      ) : null}

      {calendar.isPending ? (
        <Skeleton className="h-[30rem] rounded-xl" />
      ) : calendar.isError ? (
        <Panel>
          <ErrorState
            error={calendar.error}
            onRetry={() => void calendar.refetch()}
            retrying={calendar.isFetching}
          />
        </Panel>
      ) : mobile ? (
        <Panel bodyClassName="overflow-hidden rounded-xl">
          <LeaveAgenda days={monthDays} byDay={byDay} today={today} renderActions={renderActions} />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <Panel bodyClassName="overflow-hidden rounded-xl">
            <LeaveMonthGrid
              weeks={grid.weeks}
              byDay={byDay}
              today={today}
              selected={focusDay}
              onSelect={onSelect}
              maxAvatars={maxAvatars}
              withNames={withNames}
            />
          </Panel>
          <Panel className="self-start">
            <LeaveDayDetail
              day={focusDay}
              entries={byDay.get(focusDay) ?? []}
              onRequest={(day) => onRequest(day)}
              renderActions={renderActions}
            />
          </Panel>
        </div>
      )}
    </>
  );
};

/** "Khoảng ngày": the requests overlapping the range, with a one-line summary. */
const RangePanel = ({
  span,
  items,
  mobile,
  renderActions
}: {
  span: { from: string; to: string };
  items: readonly LeaveRequest[];
  mobile: boolean;
  renderActions: (request: LeaveRequest) => React.ReactNode;
}) => {
  const { from, to } = span;
  const rows = useMemo(() => leaveRangeRows(items, { from, to }), [items, from, to]);
  return (
    <Panel
      title={`Đơn nghỉ ${formatLeaveDates(span.from, span.to)}`}
      description={rows.length > 0 ? leaveRangeSummaryText(rows, span) : undefined}
      bodyClassName="overflow-hidden rounded-b-xl"
    >
      <LeaveRangeList rows={rows} mobile={mobile} renderActions={renderActions} />
    </Panel>
  );
};

const Legend = () => (
  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground-muted sm:ml-auto">
    <span className="flex items-center gap-1">
      <span aria-hidden="true" className="size-2.5 rounded-full ring-2 ring-success/60" /> Đã duyệt
    </span>
    <span className="flex items-center gap-1">
      <span
        aria-hidden="true"
        className="size-2.5 rounded-full outline-2 outline-warning outline-dashed"
      />{" "}
      Chờ duyệt
    </span>
    <span>S = buổi sáng · C = buổi chiều</span>
  </span>
);

const MineTab = ({
  today,
  onRequest,
  onDecide,
  onCancel
}: {
  today: string;
  onRequest: () => void;
  onDecide: (request: LeaveRequest, decision: "APPROVED" | "REJECTED") => void;
  onCancel: (request: LeaveRequest) => void;
}) => {
  const mine = useMyLeaveRequests();
  const items = mine.data?.items ?? [];
  // Upcoming soonest first; past most recent first.
  const upcoming = items
    .filter((item) => item.toDate >= today)
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  const past = items
    .filter((item) => item.toDate < today)
    .sort((a, b) => b.fromDate.localeCompare(a.fromDate));

  if (mine.isPending) return <ListSkeleton />;
  if (mine.isError) {
    return (
      <Panel>
        <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
      </Panel>
    );
  }
  if (items.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={ListChecks}
          title="Bạn chưa có đơn nghỉ nào"
          description="Mọi đơn nghỉ bạn đã gửi hiện ở đây cùng trạng thái duyệt."
          action={
            <Button onClick={onRequest}>
              <CalendarPlus />
              Xin nghỉ
            </Button>
          }
        />
      </Panel>
    );
  }
  return (
    <>
      <Panel title="Sắp tới và đang nghỉ" description="Hủy được khi đơn chưa bắt đầu.">
        {upcoming.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-foreground-muted">
            Không có đơn sắp tới.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {upcoming.map((request) => (
              <LeaveRequestRow
                key={request.id}
                request={request}
                showUser={false}
                onDecide={onDecide}
                onCancel={onCancel}
              />
            ))}
          </ul>
        )}
      </Panel>
      {past.length > 0 ? (
        <Panel title="Đã qua">
          <ul className="flex flex-col divide-y">
            {past.map((request) => (
              <LeaveRequestRow
                key={request.id}
                request={request}
                showUser={false}
                onDecide={onDecide}
                onCancel={onCancel}
              />
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
};

const ListSkeleton = () => (
  <div className="flex flex-col gap-2 rounded-xl border bg-surface p-4" aria-hidden="true">
    {[0, 1, 2, 3].map((index) => (
      <Skeleton key={index} className="h-14" />
    ))}
  </div>
);
