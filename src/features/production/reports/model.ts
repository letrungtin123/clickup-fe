import {
  ReportConfigSchema,
  reportDimensionInfo,
  reportMeasureInfo,
  type CustomFieldDimension,
  type ReportConfig,
  type ReportConfigInput,
  type ReportFilters,
  type ReportMeasure,
  type ReportRangePreset
} from "@/contracts/production-reports";

import { isUserFieldDimension, type DimensionKey } from "./dimensions";

/**
 * Report-builder model (SPEC Phase 5 §4): the builder edits a ReportConfig through three drop zones —
 * "Hàng" and "Cột" hold dimensions (config.dimensions = rows + columns, split kept in config.view),
 * "Giá trị" holds measures. Dimensions are fixed ones or custom fields (`cf_<entity>:<key>`, see
 * dimensions.ts). Pure functions — unit tested in model.test.ts.
 */

export type Zone = "rows" | "columns" | "values";
export type Zones = {
  rows: DimensionKey[];
  columns: DimensionKey[];
  values: ReportMeasure[];
};
export type Chip =
  { kind: "dimension"; name: DimensionKey } | { kind: "measure"; name: ReportMeasure };

/** Views offered by the builder. The contract's PIVOT is the table with "Cột" dimensions. */
export type ReportView = "TABLE" | "BAR" | "LINE" | "PIE";
export type TaskDate = ReportConfig["taskDate"];

/** Contract bound: at most 4 dimensions in Hàng + Cột together. */
export const maxDimensions = 4;

export const zoneLabels: Record<Zone, string> = { rows: "Hàng", columns: "Cột", values: "Giá trị" };

// Zones ⇄ config ------------------------------------------------------------------------------------

/** Splits a config into the three zones; dimensions missing from view.rows/columns become rows. */
export const zonesFromConfig = (
  config: Pick<ReportConfig, "dimensions" | "measures" | "view">
): Zones => {
  const dimensions = config.dimensions;
  const columns = (config.view?.columns ?? []).filter((dimension) =>
    dimensions.includes(dimension)
  );
  const viewRows = (config.view?.rows ?? []).filter(
    (dimension) => dimensions.includes(dimension) && !columns.includes(dimension)
  );
  const rest = dimensions.filter(
    (dimension) => !viewRows.includes(dimension) && !columns.includes(dimension)
  );
  return { rows: [...viewRows, ...rest], columns, values: [...config.measures] };
};

export const viewOfConfig = (config: Pick<ReportConfig, "view">): ReportView => {
  const type = config.view?.type ?? "TABLE";
  return type === "PIVOT" ? "TABLE" : type;
};

const contractView = (view: ReportView, columns: readonly DimensionKey[]) =>
  view === "TABLE" && columns.length > 0 ? "PIVOT" : view;

/** Writes the zones back: dimensions = rows + columns; a sort on a removed key is dropped. */
export const withZones = (config: ReportConfig, zones: Zones): ReportConfig => {
  const dimensions = [...zones.rows, ...zones.columns];
  const keys: string[] = [...dimensions, ...zones.values];
  const view = viewOfConfig(config);
  const next: ReportConfig = {
    ...config,
    dimensions,
    measures: [...zones.values],
    view: {
      type: contractView(view, zones.columns),
      rows: [...zones.rows],
      columns: [...zones.columns]
    }
  };
  if (next.sort && !keys.includes(next.sort.key)) delete next.sort;
  return next;
};

export const withView = (config: ReportConfig, view: ReportView): ReportConfig => {
  const zones = zonesFromConfig(config);
  return {
    ...config,
    view: { type: contractView(view, zones.columns), rows: zones.rows, columns: zones.columns }
  };
};

export const chipKey = (chip: Chip) => `${chip.kind}:${chip.name}`;

export const zoneOfChip = (zones: Zones, chip: Chip): Zone | null => {
  if (chip.kind === "measure") return zones.values.includes(chip.name) ? "values" : null;
  if (zones.rows.includes(chip.name)) return "rows";
  if (zones.columns.includes(chip.name)) return "columns";
  return null;
};

const insertAt = <T>(list: readonly T[], item: T, index: number | undefined) => {
  const next = [...list];
  const at = index === undefined ? next.length : Math.max(0, Math.min(index, next.length));
  next.splice(at, 0, item);
  return next;
};

/**
 * Drops a chip into a zone at `index` (end when omitted). Measures always land in "Giá trị";
 * dimensions dropped on "Giá trị" land in "Hàng". A chip already placed is moved. Adding a fifth
 * dimension is refused with a message.
 */
export const placeChip = (
  zones: Zones,
  chip: Chip,
  target: Zone,
  index?: number
): { zones: Zones; error: string | null } => {
  if (chip.kind === "measure") {
    const from = zones.values.indexOf(chip.name);
    let values = zones.values.filter((name) => name !== chip.name);
    const at = index !== undefined && from >= 0 && from < index ? index - 1 : index;
    values = insertAt(values, chip.name, target === "values" ? at : undefined);
    return { zones: { ...zones, values }, error: null };
  }
  const zone: "rows" | "columns" = target === "columns" ? "columns" : "rows";
  const current = zoneOfChip(zones, chip);
  if (current === null && zones.rows.length + zones.columns.length >= maxDimensions) {
    return {
      zones,
      error: `Tối đa ${maxDimensions} chiều trong Hàng và Cột. Bỏ bớt một chiều trước khi thêm.`
    };
  }
  const fromIndex = current === zone ? zones[zone].indexOf(chip.name) : -1;
  const rows = zones.rows.filter((name) => name !== chip.name);
  const columns = zones.columns.filter((name) => name !== chip.name);
  const at =
    index !== undefined && target !== "values" && fromIndex >= 0 && fromIndex < index
      ? index - 1
      : index;
  const effective = target === "values" ? undefined : at;
  return {
    zones: {
      ...zones,
      rows: zone === "rows" ? insertAt(rows, chip.name, effective) : rows,
      columns: zone === "columns" ? insertAt(columns, chip.name, effective) : columns
    },
    error: null
  };
};

export const removeChip = (zones: Zones, chip: Chip): Zones =>
  chip.kind === "measure"
    ? { ...zones, values: zones.values.filter((name) => name !== chip.name) }
    : {
        ...zones,
        rows: zones.rows.filter((name) => name !== chip.name),
        columns: zones.columns.filter((name) => name !== chip.name)
      };

/** Swaps Hàng and Cột (pivot transpose). */
export const swapRowsAndColumns = (zones: Zones): Zones => ({
  ...zones,
  rows: [...zones.columns],
  columns: [...zones.rows]
});

// Roles -------------------------------------------------------------------------------------------

/**
 * Measures offered in the builder. PD-066: Khoán is money only — the points equivalent of Khoán work ("points_khoan")
 * is no longer offered (a saved report that already uses it still runs).
 */
export const measuresForRole = (isAdmin: boolean) =>
  (Object.keys(reportMeasureInfo) as ReportMeasure[]).filter(
    (measure) => measure !== "points_khoan" && (isAdmin || !reportMeasureInfo[measure].adminOnly)
  );

/**
 * Removes what the role may not run — the API answers 403 otherwise: money measures (MONEY_FORBIDDEN)
 * and members' custom fields, e.g. "Năng lực" (CUSTOM_FIELDS_FORBIDDEN), for non-admins. A config left
 * without measures gets "Điểm". `removed` / `removedFields` list what was dropped, for a notice.
 */
export const sanitizeForRole = (
  config: ReportConfig,
  isAdmin: boolean
): { config: ReportConfig; removed: ReportMeasure[]; removedFields: string[] } => {
  if (isAdmin) return { config, removed: [], removedFields: [] };
  const removed = config.measures.filter((measure) => reportMeasureInfo[measure].adminOnly);
  const removedFields = [
    ...new Set([
      ...config.dimensions.filter(isUserFieldDimension),
      ...(config.filters.customFields ?? [])
        .map((filter) => filter.field)
        .filter(isUserFieldDimension)
    ])
  ];
  if (removed.length === 0 && removedFields.length === 0) {
    return { config, removed, removedFields };
  }
  const zones = zonesFromConfig(config);
  const values = zones.values.filter((measure) => !removed.includes(measure));
  const keep = (dimension: DimensionKey) => !removedFields.includes(dimension);
  const next = withZones(config, {
    rows: zones.rows.filter(keep),
    columns: zones.columns.filter(keep),
    values: values.length > 0 ? values : ["points"]
  });
  const customFields = (config.filters.customFields ?? []).filter((filter) => keep(filter.field));
  return {
    config: withFilter(next, "customFields", customFields.length > 0 ? customFields : undefined),
    removed,
    removedFields
  };
};

// Sources -------------------------------------------------------------------------------------------

export const usesSource = (measures: readonly ReportMeasure[], source: "SCORES" | "TASKS") =>
  measures.some((measure) => reportMeasureInfo[measure].source === source);

export const taskDateInfo: Record<TaskDate, { label: string; description: string }> = {
  DONE: {
    label: "Ngày xong",
    description: "Task được tính vào ngày hoàn thành lần đầu. Task chưa xong không được tính."
  },
  ASSIGNED: {
    label: "Ngày giao",
    description: "Task được tính vào ngày được giao, kể cả task chưa xong."
  },
  DEADLINE: {
    label: "Hạn chót",
    description: "Task được tính vào ngày hạn chót. Hợp để xem task trễ và task sắp đến hạn."
  }
};

// Range -----------------------------------------------------------------------------------------------

export const rangePresetLabels: Record<ReportRangePreset, string> = {
  TODAY: "Hôm nay",
  YESTERDAY: "Hôm qua",
  THIS_WEEK: "Tuần này",
  LAST_WEEK: "Tuần trước",
  LAST_7_DAYS: "7 ngày qua",
  LAST_30_DAYS: "30 ngày qua",
  THIS_MONTH: "Tháng này",
  LAST_MONTH: "Tháng trước",
  THIS_PERIOD: "Kỳ KPI này",
  LAST_PERIOD: "Kỳ KPI trước"
};

export type ReportRange =
  { kind: "preset"; preset: ReportRangePreset } | { kind: "fixed"; from: string; to: string };

export const rangeOfConfig = (config: Pick<ReportConfig, "preset" | "from" | "to">): ReportRange =>
  config.from !== undefined && config.to !== undefined
    ? { kind: "fixed", from: config.from, to: config.to }
    : { kind: "preset", preset: config.preset ?? "THIS_PERIOD" };

export const withRange = (config: ReportConfig, range: ReportRange): ReportConfig => {
  const next: ReportConfig = { ...config };
  delete next.preset;
  delete next.from;
  delete next.to;
  if (range.kind === "preset") return { ...next, preset: range.preset };
  return range.from <= range.to
    ? { ...next, from: range.from, to: range.to }
    : { ...next, from: range.to, to: range.from };
};

/** Inclusive calendar month as a fixed range ("2026-05" → 01/05 – 31/05). */
export const monthRange = (month: string): { from: string; to: string } => {
  const [year, monthIndex] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

/** The last `count` months up to the one containing `today`, newest first ("2026-10", …). */
export const recentMonths = (today: string, count = 12) => {
  const [year, month] = today.split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
};

// Filters ---------------------------------------------------------------------------------------------

export type IdFilterKey =
  "user" | "team" | "project" | "client" | "process" | "shift" | "status" | "job" | "tag";

export const filterLabels: Record<
  IdFilterKey | "taskKind" | "scoreRole" | "taskState" | "jobState",
  string
> = {
  user: reportDimensionInfo.user.label,
  team: reportDimensionInfo.team.label,
  project: reportDimensionInfo.project.label,
  client: reportDimensionInfo.client.label,
  process: reportDimensionInfo.process.label,
  shift: reportDimensionInfo.shift.label,
  status: reportDimensionInfo.status.label,
  job: reportDimensionInfo.job.label,
  tag: "Tag",
  taskKind: reportDimensionInfo.task_kind.label,
  scoreRole: "Điểm của",
  taskState: "Tình trạng task",
  jobState: "Lưu trữ job"
};

/** Sets one filter; an empty list / undefined removes it (the contract refuses empty lists). */
export const withFilter = <K extends keyof ReportFilters>(
  config: ReportConfig,
  key: K,
  value: ReportFilters[K] | undefined
): ReportConfig => {
  const filters: ReportFilters = { ...config.filters };
  if (value === undefined || (Array.isArray(value) && value.length === 0)) delete filters[key];
  else filters[key] = value;
  return { ...config, filters };
};

/** Every set filter; each custom-field filter counts as one. */
export const activeFilterCount = (filters: ReportFilters) =>
  Object.entries(filters).reduce((count, [key, value]) => {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) return count;
    return count + (key === "customFields" && Array.isArray(value) ? value.length : 1);
  }, 0);

/** Values of one custom-field filter ("__empty__" = no value). */
export const customFieldFilterValues = (filters: ReportFilters, field: string): string[] => [
  ...(filters.customFields?.find((filter) => filter.field === field)?.values ?? [])
];

/**
 * Sets the values of one custom-field filter (kept in the order fields were added); an empty list
 * removes it. The contract allows 10 custom-field filters and 100 values each.
 */
export const withCustomFieldFilter = (
  config: ReportConfig,
  field: CustomFieldDimension,
  values: readonly string[]
): ReportConfig => {
  const current = config.filters.customFields ?? [];
  const unique = [...new Set(values)].slice(0, 100);
  const exists = current.some((filter) => filter.field === field);
  const next =
    unique.length === 0
      ? current.filter((filter) => filter.field !== field)
      : exists
        ? current.map((filter) => (filter.field === field ? { field, values: unique } : filter))
        : [...current, { field, values: unique }].slice(0, 10);
  return withFilter(config, "customFields", next.length > 0 ? next : undefined);
};

// Sort & limit ----------------------------------------------------------------------------------------

export const withSort = (
  config: ReportConfig,
  sort: { key: DimensionKey | ReportMeasure; direction: "asc" | "desc" } | null
): ReportConfig => {
  const next: ReportConfig = { ...config };
  if (sort === null) delete next.sort;
  else next.sort = sort;
  return next;
};

export const withLimit = (config: ReportConfig, limit: number | null): ReportConfig => {
  const next: ReportConfig = { ...config };
  if (limit === null) delete next.limit;
  else next.limit = limit;
  return next;
};

// Defaults, validity, URL -------------------------------------------------------------------------

export const parseConfig = (input: unknown): ReportConfig | null => {
  const parsed = ReportConfigSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};

const defaultInput: ReportConfigInput = {
  dimensions: ["user"],
  measures: ["points", "qty_done"],
  preset: "THIS_MONTH",
  view: { type: "BAR", rows: ["user"], columns: [] }
};

export const defaultReportConfig = (): ReportConfig => ReportConfigSchema.parse(defaultInput);

/** Why the config cannot run yet (shown instead of a result), or null. */
export const configProblem = (config: ReportConfig): string | null => {
  if (config.measures.length === 0) return "Kéo ít nhất một chỉ số vào ô Giá trị.";
  const parsed = ReportConfigSchema.safeParse(config);
  return parsed.success
    ? null
    : (parsed.error.issues[0]?.message ?? "Cấu hình báo cáo chưa hợp lệ.");
};

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
};

/** Compact URL form of a config (`?config=`), for links from dashboard cards and sharing. */
export const encodeConfig = (config: ReportConfigInput) => toBase64Url(JSON.stringify(config));

export const decodeConfig = (value: string | null | undefined): ReportConfig | null => {
  if (!value) return null;
  try {
    return parseConfig(JSON.parse(fromBase64Url(value)));
  } catch {
    return null;
  }
};

/** Link that opens the builder preloaded with `config` (and an optional title). */
export const reportBuilderHref = (config: ReportConfigInput, title?: string) => {
  const params = new URLSearchParams({ config: encodeConfig(config) });
  if (title) params.set("title", title);
  return `/production/reports?${params.toString()}`;
};

/** Stable JSON (sorted keys) for comparing two configs (dirty state of a saved report). */
export const configSignature = (config: ReportConfig): string => {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)])
      );
    }
    return value;
  };
  return JSON.stringify(normalize(config));
};
