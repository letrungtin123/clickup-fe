import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import { ChevronLeft, ChevronRight, FileUp, ListFilter, Sparkles, Target } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  CountLabel,
  PageIntro,
  SearchField,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { useCanEditProductionConfig } from "@/features/production/config-access";
import { todayIn } from "@/features/production/format";
import { useProductionMe } from "@/features/production/hooks";
import { KpiCellEditor } from "@/features/production/kpi/components/kpi-cell-editor";
import { KpiDefaultsDialog } from "@/features/production/kpi/components/kpi-defaults-dialog";
import { KpiGrid, type KpiCellRef } from "@/features/production/kpi/components/kpi-grid";
import { KpiImportDialog } from "@/features/production/kpi/components/kpi-import-dialog";
import { KpiMissingNotice } from "@/features/production/kpi/components/kpi-missing";
import { missingPeopleOf } from "@/features/production/kpi/missing";
import { useKpiMatrix, useKpiTargetsMissing } from "@/features/production/kpi/hooks";
import {
  coverageFor,
  filterMatrixRows,
  historyFor,
  kpiCellSelector,
  matrixColumns
} from "@/features/production/kpi/matrix";
import { TeamSelect } from "@/features/production/scores/components/kit";
import { closeDaysOf, periodsBetween } from "@/features/production/scores/periods";
import { kpiPeriodOfDay } from "@/contracts/production-scores";
import { sheetOnPhone, touchTargets } from "@/features/production/ui";
import { useBreakpoint } from "@/hooks/use-breakpoint";

/**
 * /production/settings/kpi (ADMIN) — KPI targets (SPEC Phase 3 §5 /admin/kpi): members × the 12
 * monthly periods (+ quarters, year) of a year, cell editor with effective_from history, CSV import
 * and "Áp KPI mặc định theo role". PD-050: only the organization superadmin sets, imports or applies targets; everyone
 * else browses the matrix and a cell opens its version history only. PD-066: KPI is mandatory — a banner lists who has
 * no KPI for the current period (the period cannot be settled until they have), with a filter to show only them.
 */
export const ProductionKpiTargetsRoute = () => {
  const canEdit = useCanEditProductionConfig();
  const me = useProductionMe();
  const breakpoint = useBreakpoint();
  const settings = me.data?.settings;
  const today = todayIn(settings?.timezone ?? "Asia/Ho_Chi_Minh");
  const currentPeriod = kpiPeriodOfDay(today, closeDaysOf(settings));
  const [year, setYear] = useState(Number(currentPeriod.slice(0, 4)));
  const [term, setTerm] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [cell, setCell] = useState<KpiCellRef | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const matrix = useKpiMatrix(year);
  const missing = useKpiTargetsMissing(currentPeriod);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const missingIds = useMemo(
    () => new Set((missing.data?.items ?? []).map((item) => item.user.id)),
    [missing.data]
  );
  const filteringMissing = onlyMissing && missingIds.size > 0;

  const data = matrix.data;
  const columns = useMemo(() => (data ? matrixColumns(data) : []), [data]);
  const rows = useMemo(() => {
    const found = data ? filterMatrixRows(data.rows, { q: term, teamId }) : [];
    return filteringMissing ? found.filter((item) => missingIds.has(item.user.id)) : found;
  }, [data, term, teamId, filteringMissing, missingIds]);
  const names = useMemo(
    () => new Map((data?.rows ?? []).map((row) => [row.user.id, row.user.displayName])),
    [data]
  );
  const yearPeriods = periodsBetween(`${year}-01`, `${year}-12`);
  const defaultPeriod = yearPeriods.includes(currentPeriod) ? currentPeriod : `${year}-01`;
  const currentIndex = data?.periods.indexOf(currentPeriod) ?? -1;

  const row = cell ? data?.rows.find((item) => item.user.id === cell.userId) : undefined;
  const column = cell ? columns.find((item) => item.key === cell.column) : undefined;
  const value = row && column ? column.pick(row) : undefined;
  const editor =
    cell && row && column && value && data ? (
      <KpiCellEditor
        key={`${cell.userId}:${cell.column}:${year}`}
        row={row}
        column={column}
        cell={value}
        versions={historyFor(data.history, row.user.id, column.periodType)}
        readOnly={!canEdit}
        onDone={() => setCell(null)}
      />
    ) : null;
  const cellElement = () =>
    cell ? (scrollRef.current?.querySelector<HTMLElement>(kpiCellSelector(cell)) ?? null) : null;

  return (
    <SettingsPage wide className="max-w-[min(100%,96rem)]">
      <PageIntro
        slug="kpi"
        actions={
          canEdit ? (
            <>
              <Button variant="outline" onClick={() => setDefaultsOpen(true)}>
                <Sparkles />
                <span className="max-sm:sr-only">Áp KPI mặc định theo role</span>
              </Button>
              <Button onClick={() => setImportOpen(true)}>
                <FileUp />
                Nhập CSV
              </Button>
            </>
          ) : undefined
        }
      />

      {missing.data && missing.data.items.length > 0 ? (
        <KpiMissingNotice
          period={missing.data.period}
          people={missingPeopleOf(missing.data)}
          requiredCount={missing.data.requiredCount}
          description={
            canEdit
              ? "KPI là bắt buộc với mọi thành viên Photo Retouch (trừ Director và Siêu quản trị). Đặt KPI tháng cho những người này (ô kỳ hiện tại, Nhập CSV hoặc Áp KPI mặc định) — chưa đủ thì chưa chốt được kỳ."
              : "KPI là bắt buộc với mọi thành viên Photo Retouch (trừ Director và Siêu quản trị); Siêu quản trị đặt KPI cho những người này — chưa đủ thì chưa chốt được kỳ."
          }
          action={
            <Button
              variant="outline"
              size="sm"
              aria-pressed={filteringMissing}
              onClick={() => {
                setOnlyMissing(!filteringMissing);
                if (!filteringMissing) setYear(Number(currentPeriod.slice(0, 4)));
              }}
            >
              <ListFilter />
              {filteringMissing ? "Hiện tất cả" : "Chỉ hiện những người này"}
            </Button>
          }
        />
      ) : null}

      <SettingsSection bodyClassName="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Năm trước"
              onClick={() => setYear(year - 1)}
            >
              <ChevronLeft />
            </Button>
            <span
              className="min-w-16 text-center text-sm font-semibold tabular-nums"
              aria-live="polite"
            >
              {year}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Năm sau"
              onClick={() => setYear(year + 1)}
            >
              <ChevronRight />
            </Button>
            {matrix.isFetching && !matrix.isPending ? (
              <Spinner className="ml-1 size-3.5 text-foreground-muted" />
            ) : null}
          </div>
          <SearchField
            value={term}
            onChange={setTerm}
            placeholder="Tìm theo tên hoặc email"
            label="Tìm thành viên"
            className="basis-full sm:basis-auto"
          />
          <TeamSelect value={teamId} onChange={setTeamId} />
          {data ? (
            <span className="ml-auto flex flex-wrap items-center gap-x-3 text-xs text-foreground-muted">
              <CountLabel shown={rows.length} total={data.rows.length} noun="người" />
              {currentIndex >= 0 ? (
                <span className="tabular-nums">
                  {coverageFor(data.rows, currentIndex)}/{data.rows.length} có KPI kỳ này
                </span>
              ) : null}
            </span>
          ) : null}
        </div>

        <div ref={scrollRef} className="min-w-0">
          {matrix.isPending ? (
            <div className="flex flex-col gap-2 p-4" aria-hidden="true">
              <Skeleton className="h-10" />
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <Skeleton key={index} className="h-11" />
              ))}
            </div>
          ) : matrix.isError ? (
            <ErrorState
              error={matrix.error}
              onRetry={() => void matrix.refetch()}
              retrying={matrix.isFetching}
            />
          ) : data && data.rows.length === 0 ? (
            <EmptyState
              icon={Target}
              title="Chưa có thành viên Photo Retouch"
              description="Gán vai trò Photo Retouch cho thành viên trước, rồi đặt KPI cho từng người."
            />
          ) : rows.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Target}
              title="Không có thành viên phù hợp"
              description="Thử từ khóa khác hoặc bỏ lọc team."
            />
          ) : (
            <KpiGrid
              rows={rows}
              columns={columns}
              currentColumn={currentIndex >= 0 ? currentPeriod : null}
              activeCell={cell}
              onOpenCell={setCell}
            />
          )}
        </div>
        {data && rows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 text-[11px] text-foreground-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
              <span className="font-semibold text-foreground">Đậm</span> = phiên bản bắt đầu từ kỳ
              đó
            </span>
            <span>Nhạt = kế thừa từ phiên bản trước · — = chưa có</span>
            <span>Quý/Năm trống thì chỉ tiêu = tổng các tháng</span>
            <span className="hidden md:inline">
              {canEdit
                ? "Phím mũi tên để di chuyển, Enter để sửa."
                : "Phím mũi tên để di chuyển, Enter để xem lịch sử."}
            </span>
          </div>
        ) : null}
      </SettingsSection>

      {breakpoint === "mobile" ? (
        <Dialog open={editor !== null} onOpenChange={(open) => !open && setCell(null)}>
          <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
            <DialogHeader className="sr-only">
              <DialogTitle>KPI</DialogTitle>
              <DialogDescription>
                {canEdit ? "Đặt chỉ tiêu cho ô đã chọn." : "Lịch sử chỉ tiêu của ô đã chọn."}
              </DialogDescription>
            </DialogHeader>
            {editor}
          </DialogContent>
        </Dialog>
      ) : (
        <PopoverPrimitive.Root
          open={editor !== null}
          onOpenChange={(open) => !open && setCell(null)}
        >
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner
              anchor={cellElement}
              side="bottom"
              align="start"
              sideOffset={4}
              collisionPadding={12}
              className="isolate z-50"
            >
              <PopoverPrimitive.Popup
                aria-label="KPI"
                finalFocus={() => cellElement()}
                className={cn(
                  "z-50 w-[23rem] max-w-[calc(100vw-1.5rem)] origin-(--transform-origin) rounded-xl bg-popover p-3.5 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-hidden duration-150",
                  "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                  touchTargets
                )}
              >
                {editor}
              </PopoverPrimitive.Popup>
            </PopoverPrimitive.Positioner>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      )}

      {canEdit ? (
        <>
          <KpiImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            year={year}
            defaultPeriod={defaultPeriod}
          />
          <KpiDefaultsDialog
            open={defaultsOpen}
            onOpenChange={setDefaultsOpen}
            periods={yearPeriods}
            defaultPeriod={defaultPeriod}
            names={names}
          />
        </>
      ) : null}
    </SettingsPage>
  );
};
