import { describe, expect, it } from "vitest";

import type { CreditRule, Process, ProductionProject } from "@/contracts/production-catalog";

import {
  countDataRows,
  CREDIT_CSV_HEADER,
  filterMatrix,
  hasCreditHeader,
  indexRules,
  lookupRule,
  matrixCoverage,
  matrixToCsv,
  nextFreeVersionDay,
  normalizeCreditCsv,
  sourceLine,
  versionAt
} from "./credit-matrix";

// Obviously fake fixtures: the repository is public.
const project = (id: string, code: string, active = true): ProductionProject => ({
  id,
  code,
  name: `Dự án ${code}`,
  clientId: null,
  clientName: id === "p1" ? "Khách Mẫu" : null,
  qcBufferHours: 0,
  active
});
const process = (id: string, name: string, active = true): Process => ({
  id,
  name,
  isQc: name === "Kiểm tra",
  sortOrder: 10,
  active
});
const rule = (
  id: string,
  projectId: string,
  processId: string,
  creditPerImage: number,
  moneyPerImage: number | null,
  effectiveFrom = "2026-01-01",
  effectiveTo: string | null = null
): CreditRule => ({
  id,
  projectId,
  processId,
  creditPerImage,
  moneyPerImage,
  effectiveFrom,
  effectiveTo
});

const projects = [project("p1", "FAKE-A"), project("p2", "FAKE-B"), project("p3", "OLD", false)];
const processes = [
  process("x1", "Chỉnh sửa"),
  process("x2", "Kiểm tra"),
  process("x3", "Cũ", false)
];
const rules = [
  rule("r1", "p1", "x1", 1.5, 7000),
  rule("r2", "p1", "x2", 0.1, null),
  rule("r3", "p3", "x1", 2, 100)
];

describe("rule index", () => {
  it("finds the rule of a cell or null", () => {
    const index = indexRules(rules);
    expect(lookupRule(index, "p1", "x1")?.id).toBe("r1");
    expect(lookupRule(index, "p2", "x1")).toBeNull();
  });

  it("picks the version covering a day from newest-first history", () => {
    const history = [
      rule("v3", "p1", "x1", 3, null, "2026-10-15"),
      rule("v2", "p1", "x1", 2, null, "2026-10-01", "2026-10-15"),
      rule("v1", "p1", "x1", 1, null, "2026-01-01", "2026-10-01")
    ];
    expect(versionAt(history, "2026-10-14")?.id).toBe("v2");
    expect(versionAt(history, "2026-10-15")?.id).toBe("v3");
    expect(versionAt(history, "2025-12-31")).toBeNull();
  });
});

describe("filterMatrix", () => {
  it("hides archived rows/columns unless they still carry a rule", () => {
    const view = filterMatrix({ projects, processes, rules }, {});
    expect(view.projects.map((item) => item.id)).toEqual(["p1", "p2", "p3"]);
    expect(view.processes.map((item) => item.id)).toEqual(["x1", "x2"]);
  });

  it("shows archived items on request", () => {
    const view = filterMatrix({ projects, processes, rules: [] }, { showArchived: true });
    expect(view.projects).toHaveLength(3);
    expect(view.processes).toHaveLength(3);
  });

  it("searches code, name and client accent-insensitively", () => {
    expect(
      filterMatrix({ projects, processes, rules }, { q: "khach mau" }).projects.map(
        (item) => item.id
      )
    ).toEqual(["p1"]);
    expect(
      filterMatrix({ projects, processes, rules }, { q: "fake-b" }).projects.map((item) => item.id)
    ).toEqual(["p2"]);
  });

  it("reports coverage", () => {
    const view = filterMatrix({ projects, processes, rules }, {});
    expect(matrixCoverage(view, indexRules(rules))).toEqual({ filled: 3, total: 6 });
  });
});

describe("CSV", () => {
  it("exports the visible matrix in the import format", () => {
    const view = {
      projects: [projects[0]!, project("p4", 'A,"B"')],
      processes: [processes[0]!, processes[1]!]
    };
    const index = indexRules([...rules, rule("r4", "p4", "x1", 1, 5000)]);
    expect(matrixToCsv(view, index)).toBe(
      [
        CREDIT_CSV_HEADER,
        "FAKE-A,Chỉnh sửa,1.50,7000",
        "FAKE-A,Kiểm tra,0.10,",
        '"A,""B""",Chỉnh sửa,1.00,5000',
        ""
      ].join("\r\n")
    );
  });

  it("converts tab-separated paste to CSV and keeps line numbers", () => {
    const pasted =
      "project_code\tprocess_name\tcredit\tmoney\nFAKE\tChỉnh sửa, nhẹ\t1,5\t7000\n\nFAKE\tKiểm tra\t0.1\t";
    const csv = normalizeCreditCsv(pasted);
    expect(csv.split("\n")).toEqual([
      "project_code,process_name,credit,money",
      'FAKE,"Chỉnh sửa, nhẹ","1,5",7000',
      "",
      "FAKE,Kiểm tra,0.1,"
    ]);
    expect(sourceLine(csv, 4)).toBe("FAKE,Kiểm tra,0.1,");
  });

  it("leaves real CSV untouched (minus a BOM)", () => {
    const csv = "﻿project_code,process_name,credit,money\nA,B,1,";
    expect(normalizeCreditCsv(csv)).toBe("project_code,process_name,credit,money\nA,B,1,");
  });

  it("counts data rows and detects the header", () => {
    const csv = "project_code,process_name,credit,money\r\nA,B,1,\r\n\r\nC,D,2,100\r\n";
    expect(countDataRows(csv)).toBe(2);
    expect(hasCreditHeader(csv)).toBe(true);
    expect(hasCreditHeader("code,name\nA,B")).toBe(false);
    expect(countDataRows("")).toBe(0);
  });

  it("returns the raw source line for an error", () => {
    expect(sourceLine("a\nb\r\nc", 2)).toBe("b");
    expect(sourceLine("a", 5)).toBeNull();
  });
});

describe("nextFreeVersionDay", () => {
  it("starts the day after the last priced day named by the API, never in the past", () => {
    const message =
      "Đơn giá này đã được dùng để tính điểm đến ngày 12/10/2026 — hãy tạo phiên bản mới bắt đầu sau ngày đó.";
    expect(nextFreeVersionDay(message, "2026-10-01", "2026-10-10")).toBe("2026-10-13");
    expect(nextFreeVersionDay(message, "2026-10-01", "2026-10-20")).toBe("2026-10-20");
    expect(nextFreeVersionDay("Không sửa được.", "2026-10-11", "2026-10-10")).toBe("2026-10-12");
    expect(nextFreeVersionDay("Không sửa được.", "2026-12-31", "2026-10-10")).toBe("2027-01-01");
  });
});
