import type { ReportMeasure, ReportResult, ReportRow } from "@/contracts/production-reports";

import { dimensionMeta, type DimensionKey } from "./dimensions";
import { derivedRates, dimensionKeyLabel, isAdditive } from "./format";

/**
 * Pivot and chart transforms of a flat report result (rows = one group per combination of the chosen
 * dimensions). "Hàng" dimensions become table rows / chart categories, "Cột" dimensions become column
 * groups / chart series. Pure — unit tested in pivot.test.ts.
 */

type Cell = number | null;

export type PivotHeader = { key: string; labels: string[] };
export type PivotRow = PivotHeader & {
  /** `${groupKey}\u0000${measure}` → value. */
  cells: Map<string, Cell>;
  /** Per measure across all column groups (only with "Cột" dimensions). */
  total: Map<ReportMeasure, Cell>;
};
export type Pivot = {
  rowDimensions: DimensionKey[];
  columnDimensions: DimensionKey[];
  measures: ReportMeasure[];
  /** Column groups (one per combination of "Cột" values); a single empty group without them. */
  groups: PivotHeader[];
  rows: PivotRow[];
  /** Totals row: per group and measure (cellKey), plus the server totals per measure. */
  groupTotals: Map<string, Cell>;
  grandTotals: Map<ReportMeasure, Cell>;
  /**
   * Sub-totals left empty because they would add up a multi-value (MULTISELECT) dimension, where one
   * record is counted once per option: row totals across "Cột", group totals down "Hàng".
   */
  unsummed: { rowTotals: boolean; groupTotals: boolean };
};

const SEPARATOR = "\u0000";
export const cellKey = (groupKey: string, measure: ReportMeasure) =>
  `${groupKey}${SEPARATOR}${measure}`;

const asNumber = (value: unknown): Cell =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const keyOf = (row: ReportRow, dimension: DimensionKey) => {
  const value = row[dimension];
  return value === null || value === undefined ? "" : String(value);
};

export const labelOf = (row: ReportRow, dimension: DimensionKey) => {
  const label = row[`${dimension}_label`];
  return typeof label === "string" && label !== ""
    ? label
    : dimensionKeyLabel(dimension, keyOf(row, dimension) || null);
};

const headerOf = (row: ReportRow, dimensions: readonly DimensionKey[]): PivotHeader => ({
  key: dimensions.map((dimension) => keyOf(row, dimension)).join(SEPARATOR),
  labels: dimensions.map((dimension) => labelOf(row, dimension))
});

/** Column order: time dimensions chronologically, others by label; "Không rõ" (empty key) last. */
const compareHeaders = (dimensions: readonly DimensionKey[]) => {
  const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });
  return (a: PivotHeader, b: PivotHeader) => {
    const aKeys = a.key.split(SEPARATOR);
    const bKeys = b.key.split(SEPARATOR);
    for (let index = 0; index < dimensions.length; index += 1) {
      const dimension = dimensions[index]!;
      const aKey = aKeys[index] ?? "";
      const bKey = bKeys[index] ?? "";
      if (aKey === bKey) continue;
      if (aKey === "") return 1;
      if (bKey === "") return -1;
      const order =
        dimensionMeta(dimension).kind === "time"
          ? aKey.localeCompare(bKey)
          : collator.compare(a.labels[index] ?? "", b.labels[index] ?? "");
      if (order !== 0) return order;
    }
    return 0;
  };
};

/** Sum of additive values (null when every value is null); rates from their parts when possible. */
const aggregate = (measure: ReportMeasure, values: Map<ReportMeasure, Cell[]>): Cell => {
  if (isAdditive(measure)) {
    const list = (values.get(measure) ?? []).filter((value): value is number => value !== null);
    return list.length === 0 ? null : list.reduce((sum, value) => sum + value, 0);
  }
  const parts = derivedRates[measure];
  if (parts && values.has(parts[0]) && values.has(parts[1])) {
    const numerator = aggregate(parts[0], values);
    const denominator = aggregate(parts[1], values);
    return numerator === null || !denominator ? null : numerator / denominator;
  }
  return null;
};

export const buildPivot = (
  result: Pick<ReportResult, "rows" | "totals">,
  rowDimensions: readonly DimensionKey[],
  columnDimensions: readonly DimensionKey[],
  measures: readonly ReportMeasure[],
  /** MULTISELECT custom-field dimensions (a record appears under each of its options). */
  multiValue: ReadonlySet<string> = new Set()
): Pivot => {
  const groupsByKey = new Map<string, PivotHeader>();
  const rowsByKey = new Map<string, PivotRow>();
  const rowParts = new Map<string, Map<ReportMeasure, Cell[]>>();
  const groupParts = new Map<string, Map<ReportMeasure, Cell[]>>();

  const push = (
    store: Map<string, Map<ReportMeasure, Cell[]>>,
    key: string,
    measure: ReportMeasure,
    value: Cell
  ) => {
    const byMeasure = store.get(key) ?? new Map<ReportMeasure, Cell[]>();
    byMeasure.set(measure, [...(byMeasure.get(measure) ?? []), value]);
    store.set(key, byMeasure);
  };

  for (const source of result.rows) {
    const group = headerOf(source, columnDimensions);
    if (!groupsByKey.has(group.key)) groupsByKey.set(group.key, group);
    const header = headerOf(source, rowDimensions);
    let row = rowsByKey.get(header.key);
    if (!row) {
      row = { ...header, cells: new Map(), total: new Map() };
      rowsByKey.set(header.key, row);
    }
    for (const measure of measures) {
      const value = asNumber(source[measure]);
      row.cells.set(cellKey(group.key, measure), value);
      push(rowParts, header.key, measure, value);
      push(groupParts, group.key, measure, value);
    }
  }

  const groups =
    columnDimensions.length === 0
      ? [{ key: "", labels: [] }]
      : [...groupsByKey.values()].sort(compareHeaders(columnDimensions));
  const rows = [...rowsByKey.values()];
  const grandTotals = new Map<ReportMeasure, Cell>(
    measures.map((measure) => [measure, asNumber(result.totals[measure])])
  );
  const groupTotals = new Map<string, Cell>();
  // Adding up the options of a multi-value dimension would count a record several times: leave
  // those sub-totals empty (the server's grand totals count each record once).
  const unsummed = {
    rowTotals: columnDimensions.some((dimension) => multiValue.has(dimension)),
    groupTotals:
      columnDimensions.length > 0 && rowDimensions.some((dimension) => multiValue.has(dimension))
  };

  if (columnDimensions.length === 0) {
    for (const measure of measures)
      groupTotals.set(cellKey("", measure), grandTotals.get(measure) ?? null);
  } else {
    for (const group of groups) {
      const parts = groupParts.get(group.key) ?? new Map<ReportMeasure, Cell[]>();
      for (const measure of measures)
        groupTotals.set(
          cellKey(group.key, measure),
          unsummed.groupTotals ? null : aggregate(measure, parts)
        );
    }
    for (const row of rows) {
      const parts = rowParts.get(row.key) ?? new Map<ReportMeasure, Cell[]>();
      for (const measure of measures)
        row.total.set(measure, unsummed.rowTotals ? null : aggregate(measure, parts));
    }
  }

  return {
    rowDimensions: [...rowDimensions],
    columnDimensions: [...columnDimensions],
    measures: [...measures],
    groups,
    rows,
    groupTotals,
    grandTotals,
    unsummed
  };
};

// Charts ------------------------------------------------------------------------------------------

export type ChartKind = "BAR" | "LINE" | "PIE";
export type ChartSeries = { key: string; label: string; other?: boolean };
export type ChartModel = {
  /** One record per category: `category` (key), `label`, and one numeric field per series key. */
  data: Record<string, string | number | null>[];
  series: ChartSeries[];
  measure: ReportMeasure;
  /** Categories left out by the category cap. */
  hiddenCategories: number;
  /** Series groups folded into "Khác" (additive) or left out (rates). */
  hiddenSeries: number;
  /** The x axis is time (keep chronological order, line-friendly). */
  timeAxis: boolean;
};

export const maxSeries = 8;
export const maxCategories = { BAR: 40, LINE: 400, PIE: 8 } as const;

const joinLabels = (labels: readonly string[]) => labels.join(" · ") || "Tổng";

/**
 * Chart-ready data for one measure. Categories = combinations of the "Hàng" dimensions (or of the
 * "Cột" ones when Hàng is empty); series = combinations of the "Cột" dimensions, else the measure
 * itself. At most 8 series (fixed categorical slots): bars of additive measures fold the rest into
 * "Khác"; lines and rates keep the 8 largest. Pie charts take additive measures only, summed across columns, ≤ 8 slices.
 */
export const buildChartModel = (
  result: Pick<ReportResult, "rows">,
  rowDimensions: readonly DimensionKey[],
  columnDimensions: readonly DimensionKey[],
  measure: ReportMeasure,
  kind: ChartKind
): ChartModel => {
  const isTime = (dimensions: readonly DimensionKey[]) =>
    dimensions.length > 0 &&
    dimensions.every((dimension) => dimensionMeta(dimension).kind === "time");
  // Lines follow time: with time only in "Cột", the time dimension becomes the x axis.
  const swap = kind === "LINE" && !isTime(rowDimensions) && isTime(columnDimensions);
  const rows = swap ? columnDimensions : rowDimensions;
  const columns = swap ? rowDimensions : columnDimensions;
  const categoryDimensions = rows.length > 0 ? rows : columns;
  const seriesDimensions = rows.length > 0 && kind !== "PIE" ? columns : [];
  const additive = isAdditive(measure);
  // Bars fold the smallest groups into "Khác"; a summed line would dwarf the others, so lines drop them.
  const fold = additive && kind === "BAR";
  const timeAxis = isTime(categoryDimensions);

  // Categories (first appearance = server order, chronological for time axes).
  const categories = new Map<
    string,
    { key: string; label: string; values: Map<string, number | null> }
  >();
  const seriesHeaders = new Map<string, PivotHeader>();
  const seriesSize = new Map<string, number>();
  for (const row of result.rows) {
    const category = headerOf(row, categoryDimensions);
    const series =
      seriesDimensions.length > 0 ? headerOf(row, seriesDimensions) : { key: measure, labels: [] };
    if (!seriesHeaders.has(series.key)) seriesHeaders.set(series.key, series);
    const value = asNumber(row[measure]);
    seriesSize.set(series.key, (seriesSize.get(series.key) ?? 0) + Math.abs(value ?? 0));
    let entry = categories.get(category.key);
    if (!entry) {
      entry = { key: category.key, label: joinLabels(category.labels), values: new Map() };
      categories.set(category.key, entry);
    }
    const previous = entry.values.get(series.key);
    // Pie: several rows per category (columns ignored) are summed for additive measures.
    entry.values.set(
      series.key,
      previous === undefined || previous === null
        ? value
        : value === null
          ? previous
          : previous + value
    );
  }

  let ordered = [...categories.values()];
  if (timeAxis) ordered.sort((a, b) => a.key.localeCompare(b.key));

  // Series: stable order (time / label), capped at 8 slots. Keys are positional ("s0", "s1", …) so
  // Recharts never reads ids or dates as property paths.
  type Slot = ChartSeries & { source: string };
  let slots: Slot[] =
    seriesDimensions.length > 0
      ? [...seriesHeaders.values()].sort(compareHeaders(seriesDimensions)).map((header, index) => ({
          key: `s${index}`,
          label: joinLabels(header.labels),
          source: header.key
        }))
      : [{ key: "s0", label: "", source: measure }];
  let hiddenSeries = 0;
  let folded: string[] = [];
  if (slots.length > maxSeries) {
    const keep = new Set(
      [...slots]
        .sort((a, b) => (seriesSize.get(b.source) ?? 0) - (seriesSize.get(a.source) ?? 0))
        .slice(0, fold ? maxSeries - 1 : maxSeries)
        .map((item) => item.source)
    );
    folded = slots.filter((item) => !keep.has(item.source)).map((item) => item.source);
    hiddenSeries = folded.length;
    slots = slots
      .filter((item) => keep.has(item.source))
      .map((item, index) => ({ ...item, key: `s${index}` }));
    if (fold) slots.push({ key: "other", label: "Khác", other: true, source: "" });
  }

  // Pie: positive slices only, largest first, 7 + "Khác".
  let hiddenCategories = 0;
  if (kind === "PIE") {
    const total = (entry: (typeof ordered)[number]) => entry.values.get(measure) ?? 0;
    ordered = ordered.filter((entry) => total(entry) > 0).sort((a, b) => total(b) - total(a));
    if (ordered.length > maxCategories.PIE) {
      const rest = ordered.slice(maxCategories.PIE - 1);
      hiddenCategories = rest.length;
      const otherValue = rest.reduce((sum, entry) => sum + total(entry), 0);
      ordered = [
        ...ordered.slice(0, maxCategories.PIE - 1),
        { key: "__other", label: "Khác", values: new Map([[measure, otherValue]]) }
      ];
    }
  } else if (ordered.length > maxCategories[kind]) {
    hiddenCategories = ordered.length - maxCategories[kind];
    ordered = ordered.slice(0, maxCategories[kind]);
  }

  const data = ordered.map((entry) => {
    const record: Record<string, string | number | null> = {
      category: entry.key,
      label: entry.label
    };
    for (const item of slots) {
      if (item.other) {
        const values = folded.map((key) => entry.values.get(key) ?? null);
        const present = values.filter((value): value is number => value !== null);
        record[item.key] =
          present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
      } else {
        record[item.key] = entry.values.get(item.source) ?? null;
      }
    }
    return record;
  });

  const series: ChartSeries[] = slots.map(({ key, label, other }) =>
    other ? { key, label, other } : { key, label }
  );
  return { data, series, measure, hiddenCategories, hiddenSeries, timeAxis };
};

/** Pie charts only make sense for additive, non-negative measures. */
export const canPie = (measure: ReportMeasure) => isAdditive(measure);
