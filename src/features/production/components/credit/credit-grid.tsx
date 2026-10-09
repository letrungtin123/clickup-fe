import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import { BadgeCheck, Plus } from "lucide-react";
import { useCallback, useState, type KeyboardEvent } from "react";

import type { CreditRule, Process, ProductionProject } from "@/contracts/production-catalog";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { lookupRule, type MatrixView, type RuleIndex } from "../../credit-matrix";
import { formatCredit, formatDay, formatMoney } from "../../format";
import { cellSelector, type CellRef } from "./cells";

const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 48;

type CreditGridProps = {
  view: MatrixView;
  index: RuleIndex;
  /** Matrix day (YYYY-MM-DD). */
  at: string;
  canEdit: boolean;
  /** Cell whose editor is open (highlighted). */
  activeCell: CellRef | null;
  onOpenCell: (cell: CellRef, element: HTMLElement) => void;
  /** Exposes the scroll container so the editor can anchor to (virtualized) cells. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

/**
 * Projects × processes grid. Header row and project column stay pinned while the grid scrolls
 * inside its own container (never the page); rows are virtualized for large catalogs. Cells form a
 * roving-tabindex grid: arrows move, Home/End jump within a row, Enter opens the editor.
 */
export const CreditGrid = ({
  view,
  index,
  at,
  canEdit,
  activeCell,
  onOpenCell,
  scrollRef
}: CreditGridProps) => {
  const breakpoint = useBreakpoint();
  const compact = breakpoint === "mobile";
  const firstWidth = compact ? 136 : 224;
  const cellWidth = compact ? 112 : 136;
  const template = `${firstWidth}px repeat(${view.processes.length}, ${cellWidth}px)`;
  const [focus, setFocus] = useState<{ row: number; col: number }>({ row: 0, col: 0 });

  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer instance is read during render on purpose
  const virtualizer = useVirtualizer({
    count: view.projects.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (rowIndex) => view.projects[rowIndex]?.id ?? rowIndex
  });

  const focusCell = useCallback(
    (row: number, col: number) => {
      const project = view.projects[row];
      const process = view.processes[col];
      if (!project || !process) return;
      setFocus({ row, col });
      virtualizer.scrollToIndex(row, { align: "auto" });
      requestAnimationFrame(() =>
        scrollRef.current
          ?.querySelector<HTMLElement>(
            cellSelector({ projectId: project.id, processId: process.id })
          )
          ?.focus({ preventScroll: false })
      );
    },
    [scrollRef, view.processes, view.projects, virtualizer]
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.dataset.cell) return;
    const row = Number(target.dataset.row);
    const col = Number(target.dataset.col);
    const lastRow = view.projects.length - 1;
    const lastCol = view.processes.length - 1;
    const moves: Record<string, [number, number]> = {
      ArrowDown: [Math.min(lastRow, row + 1), col],
      ArrowUp: [Math.max(0, row - 1), col],
      ArrowRight: [row, Math.min(lastCol, col + 1)],
      ArrowLeft: [row, Math.max(0, col - 1)],
      Home: [row, 0],
      End: [row, lastCol],
      PageDown: [Math.min(lastRow, row + 10), col],
      PageUp: [Math.max(0, row - 10), col]
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    focusCell(next[0], next[1]);
  };

  const totalHeight = HEADER_HEIGHT + view.projects.length * ROW_HEIGHT;
  const virtualItems = virtualizer.getVirtualItems();
  // Keep one tab stop even when the focused row was virtualized away.
  const tabRow = virtualItems.some((item) => item.index === focus.row)
    ? focus.row
    : (virtualItems[0]?.index ?? 0);
  const tabCol = tabRow === focus.row ? focus.col : 0;

  return (
    <div
      ref={scrollRef}
      className="relative max-h-[min(70dvh,calc(100dvh-16rem))] min-h-40 overflow-auto overscroll-contain rounded-b-xl"
      style={{ height: totalHeight + 2 }}
      onKeyDown={onKeyDown}
    >
      <div
        role="grid"
        aria-label={`Bảng đơn giá áp dụng ngày ${formatDay(at)}`}
        aria-rowcount={view.projects.length + 1}
        aria-colcount={view.processes.length + 1}
        className="relative min-w-max"
        style={{ height: totalHeight, width: firstWidth + view.processes.length * cellWidth }}
      >
        <div
          role="row"
          aria-rowindex={1}
          className="sticky top-0 z-20 grid border-b bg-surface/95 backdrop-blur-sm"
          style={{ gridTemplateColumns: template, height: HEADER_HEIGHT }}
        >
          <div
            role="columnheader"
            className="sticky left-0 z-10 flex items-center border-r bg-surface px-3 text-xs font-medium text-foreground-muted"
          >
            Dự án \ Quy trình
          </div>
          {view.processes.map((process) => (
            <ProcessHeader key={process.id} process={process} />
          ))}
        </div>
        {virtualItems.map((virtualRow) => {
          const project = view.projects[virtualRow.index];
          if (!project) return null;
          return (
            <div
              key={virtualRow.key}
              role="row"
              aria-rowindex={virtualRow.index + 2}
              className="group/row absolute inset-x-0 grid border-b border-border/70"
              style={{
                top: HEADER_HEIGHT,
                height: ROW_HEIGHT,
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: template
              }}
            >
              <ProjectHeader project={project} />
              {view.processes.map((process, col) => {
                const rule = lookupRule(index, project.id, process.id);
                const active =
                  activeCell?.projectId === project.id && activeCell.processId === process.id;
                return (
                  <CreditCell
                    key={process.id}
                    project={project}
                    process={process}
                    rule={rule}
                    at={at}
                    row={virtualRow.index}
                    col={col}
                    tabbable={tabRow === virtualRow.index && tabCol === col}
                    active={active}
                    canEdit={canEdit}
                    onFocus={() => setFocus({ row: virtualRow.index, col })}
                    onOpen={(element) =>
                      onOpenCell({ projectId: project.id, processId: process.id }, element)
                    }
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ProcessHeader = ({ process }: { process: Process }) => (
  <div
    role="columnheader"
    title={process.active ? process.name : `${process.name} (đã lưu trữ)`}
    className={cn(
      "flex min-w-0 flex-col justify-center gap-0.5 border-r border-border/60 px-3 text-xs font-medium last:border-r-0",
      !process.active && "text-foreground-subtle"
    )}
  >
    <span className="truncate text-foreground">{process.name}</span>
    {process.isQc || !process.active ? (
      <span className="flex items-center gap-1 text-[10px] font-normal text-foreground-muted">
        {process.isQc ? (
          <>
            <BadgeCheck className="size-3 text-success" aria-hidden="true" /> Quy trình QC
          </>
        ) : (
          "Đã lưu trữ"
        )}
      </span>
    ) : null}
  </div>
);

const ProjectHeader = ({ project }: { project: ProductionProject }) => (
  <div
    role="rowheader"
    className="sticky left-0 z-10 flex min-w-0 flex-col justify-center gap-0.5 border-r bg-surface px-3 group-hover/row:bg-[color-mix(in_oklch,var(--surface),var(--foreground)_3%)]"
    title={`${project.code} · ${project.name}${project.clientName ? ` · ${project.clientName}` : ""}`}
  >
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate font-mono text-xs font-semibold">{project.code}</span>
      {!project.active ? (
        <span className="shrink-0 text-[10px] text-foreground-subtle">lưu trữ</span>
      ) : null}
    </span>
    <span className="truncate text-[11px] text-foreground-muted">
      {project.clientName ?? project.name}
    </span>
  </div>
);

type CreditCellProps = {
  project: ProductionProject;
  process: Process;
  rule: CreditRule | null;
  at: string;
  row: number;
  col: number;
  tabbable: boolean;
  active: boolean;
  canEdit: boolean;
  onFocus: () => void;
  onOpen: (element: HTMLElement) => void;
};

const CreditCell = ({
  project,
  process,
  rule,
  at,
  row,
  col,
  tabbable,
  active,
  canEdit,
  onFocus,
  onOpen
}: CreditCellProps) => {
  const startsToday = rule?.effectiveFrom === at;
  const label = rule
    ? `${project.code} × ${process.name}: ${formatCredit(rule.creditPerImage)} credit, ${
        rule.moneyPerImage === null ? "không có tiền" : formatMoney(rule.moneyPerImage)
      }, áp dụng từ ${formatDay(rule.effectiveFrom)}`
    : `${project.code} × ${process.name}: chưa có đơn giá`;
  return (
    <div
      role="gridcell"
      aria-colindex={col + 2}
      className="min-w-0 border-r border-border/60 last:border-r-0"
    >
      <button
        type="button"
        data-cell={`${project.id}:${process.id}`}
        data-row={row}
        data-col={col}
        tabIndex={tabbable ? 0 : -1}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={active}
        onFocus={onFocus}
        onClick={(event) => onOpen(event.currentTarget)}
        className={cn(
          "group/cell relative flex size-full flex-col items-end justify-center gap-0.5 px-3 text-right outline-none transition-colors duration-100",
          "hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          active && "bg-brand-soft ring-2 ring-brand ring-inset hover:bg-brand-soft"
        )}
      >
        {startsToday ? (
          <span
            aria-hidden="true"
            title="Phiên bản bắt đầu đúng ngày đang xem"
            className="absolute top-1.5 left-1.5 size-1.5 rounded-full bg-brand"
          />
        ) : null}
        {rule ? (
          <>
            <span className="text-[13px] font-medium tabular-nums">
              {formatCredit(rule.creditPerImage)}
            </span>
            <span
              className={cn(
                "text-[11px] tabular-nums",
                rule.moneyPerImage === null ? "text-foreground-subtle" : "text-foreground-muted"
              )}
            >
              {formatMoney(rule.moneyPerImage)}
            </span>
          </>
        ) : canEdit ? (
          <span className="flex items-center gap-1 text-xs text-foreground-subtle/70 group-hover/cell:text-foreground-muted">
            <Plus
              className="size-3 opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100"
              aria-hidden="true"
            />
            —
          </span>
        ) : (
          <span className="text-xs text-foreground-subtle">—</span>
        )}
      </button>
    </div>
  );
};
