import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import { CalendarPlus, Coins, Download, FileUp, FolderKanban, Workflow } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";

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
import { CreditCellEditor } from "@/features/production/components/credit/credit-cell-editor";
import { cellSelector, type CellRef } from "@/features/production/components/credit/cells";
import { CreditGrid } from "@/features/production/components/credit/credit-grid";
import { CreditImportDialog } from "@/features/production/components/credit/credit-import-dialog";
import { CreditVersionDialog } from "@/features/production/components/credit/credit-version-dialog";
import { downloadText } from "@/features/production/components/credit/download";
import { DateField } from "@/features/production/components/date-field";
import {
  ArchivedToggle,
  PageIntro,
  SearchField,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import {
  filterMatrix,
  indexRules,
  lookupRule,
  matrixCoverage,
  matrixToCsv
} from "@/features/production/credit-matrix";
import { formatDay, todayIn } from "@/features/production/format";
import { useCreditMatrix, useProductionAccess, useProductionMe } from "@/features/production/hooks";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { sheetOnPhone, touchTargets } from "@/features/production/ui";

/**
 * Credit rules (SPEC Phase 1): projects × processes for a chosen day, cell editor with version
 * history, "new version from…", CSV import (all-or-nothing) and export.
 */
export const ProductionCreditRulesRoute = () => {
  const me = useProductionMe();
  const access = useProductionAccess();
  const breakpoint = useBreakpoint();
  const timezone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const today = todayIn(timezone);
  const [at, setAt] = useState(today);
  const [term, setTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [cell, setCell] = useState<CellRef | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const matrix = useCreditMatrix(at);
  const canEdit = access.isAdmin;

  const index = useMemo(() => indexRules(matrix.data?.rules ?? []), [matrix.data]);
  const view = useMemo(
    () =>
      matrix.data
        ? filterMatrix(matrix.data, { q: term, showArchived })
        : { projects: [], processes: [] },
    [matrix.data, term, showArchived]
  );
  const coverage = matrixCoverage(view, index);
  const archivedCount =
    (matrix.data?.projects.filter((project) => !project.active).length ?? 0) +
    (matrix.data?.processes.filter((process) => !process.active).length ?? 0);

  const project = cell
    ? matrix.data?.projects.find((item) => item.id === cell.projectId)
    : undefined;
  const process = cell
    ? matrix.data?.processes.find((item) => item.id === cell.processId)
    : undefined;
  const editor =
    cell && project && process ? (
      <CreditCellEditor
        key={`${cell.projectId}:${cell.processId}:${at}`}
        project={project}
        process={process}
        rule={lookupRule(index, project.id, process.id)}
        at={at}
        today={today}
        canEdit={canEdit}
        onDone={() => setCell(null)}
      />
    ) : null;
  const cellElement = () =>
    cell ? (scrollRef.current?.querySelector<HTMLElement>(cellSelector(cell)) ?? null) : null;

  const exportCsv = () => downloadText(`don-gia-${at}.csv`, matrixToCsv(view, index));

  return (
    <SettingsPage wide className="max-w-[min(100%,96rem)]">
      <PageIntro
        slug="credit-rules"
        actions={
          canEdit ? (
            <>
              <Button variant="outline" onClick={() => setVersionOpen(true)}>
                <CalendarPlus />
                <span className="max-sm:sr-only">Tạo phiên bản mới từ ngày…</span>
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={coverage.filled === 0}>
                <Download />
                <span className="max-sm:sr-only">Xuất CSV</span>
              </Button>
              <Button onClick={() => setImportOpen(true)}>
                <FileUp />
                Nhập CSV
              </Button>
            </>
          ) : null
        }
      />

      <SettingsSection bodyClassName="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span className="shrink-0 text-xs text-foreground-muted">Áp dụng ngày</span>
            <DateField
              value={at}
              onChange={(day) => {
                if (day) setAt(day);
                setCell(null);
              }}
              today={today}
              aria-label="Ngày áp dụng của bảng đơn giá"
              className="w-full sm:w-40"
            />
            {at !== today ? (
              <Button variant="ghost" size="sm" onClick={() => setAt(today)}>
                Hôm nay
              </Button>
            ) : null}
            {matrix.isFetching && !matrix.isPending ? (
              <Spinner className="size-3.5 text-foreground-muted" />
            ) : null}
          </div>
          <SearchField
            value={term}
            onChange={setTerm}
            placeholder="Tìm mã dự án, tên, khách hàng"
            label="Tìm dự án"
            className="basis-full sm:basis-auto"
          />
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            <ArchivedToggle
              checked={showArchived}
              onChange={setShowArchived}
              count={archivedCount}
            />
            {matrix.data ? (
              <span className="text-xs whitespace-nowrap text-foreground-muted tabular-nums">
                {coverage.filled}/{coverage.total} ô có giá
              </span>
            ) : null}
          </div>
        </div>

        {matrix.isPending ? (
          <div className="flex flex-col gap-2 p-4" aria-hidden="true">
            <Skeleton className="h-10" />
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <Skeleton key={row} className="h-11" />
            ))}
          </div>
        ) : matrix.isError ? (
          <ErrorState
            error={matrix.error}
            onRetry={() => void matrix.refetch()}
            retrying={matrix.isFetching}
          />
        ) : matrix.data.projects.length === 0 || matrix.data.processes.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="Chưa có dự án hoặc quy trình"
            description="Tạo dự án và quy trình trước, hoặc nhập CSV với tùy chọn “Tạo mới nếu chưa có” để tạo cùng lúc."
            action={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link to="/production/settings/projects" />}
                  nativeButton={false}
                >
                  <FolderKanban />
                  Dự án
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link to="/production/settings/processes" />}
                  nativeButton={false}
                >
                  <Workflow />
                  Quy trình
                </Button>
                {canEdit ? (
                  <Button size="sm" onClick={() => setImportOpen(true)}>
                    <FileUp />
                    Nhập CSV
                  </Button>
                ) : null}
              </>
            }
          />
        ) : view.projects.length === 0 || view.processes.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Coins}
            title="Không có dự án phù hợp"
            description="Thử từ khóa khác hoặc hiện mục đã lưu trữ."
          />
        ) : (
          <CreditGrid
            view={view}
            index={index}
            at={at}
            canEdit={canEdit}
            activeCell={cell}
            scrollRef={scrollRef}
            onOpenCell={(next) => setCell(next)}
          />
        )}
        {matrix.data && view.projects.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 text-[11px] text-foreground-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" /> Phiên bản bắt
              đầu đúng ngày {formatDay(at)}
            </span>
            <span>Số trên: điểm/tấm · số dưới: tiền/tấm (— = không có tiền)</span>
            <span className="hidden md:inline">Phím mũi tên để di chuyển, Enter để sửa.</span>
          </div>
        ) : null}
      </SettingsSection>

      {breakpoint === "mobile" ? (
        <Dialog open={editor !== null} onOpenChange={(open) => !open && setCell(null)}>
          <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
            <DialogHeader className="sr-only">
              <DialogTitle>Đơn giá</DialogTitle>
              <DialogDescription>Đặt điểm và tiền mỗi tấm cho ô đã chọn.</DialogDescription>
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
                aria-label="Đơn giá"
                finalFocus={() => cellElement()}
                className={cn(
                  "z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] origin-(--transform-origin) rounded-xl bg-popover p-3.5 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-hidden duration-150",
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
          <CreditImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            today={today}
            onImported={(day) => {
              setAt(day);
              setTerm("");
            }}
          />
          <CreditVersionDialog
            open={versionOpen}
            onOpenChange={setVersionOpen}
            today={today}
            onCreated={(day) => setAt(day)}
          />
        </>
      ) : null}
    </SettingsPage>
  );
};
