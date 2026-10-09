import { cn } from "cn";
import { useState, type KeyboardEvent } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { productionRoleLabels } from "../../roles";
import type { ProductionRole } from "@/contracts/production-catalog";
import { formatTarget, kpiCellSelector, type MatrixColumn, type MatrixRow } from "../matrix";

export type KpiCellRef = { userId: string; column: string };


const knownRoles = new Set(Object.keys(productionRoleLabels));

/**
 * Users × KPI periods. The header row and the people column stay pinned while the matrix scrolls
 * inside its card (never the page). Cells form a roving-tabindex grid: arrows move, Home/End jump
 * within a row, Enter/Space opens the editor. Bold = a version starts at that period; muted =
 * inherited from an earlier version.
 */
export const KpiGrid = ({
  rows,
  columns,
  currentColumn,
  activeCell,
  onOpenCell
}: {
  rows: readonly MatrixRow[];
  columns: readonly MatrixColumn[];
  /** Column key of the current period (highlighted). */
  currentColumn: string | null;
  activeCell: KpiCellRef | null;
  onOpenCell: (cell: KpiCellRef) => void;
}) => {
  const breakpoint = useBreakpoint();
  const compact = breakpoint === "mobile";
  const [focus, setFocus] = useState({ row: 0, col: 0 });

  const move = (row: number, col: number, container: HTMLElement) => {
    const target = rows[row];
    const column = columns[col];
    if (!target || !column) return;
    setFocus({ row, col });
    container
      .querySelector<HTMLElement>(kpiCellSelector({ userId: target.user.id, column: column.key }))
      ?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const element = event.target as HTMLElement;
    if (element.dataset.kpiRow === undefined) return;
    const row = Number(element.dataset.kpiRow);
    const col = Number(element.dataset.kpiIndex);
    const lastRow = rows.length - 1;
    const lastCol = columns.length - 1;
    const moves: Record<string, [number, number]> = {
      ArrowDown: [Math.min(lastRow, row + 1), col],
      ArrowUp: [Math.max(0, row - 1), col],
      ArrowRight: [row, Math.min(lastCol, col + 1)],
      ArrowLeft: [row, Math.max(0, col - 1)],
      Home: [row, 0],
      End: [row, lastCol]
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    move(next[0], next[1], event.currentTarget);
  };

  return (
    <div
      className="max-h-[min(68dvh,calc(100dvh-15rem))] min-h-40 overflow-auto overscroll-contain rounded-b-xl"
      onKeyDown={onKeyDown}
    >
      <table
        role="grid"
        aria-label="Chỉ tiêu KPI theo người và kỳ"
        className="w-max min-w-full border-separate border-spacing-0 text-[13px]"
      >
        <thead>
          <tr>
            <th
              scope="col"
              className={cn(
                "sticky top-0 left-0 z-30 border-r border-b bg-surface px-3 py-2.5 text-left text-xs font-medium text-foreground-muted",
                compact ? "w-36 min-w-36" : "w-60 min-w-60"
              )}
            >
              Thành viên
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                title={column.title}
                className={cn(
                  "sticky top-0 z-20 min-w-[4.75rem] border-b bg-surface/95 px-2 py-2.5 text-right text-xs font-medium text-foreground-muted backdrop-blur-sm",
                  column.periodType !== "MONTH" && "bg-muted/95",
                  column.key === "Q1" && "border-l",
                  column.key === currentColumn && "text-brand-text"
                )}
              >
                {column.label}
                {column.key === currentColumn ? (
                  <span className="sr-only"> (kỳ hiện tại)</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.user.id} className="group/row">
              <th
                scope="row"
                className={cn(
                  "sticky left-0 z-10 border-r border-b border-border/70 bg-surface px-3 py-2 text-left font-normal group-hover/row:bg-[color-mix(in_oklch,var(--surface),var(--foreground)_3%)]",
                  compact ? "w-36 min-w-36 max-w-36" : "w-60 min-w-60 max-w-60"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {compact ? null : <UserAvatar user={row.user} size="sm" />}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{row.user.displayName}</span>
                    <span className="truncate text-[11px] text-foreground-muted">
                      {row.roles
                        .filter((role) => knownRoles.has(role))
                        .map((role) => productionRoleLabels[role as ProductionRole])
                        .join(", ") || "Không có vai trò"}
                    </span>
                  </span>
                </span>
              </th>
              {columns.map((column, colIndex) => {
                const value = column.pick(row);
                const active =
                  activeCell?.userId === row.user.id && activeCell.column === column.key;
                const tabbable = focus.row === rowIndex && focus.col === colIndex;
                const hasValue = value !== undefined && value.targetPoints !== null;
                return (
                  <td
                    key={column.key}
                    className={cn(
                      "border-b border-border/70 p-0",
                      column.periodType !== "MONTH" && "bg-muted/40",
                      column.key === "Q1" && "border-l",
                      column.key === currentColumn && "bg-brand-soft/40"
                    )}
                  >
                    <button
                      type="button"
                      data-kpi-user={row.user.id}
                      data-kpi-col={column.key}
                      data-kpi-row={rowIndex}
                      data-kpi-index={colIndex}
                      tabIndex={tabbable ? 0 : -1}
                      aria-label={`${row.user.displayName}, ${column.title}: ${hasValue ? `${formatTarget(value.targetPoints)} điểm${value.explicit ? "" : " (kế thừa)"}` : "chưa có chỉ tiêu"}`}
                      onFocus={() => setFocus({ row: rowIndex, col: colIndex })}
                      onClick={() => onOpenCell({ userId: row.user.id, column: column.key })}
                      className={cn(
                        "relative flex h-11 w-full items-center justify-end gap-1 px-2 tabular-nums outline-none transition-colors duration-100 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        active && "bg-brand-soft ring-2 ring-brand ring-inset",
                        hasValue
                          ? value.explicit
                            ? "font-semibold text-foreground"
                            : "text-foreground-muted"
                          : "text-foreground-subtle"
                      )}
                    >
                      {hasValue && value.explicit ? (
                        <span aria-hidden="true" className="absolute top-1.5 left-1.5 size-1.5 rounded-full bg-brand" />
                      ) : null}
                      {hasValue ? formatTarget(value.targetPoints) : "—"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
