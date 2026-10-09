import { describe, expect, it } from "vitest";

import type { KpiTarget, KpiTargetCell } from "@/contracts/production-scores";

import {
  coverageFor,
  filterMatrixRows,
  formatTarget,
  hasKpiHeader,
  historyFor,
  isAlignedPeriod,
  matrixColumns,
  versionFor,
  type MatrixRow
} from "./matrix";

const cell = (period: string, targetPoints: number | null, explicit = false): KpiTargetCell => ({
  period,
  targetPoints,
  targetId: targetPoints === null ? null : "00000000-0000-4000-8000-000000000001",
  effectiveFrom: targetPoints === null ? null : period,
  explicit
});

const periods = Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, "0")}`);

const row = (name: string, email: string | null, teamId: string | null, target: number | null): MatrixRow => ({
  user: { id: `id-${name}`, displayName: name, email, avatarUrl: null },
  teamId,
  roles: ["STAFF"],
  months: periods.map((period) => cell(period, period >= "2026-05" ? target : null, period === "2026-05")),
  quarters: ["2026-01", "2026-04", "2026-07", "2026-10"].map((period) => cell(period, null)),
  year: cell("2026-01", null)
});

const version = (userId: string, effectiveFrom: string, targetPoints: number, periodType: KpiTarget["periodType"] = "MONTH"): KpiTarget => ({
  id: `${userId}-${periodType}-${effectiveFrom}`,
  userId,
  periodType,
  targetPoints,
  effectiveFrom,
  note: null,
  updatedBy: null,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
});

describe("matrixColumns", () => {
  it("lists 12 months, 4 quarters and the year", () => {
    const columns = matrixColumns({ periods, year: 2026 });
    expect(columns).toHaveLength(17);
    expect(columns[0]).toMatchObject({ key: "2026-01", periodType: "MONTH", label: "T1", title: "Kỳ 01/2026" });
    expect(columns[12]).toMatchObject({ key: "Q1", periodType: "QUARTER", title: "Quý 1/2026" });
    expect(columns[16]).toMatchObject({ key: "Y", periodType: "YEAR", title: "Năm 2026" });
    const sample = row("NV01", null, null, 2400);
    expect(columns[4]?.pick(sample)?.targetPoints).toBe(2400);
    expect(columns[3]?.pick(sample)?.targetPoints).toBeNull();
  });
});

describe("versions", () => {
  const history = [
    version("a", "2026-05", 2400),
    version("a", "2026-09", 2472),
    version("a", "2026-04", 4800, "QUARTER"),
    version("b", "2026-01", 1680)
  ];

  it("keeps one user's versions of one type, newest first", () => {
    expect(historyFor(history, "a", "MONTH").map((item) => item.effectiveFrom)).toEqual(["2026-09", "2026-05"]);
    expect(historyFor(history, "a", "QUARTER")).toHaveLength(1);
  });

  it("finds the version in force for a period", () => {
    const months = historyFor(history, "a", "MONTH");
    expect(versionFor(months, "2026-04")).toBeNull();
    expect(versionFor(months, "2026-05")?.targetPoints).toBe(2400);
    expect(versionFor(months, "2026-08")?.targetPoints).toBe(2400);
    expect(versionFor(months, "2026-12")?.targetPoints).toBe(2472);
  });
});

describe("rows", () => {
  const rows = [row("Nguyễn Văn Đức", "duc@test.local", "t1", 2400), row("NV02", "nv02@test.local", "t2", null)];

  it("filters by accent-insensitive name or email and by team", () => {
    expect(filterMatrixRows(rows, { q: "duc", teamId: null }).map((item) => item.user.displayName)).toEqual([
      "Nguyễn Văn Đức"
    ]);
    expect(filterMatrixRows(rows, { q: "nv02@", teamId: null })).toHaveLength(1);
    expect(filterMatrixRows(rows, { q: "", teamId: "t2" }).map((item) => item.user.displayName)).toEqual(["NV02"]);
    expect(filterMatrixRows(rows, { q: "duc", teamId: "t2" })).toHaveLength(0);
  });

  it("counts people with a target for a month", () => {
    expect(coverageFor(rows, 4)).toBe(1);
    expect(coverageFor(rows, 0)).toBe(0);
  });
});

describe("format and CSV", () => {
  it("formats targets compactly", () => {
    expect(formatTarget(2400)).toBe("2.400");
    expect(formatTarget(1848.5)).toBe("1.848,50");
    expect(formatTarget(null)).toBe("—");
  });

  it("recognizes the import header", () => {
    expect(hasKpiHeader("user_email,target\nnv01@test.local,2400")).toBe(true);
    expect(hasKpiHeader("\uFEFF\n\"User_Email\",\"Target\",note")).toBe(true);
    expect(hasKpiHeader("email,kpi")).toBe(false);
    expect(hasKpiHeader("")).toBe(false);
  });

  it("checks quarter/year alignment", () => {
    expect(isAlignedPeriod("QUARTER", "2026-04")).toBe(true);
    expect(isAlignedPeriod("QUARTER", "2026-05")).toBe(false);
    expect(isAlignedPeriod("YEAR", "2026-01")).toBe(true);
    expect(isAlignedPeriod("YEAR", "2026-04")).toBe(false);
    expect(isAlignedPeriod("MONTH", "2026-05")).toBe(true);
  });
});
