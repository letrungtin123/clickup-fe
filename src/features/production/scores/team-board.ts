import type { ScoreBoard } from "@/contracts/production-scores";

import { matchesQuery } from "../catalog";

/**
 * "Bảng điểm → Toàn đội" (PD-069): everyone's official points of a period with their KPI and % reached (no Team / Khoán
 * money column since 2026-10-20). Not a ranking (no medals, no rank). Pure — unit tested in
 * team-board.test.ts. The API's `rank` / `pointsKhoan` are ignored (PD-066: Khoán is money only).
 */

export type TeamBoardItem = ScoreBoard["items"][number];

/** What the KPI column says: a target, "Chưa có KPI" (must have one, PD-066) or "—" (needs none). */
export type KpiState = "set" | "missing" | "none";

export type TeamRow = {
  item: TeamBoardItem;
  /** Official points / KPI × 100 (2 decimals); null without a positive KPI. */
  percent: number | null;
  kpiState: KpiState;
  /** Official points reached the KPI of the period. */
  met: boolean;
};

export type TeamSortKey = "name" | "team" | "points" | "kpi" | "percent";
export type SortDirection = "asc" | "desc";
export type TeamSort = { key: TeamSortKey; direction: SortDirection };

/** Highest official points first (the default order). */
export const defaultTeamSort: TeamSort = { key: "points", direction: "desc" };

/** First click on a header: names / teams A → Z, figures highest first. */
export const firstDirection = (key: TeamSortKey): SortDirection =>
  key === "name" || key === "team" ? "asc" : "desc";

/** Clicking a header: the same column flips its direction, another column starts with its first direction. */
export const nextTeamSort = (current: TeamSort, key: TeamSortKey): TeamSort =>
  current.key === key
    ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
    : { key, direction: firstDirection(key) };

const round2 = (value: number) => Math.round(value * 100) / 100;

/** `pointsOfficial / kpiTarget` as a percent with 2 decimals (the API's percentKpi); null without a positive KPI. */
export const percentOfKpi = (points: number, target: number | null) =>
  target === null || target <= 0 ? null : round2((points / target) * 100);

export const toTeamRow = (item: TeamBoardItem): TeamRow => ({
  item,
  percent: percentOfKpi(item.pointsOfficial, item.kpiTarget),
  kpiState: item.kpiTarget !== null ? "set" : item.kpiRequired ? "missing" : "none",
  met: item.kpiTarget !== null && item.pointsOfficial >= item.kpiTarget
});

/** Search by name (or team), accents and case ignored. */
export const searchTeamRows = (rows: readonly TeamRow[], query: string) =>
  query.trim() === ""
    ? [...rows]
    : rows.filter((row) => matchesQuery(query, row.item.user.displayName, row.item.teamName));

const collator = new Intl.Collator("vi", { sensitivity: "base", numeric: true });
const byName = (a: TeamRow, b: TeamRow) =>
  collator.compare(a.item.user.displayName, b.item.user.displayName);

const valueOf = (row: TeamRow, key: TeamSortKey): number | string | null => {
  switch (key) {
    case "name":
      return row.item.user.displayName;
    case "team":
      return row.item.teamName;
    case "points":
      return row.item.pointsOfficial;
    case "kpi":
      return row.item.kpiTarget;
    case "percent":
      return row.percent;
  }
};

/**
 * Sorted copy. Empty values (no team, no KPI, no %) always come last whatever the direction; ties by name (A → Z).
 */
export const sortTeamRows = (rows: readonly TeamRow[], sort: TeamSort) => {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = valueOf(a, sort.key);
    const right = valueOf(b, sort.key);
    if (left === null || right === null) {
      if (left === null && right === null) return byName(a, b);
      return left === null ? 1 : -1;
    }
    const compared =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : collator.compare(String(left), String(right));
    return compared === 0 ? byName(a, b) : sign * compared;
  });
};

export type TeamSummary = {
  people: number;
  /** Sum of official points (exact to the cent). */
  points: number;
  /** People whose official points reached their KPI. */
  met: number;
  /** People with a KPI this period. */
  withKpi: number;
  /** People who must have a KPI and have none (PD-066). */
  missingKpi: number;
};

export const teamSummary = (rows: readonly TeamRow[]): TeamSummary => ({
  people: rows.length,
  points: rows.reduce((sum, row) => sum + Math.round(row.item.pointsOfficial * 100), 0) / 100 + 0,
  met: rows.filter((row) => row.met).length,
  withKpi: rows.filter((row) => row.kpiState === "set").length,
  missingKpi: rows.filter((row) => row.kpiState === "missing").length
});

/** Phone sort choices (no column headers there): value = "<key>:<direction>". */
export const teamSortOptions: readonly { value: string; label: string; sort: TeamSort }[] = [
  { value: "points:desc", label: "Điểm cao nhất", sort: { key: "points", direction: "desc" } },
  { value: "points:asc", label: "Điểm thấp nhất", sort: { key: "points", direction: "asc" } },
  { value: "percent:desc", label: "% đạt cao nhất", sort: { key: "percent", direction: "desc" } },
  { value: "percent:asc", label: "% đạt thấp nhất", sort: { key: "percent", direction: "asc" } },
  { value: "kpi:desc", label: "KPI cao nhất", sort: { key: "kpi", direction: "desc" } },
  { value: "name:asc", label: "Tên A → Z", sort: { key: "name", direction: "asc" } }
];

export const teamSortValue = (sort: TeamSort) => `${sort.key}:${sort.direction}`;
