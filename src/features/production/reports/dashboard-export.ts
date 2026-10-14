import {
  reportMeasureInfo,
  type AdminDashboard,
  type ReportMeasure,
  type ReportResult
} from "@/contracts/production-reports";

import { formatDay } from "../format";
import { formatDateTime } from "../jobs-model";
import { formatRange } from "./format";

/** "17:30, 09/10/2026" in the organization timezone. */
const formatDeadline = (iso: string, timeZone: string) => formatDateTime(iso, timeZone, true);

/**
 * "Xuất CSV" of the Admin dashboard (PLAN §7 "Dashboard Admin … xuất CSV"): the six cards' figures in one
 * UTF-8 CSV (with BOM, so Excel shows Vietnamese), one block per card — title line, header, rows, total —
 * separated by an empty line. Numbers are plain ("1234.5"; rates in %), names are escaped against CSV
 * formula injection. Built from the dashboard already on screen: no extra request. Pure — unit tested.
 */

type Cell = string | number | null | undefined;

/** A text cell that would start a spreadsheet formula gets a leading apostrophe. */
const safeText = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

export const csvCell = (value: Cell): string => {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "number"
      ? Number.isFinite(value)
        ? String(Math.round(value * 100) / 100)
        : ""
      : safeText(value);
  return /[",\n\r]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const csvLine = (cells: readonly Cell[]) => cells.map(csvCell).join(",");

const measureHeader = (measure: ReportMeasure) => {
  const info = reportMeasureInfo[measure];
  return info.format === "percent" ? `${info.label} (%)` : info.label;
};

const measureValue = (measure: ReportMeasure, value: unknown): Cell => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return reportMeasureInfo[measure].format === "percent" ? value * 100 : value;
};

/** Header, rows and the "Tổng" line of a report result (dimension labels, then measures). */
export const resultLines = (result: Pick<ReportResult, "columns" | "rows" | "totals">) => {
  const dimensions = result.columns.filter((column) => column.kind === "dimension");
  const measures = result.columns
    .filter((column) => column.kind === "measure")
    .map((column) => column.key as ReportMeasure)
    .filter((key) => key in reportMeasureInfo);
  if (dimensions.length + measures.length === 0) return [];
  const lines = [
    csvLine([...dimensions.map((column) => column.label), ...measures.map(measureHeader)])
  ];
  for (const row of result.rows) {
    lines.push(
      csvLine([
        ...dimensions.map((column) => {
          const label = row[`${column.key}_label`];
          const key = row[column.key];
          return typeof label === "string" && label !== ""
            ? label
            : key === null || key === undefined
              ? "Không rõ"
              : String(key);
        }),
        ...measures.map((measure) => measureValue(measure, row[measure]))
      ])
    );
  }
  lines.push(
    csvLine([
      ...dimensions.map((_, index) => (index === 0 ? "Tổng" : "")),
      ...measures.map((measure) => measureValue(measure, result.totals[measure]))
    ])
  );
  return lines;
};

/** The whole CSV (without BOM) of the Admin dashboard. */
export const adminDashboardCsv = (data: AdminDashboard, timeZone: string) => {
  const { cards } = data;
  const blocks: string[][] = [];
  const block = (title: string, scope: string, lines: string[]) =>
    blocks.push([csvLine([`${title} · ${scope}`]), ...lines]);

  blocks.push([
    csvLine(["Quản trị số liệu Photo Retouch"]),
    csvLine([
      `Ngày ${formatDay(data.today)} · Kỳ KPI ${data.period.key.slice(5, 7)}/${data.period.key.slice(0, 4)} (${formatRange(data.period.from, data.period.to)})`
    ]),
    csvLine([`Số liệu lúc ${formatDeadline(data.generatedAt, timeZone)}`])
  ]);
  block(
    cards.pointsToday.title,
    formatRange(cards.pointsToday.result.from, cards.pointsToday.result.to),
    resultLines(cards.pointsToday.result)
  );
  block(
    cards.lateJobs.title,
    `${cards.lateJobs.jobCount} job · ${cards.lateJobs.taskCount} task trễ`,
    [
      csvLine(["Gói công việc", "Dự án", "Leader", "Ngày giao", "Số task trễ", "Trễ từ"]),
      ...cards.lateJobs.items.map((item) =>
        csvLine([
          item.job.code,
          item.projectCode,
          item.leader?.displayName ?? "Chưa có leader",
          formatDeadline(item.deadline, timeZone),
          item.lateTaskCount,
          formatDeadline(item.oldestDeadline, timeZone)
        ])
      )
    ]
  );
  for (const card of [cards.fbRateByUser, cards.fbRateByClient, cards.productivityByShift]) {
    block(card.title, formatRange(card.result.from, card.result.to), resultLines(card.result));
  }
  const kpi = cards.kpiAttainment;
  block(kpi.title, `Kỳ ${kpi.period.slice(5, 7)}/${kpi.period.slice(0, 4)}`, [
    csvLine(["Mức đạt", "Số người"]),
    ...kpi.buckets.map((bucket) => csvLine([bucket.label, bucket.count])),
    csvLine(["Chưa đặt KPI", kpi.withoutTarget]),
    csvLine(["Tổng số người", kpi.members]),
    csvLine(["% đạt trung bình (%)", kpi.averagePercent])
  ]);
  return blocks.map((lines) => lines.join("\r\n")).join("\r\n\r\n") + "\r\n";
};

/** "Quản trị số liệu 2026-10-11.csv" */
export const adminDashboardCsvName = (today: string) => `Quản trị số liệu ${today}.csv`;
