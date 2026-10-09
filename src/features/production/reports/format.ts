import {
  reportDimensionInfo,
  reportMeasureInfo,
  type ReportDimension,
  type ReportMeasure,
  type ReportValueFormat
} from "@/contracts/production-reports";

import { EMPTY_VALUE, formatCredit, formatDay, formatInteger, formatMoney } from "../format";

/**
 * Value formatting for report results (production-reports contract). Rates arrive as fractions
 * (0.125 = 12,5 %), money as integer VND, points with two decimals. Pure — unit tested.
 */

const percentFormatter = new Intl.NumberFormat("vi-VN", {
  style: "percent",
  maximumFractionDigits: 1
});
const decimalFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const hoursFormatter = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});
const compactFormatter = new Intl.NumberFormat("vi-VN", {
  notation: "compact",
  maximumFractionDigits: 1
});

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** A measure value as shown in tables, tooltips and cards. null / NaN → "—". */
export const formatReportValue = (value: unknown, format: ReportValueFormat): string => {
  if (!isNumber(value)) return EMPTY_VALUE;
  switch (format) {
    case "points":
      return formatCredit(value);
    case "money":
      return formatMoney(value);
    case "count":
    case "images":
      return formatInteger(value);
    case "percent":
      return percentFormatter.format(value);
    case "hours":
      return `${hoursFormatter.format(value)} giờ`;
    case "decimal":
      return decimalFormatter.format(value);
    default:
      return decimalFormatter.format(value);
  }
};

export const formatMeasure = (measure: ReportMeasure, value: unknown) =>
  formatReportValue(value, reportMeasureInfo[measure].format);

/** Short tick text for chart axes ("12,3 N", "45%", "1,5"). */
export const formatAxisValue = (value: number, format: ReportValueFormat): string => {
  if (!Number.isFinite(value)) return "";
  if (format === "percent") return percentFormatter.format(value);
  if (Math.abs(value) >= 10_000) return compactFormatter.format(value);
  return decimalFormatter.format(value);
};

/** Unit word after a headline figure. */
export const measureUnit = (measure: ReportMeasure): string => {
  switch (reportMeasureInfo[measure].format) {
    case "points":
      return "điểm";
    case "images":
      return "tấm";
    case "count":
      return measure === "qc_fail_count" ? "lần" : "task";
    case "hours":
    case "money":
    case "percent":
      return "";
    default:
      return "";
  }
};

/**
 * Measures that can be summed across groups (pivot sub-totals, "Khác" slices). Rates and averages
 * cannot: their totals come from the server (or from their parts, see `derivedRates`).
 */
export const additiveMeasures: ReadonlySet<ReportMeasure> = new Set<ReportMeasure>([
  "points",
  "points_khoan",
  "money_khoan",
  "qty_done",
  "qty_assigned",
  "task_count",
  "late_count",
  "fb_wrong_count",
  "qc_fail_count",
  "ot_hours"
]);

export const isAdditive = (measure: ReportMeasure) => additiveMeasures.has(measure);

/** Rates recomputable from other measures of the same report (numerator / denominator). */
export const derivedRates: Partial<Record<ReportMeasure, readonly [ReportMeasure, ReportMeasure]>> =
  {
    fb_rate: ["fb_wrong_count", "task_count"],
    late_rate: ["late_count", "task_count"]
  };

/** Label of a dimension value key when the server label is missing (time keys, empty keys). */
export const dimensionKeyLabel = (dimension: ReportDimension, key: string | null): string => {
  if (key === null || key === "") return "Không rõ";
  switch (reportDimensionInfo[dimension].format) {
    case "day":
      return formatDay(key);
    case "week":
      return `Tuần ${formatDay(key)}`;
    case "month":
      return dimension === "period"
        ? `Kỳ ${key.slice(5, 7)}/${key.slice(0, 4)}`
        : `${key.slice(5, 7)}/${key.slice(0, 4)}`;
    default:
      return key;
  }
};

/** "12/05" for a YYYY-MM-DD key (chart ticks of day / week dimensions). */
export const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Minutes as "2 giờ 05 phút" / "45 phút" / "3 ngày 4 giờ". */
export const formatMinutes = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} phút`;
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const rest = total % 60;
  if (days > 0) return hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`;
  return rest > 0 ? `${hours} giờ ${String(rest).padStart(2, "0")} phút` : `${hours} giờ`;
};

/** "Tuần 04/05/2026" → "04/05", "05/2026" → "T5/26", long names truncated. */
export const tickLabel = (label: string) => {
  const day = /^(?:Tuần |Kỳ )?(\d{2})\/(\d{2})\/\d{4}$/.exec(label);
  if (day) return `${day[1]}/${day[2]}`;
  const month = /^(Kỳ )?(\d{2})\/\d{2}(\d{2})$/.exec(label);
  if (month) return `${month[1] ? "Kỳ " : "T"}${Number(month[2])}/${month[3]}`;
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
};

/** "01/05/2026 – 31/05/2026" for a resolved range. */
export const formatRange = (from: string, to: string) =>
  from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
