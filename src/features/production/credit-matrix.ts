import type {
  CreditMatrix,
  CreditRule,
  Process,
  ProductionProject
} from "@/contracts/production-catalog";

import { addDays, dayInRange } from "./format";

/**
 * Pure helpers for the credit-rule matrix (projects × processes) and the CSV import/export
 * (header: project_code,process_name,credit,money). Unit tested in credit-matrix.test.ts.
 */

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

export const CREDIT_CSV_HEADER = "project_code,process_name,credit,money";

const csvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** The current matrix in the import format (money empty when there is no price). */
export const matrixToCsv = (view: MatrixView, index: RuleIndex) => {
  const lines = [CREDIT_CSV_HEADER];
  for (const project of view.projects) {
    for (const process of view.processes) {
      const rule = lookupRule(index, project.id, process.id);
      if (!rule) continue;
      lines.push(
        [
          csvCell(project.code),
          csvCell(process.name),
          rule.creditPerImage.toFixed(2),
          rule.moneyPerImage === null ? "" : String(rule.moneyPerImage)
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
