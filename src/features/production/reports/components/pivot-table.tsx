import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useRef } from "react";

import {
  reportMeasureInfo,
  type ReportMeasure,
  type ReportResult
} from "@/contracts/production-reports";

import { columnLabel, type DimensionKey } from "../dimensions";
import { formatMeasure, isAdditive } from "../format";
import { buildPivot, cellKey, type PivotRow } from "../pivot";

/**
 * Pivot table of a report result: "Hàng" values down the sticky first column, one column group per
 * "Cột" value (× each measure) plus a "Tổng" group, and a sticky totals row (server totals; sub-totals
 * of rates are recomputed from their parts or left empty, never summed). Scrolls inside its card;
 * long results are virtualized.
 */

type SortState = { key: DimensionKey | ReportMeasure; direction: "asc" | "desc" } | undefined;

type Props = {
  /** `columns` (server labels) names custom-field dimensions. */
  result: Pick<ReportResult, "rows" | "totals"> & { columns?: ReportResult["columns"] };
  rows: readonly DimensionKey[];
  columns: readonly DimensionKey[];
  measures: readonly ReportMeasure[];
  /** MULTISELECT custom-field dimensions: their sub-totals are not summed. */
  multiValue?: ReadonlySet<string> | undefined;
  sort?: SortState;
  onSort?: ((key: DimensionKey | ReportMeasure) => void) | undefined;
  className?: string;
  /** Cap the scroll area (default 70vh). */
  maxHeightClass?: string;
};

const ROW_HEIGHT = 37;
const VIRTUAL_FROM = 120;

const SortIcon = ({
  active,
  direction
}: {
  active: boolean;
  direction: "asc" | "desc" | undefined;
}) =>
  !active ? (
    <ArrowUpDown
      className="size-3 opacity-0 transition-opacity group-hover/sort:opacity-60"
      aria-hidden="true"
    />
  ) : direction === "asc" ? (
    <ArrowUp className="size-3" aria-hidden="true" />
  ) : (
    <ArrowDown className="size-3" aria-hidden="true" />
  );

const notSummed = "Tỉ lệ và trung bình không cộng dồn được giữa các cột.";
const notSummedMulti =
  "Trường chọn nhiều: một bản ghi nằm ở nhiều lựa chọn nên không cộng dồn các lựa chọn. Xem dòng Tổng cuối bảng.";

export const PivotTable = ({
  result,
  rows: rowDimensions,
  columns: columnDimensions,
  measures,
  multiValue,
  sort,
  onSort,
  className,
  maxHeightClass = "max-h-[70vh]"
}: Props) => {
  const pivot = useMemo(
    () => buildPivot(result, rowDimensions, columnDimensions, measures, multiValue),
    [result, rowDimensions, columnDimensions, measures, multiValue]
  );
  const headerOf = (dimension: DimensionKey) => columnLabel(dimension, result.columns);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = pivot.rows.length > VIRTUAL_FROM;
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns fresh functions by design
  const virtualizer = useVirtualizer({
    count: pivot.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    enabled: virtual
  });

  const hasColumns = pivot.columnDimensions.length > 0;
  const groups = hasColumns ? pivot.groups : [];
  const rowTitle = pivot.rowDimensions.map(headerOf).join(" · ") || (hasColumns ? "" : "Tổng cộng");
  const columnTitle = pivot.columnDimensions.map(headerOf).join(" · ");
  const singleMeasure = pivot.measures.length === 1;
  const headerRows = hasColumns && !singleMeasure ? 2 : 1;

  const sortable = (key: DimensionKey | ReportMeasure) =>
    Boolean(onSort) && !hasColumns && key !== undefined;
  const sortButton = (
    key: DimensionKey | ReportMeasure,
    label: string,
    align: "left" | "right"
  ) => {
    const active = sort?.key === key;
    if (!sortable(key)) return label;
    return (
      <button
        type="button"
        onClick={() => onSort?.(key)}
        className={cn(
          "group/sort inline-flex max-w-full items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          align === "right" && "flex-row-reverse"
        )}
        aria-label={`Sắp xếp theo ${label}`}
      >
        <span className="truncate">{label}</span>
        <SortIcon active={active} direction={active ? sort?.direction : undefined} />
      </button>
    );
  };
  const ariaSort = (key: DimensionKey | ReportMeasure) =>
    sort?.key === key && !hasColumns
      ? sort.direction === "asc"
        ? "ascending"
        : "descending"
      : undefined;

  const items = virtual ? virtualizer.getVirtualItems() : null;
  const visibleRows: { row: PivotRow; index: number }[] = items
    ? items.flatMap((item) => {
        const row = pivot.rows[item.index];
        return row ? [{ row, index: item.index }] : [];
      })
    : pivot.rows.map((row, index) => ({ row, index }));
  const paddingTop = items && items.length > 0 ? (items[0]?.start ?? 0) : 0;
  const paddingBottom =
    items && items.length > 0
      ? virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0)
      : 0;
  const columnCount =
    1 +
    (groups.length + (hasColumns ? 1 : 0)) * pivot.measures.length +
    (hasColumns ? 0 : pivot.measures.length);

  const headCell =
    "sticky top-0 z-10 border-b bg-surface-raised px-3 py-2 text-xs font-medium text-foreground-muted whitespace-nowrap";
  const numberCell = "px-3 py-2 text-right whitespace-nowrap tabular-nums";
  const firstCell =
    "sticky left-0 z-[1] max-w-[10rem] min-w-[7rem] border-r bg-surface px-3 py-2 text-left sm:max-w-[20rem] sm:min-w-[9rem]";

  const value = (measure: ReportMeasure, cell: number | null | undefined) =>
    formatMeasure(measure, cell);
  const cellTitle = (measure: ReportMeasure, cell: number | null | undefined, unsummed = false) =>
    cell === null && unsummed
      ? notSummedMulti
      : cell === null && !isAdditive(measure)
        ? notSummed
        : undefined;

  return (
    <div
      ref={scrollRef}
      className={cn(
        "relative w-full min-w-0 overflow-auto overscroll-contain rounded-b-xl",
        maxHeightClass,
        className
      )}
      tabIndex={0}
      role="region"
      aria-label="Bảng kết quả báo cáo"
    >
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">
          {[rowTitle && `Hàng: ${rowTitle}`, columnTitle && `Cột: ${columnTitle}`]
            .filter(Boolean)
            .join(". ")}
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              rowSpan={headerRows}
              className={cn(headCell, "left-0 z-20 border-r text-left align-bottom")}
              aria-sort={pivot.rowDimensions[0] ? ariaSort(pivot.rowDimensions[0]) : undefined}
            >
              {pivot.rowDimensions[0] && pivot.rowDimensions.length === 1
                ? sortButton(pivot.rowDimensions[0], rowTitle, "left")
                : rowTitle || (singleMeasure ? reportMeasureInfo[pivot.measures[0]!].label : "")}
              {hasColumns && columnTitle ? (
                <span className="block font-normal text-foreground-subtle">{columnTitle} →</span>
              ) : null}
            </th>
            {hasColumns
              ? [...groups, { key: "__total", labels: ["Tổng"] }].map((group) => (
                  <th
                    key={group.key}
                    scope="colgroup"
                    colSpan={singleMeasure ? 1 : pivot.measures.length}
                    className={cn(
                      headCell,
                      singleMeasure ? "text-right" : "border-l text-center",
                      group.key === "__total" && "bg-muted text-foreground"
                    )}
                    title={group.labels.join(" · ")}
                  >
                    <span className="inline-block max-w-48 truncate align-bottom">
                      {group.labels.join(" · ")}
                    </span>
                  </th>
                ))
              : pivot.measures.map((measure) => (
                  <th
                    key={measure}
                    scope="col"
                    className={cn(headCell, "text-right")}
                    aria-sort={ariaSort(measure)}
                  >
                    {sortButton(measure, reportMeasureInfo[measure].label, "right")}
                  </th>
                ))}
          </tr>
          {headerRows === 2 ? (
            <tr>
              {[...groups, { key: "__total", labels: [] }].flatMap((group) =>
                pivot.measures.map((measure, index) => (
                  <th
                    key={`${group.key}-${measure}`}
                    scope="col"
                    className={cn(
                      headCell,
                      "top-[2.0625rem] text-right font-normal",
                      index === 0 && "border-l",
                      group.key === "__total" && "bg-muted"
                    )}
                  >
                    {reportMeasureInfo[measure].label}
                  </th>
                ))
              )}
            </tr>
          ) : null}
        </thead>
        <tbody>
          {paddingTop > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={columnCount} style={{ height: paddingTop }} />
            </tr>
          ) : null}
          {visibleRows.map(({ row, index }) => (
            <tr key={row.key || "__empty"} className="group/row" data-index={index}>
              <th
                scope="row"
                className={cn(
                  firstCell,
                  "font-normal group-hover/row:bg-surface-hover",
                  index > 0 && "border-t"
                )}
                title={row.labels.join(" · ")}
              >
                <span className="block truncate">
                  {row.labels.length === 0 ? (
                    <span className="text-foreground-muted">Tổng cộng</span>
                  ) : (
                    <>
                      <span className="font-medium">{row.labels[0]}</span>
                      {row.labels.length > 1 ? (
                        <span className="text-foreground-muted">
                          {" "}
                          · {row.labels.slice(1).join(" · ")}
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
              </th>
              {hasColumns
                ? [
                    ...groups.flatMap((group) =>
                      pivot.measures.map((measure, measureIndex) => {
                        const cell = row.cells.get(cellKey(group.key, measure));
                        return (
                          <td
                            key={`${group.key}-${measure}`}
                            className={cn(
                              numberCell,
                              "group-hover/row:bg-surface-hover",
                              index > 0 && "border-t",
                              measureIndex === 0 && !singleMeasure && "border-l",
                              cell === undefined && "text-foreground-subtle"
                            )}
                          >
                            {cell === undefined ? "·" : value(measure, cell)}
                          </td>
                        );
                      })
                    ),
                    ...pivot.measures.map((measure, measureIndex) => {
                      const cell = row.total.get(measure);
                      return (
                        <td
                          key={`total-${measure}`}
                          title={cellTitle(measure, cell, pivot.unsummed.rowTotals)}
                          className={cn(
                            numberCell,
                            "bg-muted/50 font-medium group-hover/row:bg-surface-hover",
                            index > 0 && "border-t",
                            measureIndex === 0 && "border-l"
                          )}
                        >
                          {value(measure, cell)}
                        </td>
                      );
                    })
                  ]
                : pivot.measures.map((measure) => (
                    <td
                      key={measure}
                      className={cn(
                        numberCell,
                        "group-hover/row:bg-surface-hover",
                        index > 0 && "border-t"
                      )}
                    >
                      {value(measure, row.cells.get(cellKey("", measure)))}
                    </td>
                  ))}
            </tr>
          ))}
          {paddingBottom > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={columnCount} style={{ height: paddingBottom }} />
            </tr>
          ) : null}
        </tbody>
        {pivot.rowDimensions.length > 0 ? (
          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky bottom-0 left-0 z-20 border-t border-r bg-surface-raised px-3 py-2 text-left text-xs font-semibold"
              >
                Tổng
              </th>
              {hasColumns
                ? [
                    ...groups.flatMap((group) =>
                      pivot.measures.map((measure, measureIndex) => {
                        const cell = pivot.groupTotals.get(cellKey(group.key, measure));
                        return (
                          <td
                            key={`${group.key}-${measure}`}
                            title={cellTitle(measure, cell, pivot.unsummed.groupTotals)}
                            className={cn(
                              numberCell,
                              "sticky bottom-0 z-10 border-t bg-surface-raised font-semibold",
                              measureIndex === 0 && !singleMeasure && "border-l"
                            )}
                          >
                            {value(measure, cell)}
                          </td>
                        );
                      })
                    ),
                    ...pivot.measures.map((measure, measureIndex) => (
                      <td
                        key={`grand-${measure}`}
                        className={cn(
                          numberCell,
                          "sticky bottom-0 z-10 border-t bg-muted font-semibold",
                          measureIndex === 0 && "border-l"
                        )}
                      >
                        {value(measure, pivot.grandTotals.get(measure))}
                      </td>
                    ))
                  ]
                : pivot.measures.map((measure) => (
                    <td
                      key={measure}
                      className={cn(
                        numberCell,
                        "sticky bottom-0 z-10 border-t bg-surface-raised font-semibold"
                      )}
                    >
                      {value(measure, pivot.grandTotals.get(measure))}
                    </td>
                  ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
};
