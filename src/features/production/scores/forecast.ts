import type { ForecastTone, ScoreForecast } from "@/contracts/production-scores";

import { formatCredit, formatPercent } from "../format";

/** API percents are already ×100 (94.65 → "94,7%"); one shared formatter (format.ts). */
export { formatPercent };

/**
 * KPI forecast presentation (SPEC Phase 3 §5, PLAN §10 "Dự báo KPI"): the API decides the tone;
 * the UI only maps it to a colour family and words. Pure, unit tested.
 */

export type ToneFamily = "success" | "warning" | "danger" | "muted";

export const forecastToneInfo: Record<ForecastTone, { family: ToneFamily; label: string }> = {
  MET: { family: "success", label: "Đã đạt KPI" },
  ON_TRACK: { family: "success", label: "Đúng tiến độ" },
  AT_RISK: { family: "warning", label: "Có nguy cơ thiếu" },
  BEHIND: { family: "danger", label: "Chậm tiến độ" },
  NO_TARGET: { family: "muted", label: "Chưa có KPI" }
};

export const toneFamily = (tone: ForecastTone): ToneFamily => forecastToneInfo[tone].family;

/** PD-066: KPI is mandatory — the warning shown to someone who must have a KPI for the period and has none. */
export const kpiMissingText = "Chưa có KPI kỳ này — liên hệ Quản trị.";

/** The person must have a KPI for the period (`kpiRequired`) and has none. */
export const kpiMissing = (forecast: Pick<ScoreForecast, "kpiRequired" | "targetBase">) =>
  forecast.kpiRequired && forecast.targetBase === null;

/** Headline label; once the period has closed a shortfall reads "Không đạt KPI", not a pace. */
export const forecastLabel = (forecast: Pick<ScoreForecast, "tone" | "daysLeft">) =>
  forecast.daysLeft <= 0 && (forecast.tone === "AT_RISK" || forecast.tone === "BEHIND")
    ? "Không đạt KPI"
    : forecastToneInfo[forecast.tone].label;

/** Signed points difference: +12,50 / −3,00. */
export const formatSignedCredit = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return formatCredit(0);
  return `${value > 0 ? "+" : "−"}${formatCredit(Math.abs(value))}`;
};

/** Width of a progress bar for a percent (0–100, never negative or overflowing). */
export const progressWidth = (percent: number | null | undefined) =>
  percent === null || percent === undefined || !Number.isFinite(percent)
    ? 0
    : Math.min(100, Math.max(0, percent));

type ForecastInput = Pick<
  ScoreForecast,
  "tone" | "remaining" | "daysLeft" | "avgPerDayNeeded" | "percent" | "target"
> & { kpiRequired?: boolean | undefined };

/**
 * The forecast line: "Còn thiếu {remaining} điểm, còn {daysLeft} ngày, cần {avgPerDayNeeded} điểm/ngày",
 * with the closed-period, met and no-target variants (PD-066: someone who must have a KPI and has none is told to
 * ask Quản trị).
 */
export const forecastSentence = (forecast: ForecastInput): string => {
  if (forecast.tone === "NO_TARGET" || forecast.target === null) {
    return forecast.kpiRequired
      ? kpiMissingText
      : "Kỳ này chưa có chỉ tiêu KPI. Điểm vẫn được ghi bình thường.";
  }
  if (forecast.tone === "MET" || (forecast.remaining !== null && forecast.remaining <= 0)) {
    return `Đã đạt KPI kỳ này (${formatPercent(forecast.percent)}).`;
  }
  const remaining = formatCredit(forecast.remaining);
  if (forecast.daysLeft <= 0) {
    return `Kỳ đã chốt, còn thiếu ${remaining} điểm (đạt ${formatPercent(forecast.percent)}).`;
  }
  const perDay =
    forecast.avgPerDayNeeded === null
      ? ""
      : `, cần ${formatCredit(forecast.avgPerDayNeeded)} điểm/ngày`;
  return `Còn thiếu ${remaining} điểm, còn ${forecast.daysLeft} ngày${perDay}.`;
};
