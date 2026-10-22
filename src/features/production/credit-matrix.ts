import {
  creditPerHour,
  hoursPerImageOf,
  type CreditMatrix,
  type CreditRule,
  type Process,
  type ProductionProject
} from "@/contracts/production-catalog";

import { addDays, dayInRange, formatNumber } from "./format";

/**
 * Pure helpers for the credit-rule matrix (projects × processes) and the CSV import/export
 * (header: project_code,process_name,credit,money + PD-080 optional hours). Unit tested in credit-matrix.test.ts.
 */

// "Giờ/tấm" (PD-080) ------------------------------------------------------------------------------

/** Hours keep up to 4 decimals (0,4167 h = 25 minutes); "Giờ/tấm" accepts 0 – 1000. */
const HOURS_DECIMALS = 4;
export const HOURS_MAX = 1000;

/** "0,4167" (Vietnamese decimals, up to 4); "—" for null. */
export const formatHours = (value: number | null | undefined) =>
  formatNumber(value, HOURS_DECIMALS);

/**
 * The hours of a price for display: its own (`derived` false) or credit ÷ 11 (`derived` true, shown with "≈").
 * Null without a price.
 */
export const ruleHours = (
  rule: Pick<CreditRule, "creditPerImage" | "hoursPerImage"> | null | undefined
) => {
  const value = hoursPerImageOf(rule);
  if (!rule || value === null) return null;
  return { value, derived: rule.hoursPerImage === null || rule.hoursPerImage === undefined };
};

/** "0,4167 h" or "≈ 0,1364 h" (derived from the credit). */
export const hoursLabel = (hours: { value: number; derived: boolean }) =>
  `${hours.derived ? "≈ " : ""}${formatHours(hours.value)} h`;

/** Credit ÷ 11 rounded like the API (`hoursPerImageOf`), for a credit being typed. */
export const derivedHours = (creditPerImage: number) =>
  Math.round((creditPerImage / creditPerHour) * 10_000) / 10_000;

type HoursParse = { ok: true; value: number | null } | { ok: false; error: string };

/** "Giờ/tấm" typed by a person: "0,5" or "0.5", up to 4 decimals, 0 – 1000. Empty → null (credit ÷ 11). */
export const parseHoursInput = (text: string): HoursParse => {
  const raw = text.replace(/\s/g, "");
  if (raw === "") return { ok: true, value: null };
  const normalized = raw.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return { ok: false, error: "Nhập số giờ ≥ 0, ví dụ 0,5." };
  }
  const [, fraction = ""] = normalized.split(".");
  if (fraction.length > HOURS_DECIMALS) {
    return { ok: false, error: "Tối đa 4 chữ số thập phân." };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value > HOURS_MAX) {
    return { ok: false, error: "Tối đa 1.000 giờ." };
  }
  return { ok: true, value };
};

/** A file name without its extension ("Bang_gia_202610.csv" → "Bang_gia_202610"): the import `source`. */
export const importSourceName = (fileName: string) => {
  const base = fileName.trim().replace(/\.[^./\\]+$/, "");
  return base.trim() || fileName.trim();
};

export const ruleKey = (projectId: string, processId: string) => `${projectId}:${processId}`;

export type RuleIndex = ReadonlyMap<string, CreditRule>;

/** One rule per cell: the API returns at most one rule effective on the matrix day per pair. */
export const indexRules = (rules: readonly CreditRule[]): RuleIndex =>
  new Map(rules.map((rule) => [ruleKey(rule.projectId, rule.processId), rule]));

export const lookupRule = (index: RuleIndex, projectId: string, processId: string) =>
  index.get(ruleKey(projectId, processId)) ?? null;

/** The version of a history list that covers `day` (history is newest first). */
export const versionAt = (history: readonly CreditRule[], day: string) =>
  history.find((rule) => dayInRange(day, rule.effectiveFrom, rule.effectiveTo)) ?? null;

const fold = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export type MatrixView = { projects: ProductionProject[]; processes: Process[] };

/**
 * Rows and columns to show. Archived projects/processes are hidden unless asked for, except when
 * they still carry a rule on that day (so a price never silently disappears from view).
 */
export const filterMatrix = (
  matrix: Pick<CreditMatrix, "projects" | "processes" | "rules">,
  options: { q?: string; showArchived?: boolean }
): MatrixView => {
  const q = fold(options.q?.trim() ?? "");
  const withRules = new Set(matrix.rules.flatMap((rule) => [rule.projectId, rule.processId]));
  const visible = (item: { id: string; active: boolean }) =>
    options.showArchived || item.active || withRules.has(item.id);
  return {
    projects: matrix.projects.filter(
      (project) =>
        visible(project) &&
        (!q || fold(`${project.code} ${project.name} ${project.clientName ?? ""}`).includes(q))
    ),
    processes: matrix.processes.filter(visible)
  };
};

/** Cells with a rule / total cells, for the toolbar summary. */
export const matrixCoverage = (view: MatrixView, index: RuleIndex) => {
  let filled = 0;
  for (const project of view.projects) {
    for (const process of view.processes) {
      if (index.has(ruleKey(project.id, process.id))) filled += 1;
    }
  }
  return { filled, total: view.projects.length * view.processes.length };
};

// CSV ---------------------------------------------------------------------------------------------

/** The required columns of the import. */
export const CREDIT_CSV_HEADER = "project_code,process_name,credit,money";
/** PD-080: the optional "Giờ/tấm" column (aliases hours_per_image, gio_tam; empty = credit ÷ 11). */
export const CREDIT_CSV_HOURS_COLUMN = "hours";

const csvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * The current matrix in the import format (money empty when there is no price; PD-080: `hours` = the price's own
 * "Giờ/tấm", empty when it is derived from the credit, so a re-import keeps it derived).
 */
export const matrixToCsv = (view: MatrixView, index: RuleIndex) => {
  const lines = [`${CREDIT_CSV_HEADER},${CREDIT_CSV_HOURS_COLUMN}`];
  for (const project of view.projects) {
    for (const process of view.processes) {
      const rule = lookupRule(index, project.id, process.id);
      if (!rule) continue;
      lines.push(
        [
          csvCell(project.code),
          csvCell(process.name),
          rule.creditPerImage.toFixed(2),
          rule.moneyPerImage === null ? "" : String(rule.moneyPerImage),
          rule.hoursPerImage === null || rule.hoursPerImage === undefined
            ? ""
            : String(Math.round(rule.hoursPerImage * 10_000) / 10_000)
        ].join(",")
      );
    }
  }
  return `${lines.join("\r\n")}\r\n`;
};

const stripBom = (text: string) => (text.startsWith("﻿") ? text.slice(1) : text);

/**
 * Text pasted from a spreadsheet arrives tab-separated. When the first non-empty line has tabs and
 * no commas, convert every line to CSV (quoting cells that need it). Line count is preserved so the
 * API's line numbers still point at what the user pasted.
 */
export const normalizeCreditCsv = (text: string) => {
  const input = stripBom(text);
  const first = input.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  if (!first.includes("\t") || first.includes(",")) {
    return input;
  }
  return input
    .split(/\r?\n/)
    .map((line) =>
      line.includes("\t")
        ? line
            .split("\t")
            .map((cell) => csvCell(cell.trim()))
            .join(",")
        : line
    )
    .join("\n");
};

/** The raw source line (1-based) for an import error, trimmed for display. */
export const sourceLine = (text: string, line: number) => {
  const lines = stripBom(text).split(/\r?\n/);
  const value = lines[line - 1];
  return value === undefined ? null : value.trim();
};

/** Non-empty lines after the header — a quick preview count before uploading. */
export const countDataRows = (text: string) => {
  const lines = stripBom(text)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  return Math.max(0, lines.length - 1);
};

/** True when the first non-empty line looks like the expected header. */
export const hasCreditHeader = (text: string) => {
  const first = stripBom(text)
    .split(/\r?\n/)
    .find((line) => line.trim() !== "");
  if (!first) return false;
  const cells = first.split(",").map((cell) => cell.trim().toLowerCase().replace(/^"|"$/g, ""));
  return ["project_code", "process_name", "credit"].every((name) => cells.includes(name));
};

/**
 * First day a new price version may start after the API refused one (409 CREDIT_RULE_IN_USE: the
 * price in force already priced scores up to the day named in its message, "… đến ngày 12/10/2026 …").
 * The day after that, never before `today`; without a date in the message, the day after `from`.
 */
export const nextFreeVersionDay = (message: string, from: string, today: string) => {
  const match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(message);
  const lastPriced = match ? `${match[3]}-${match[2]}-${match[1]}` : from;
  const next = addDays(lastPriced, 1);
  return next > today ? next : today;
};
