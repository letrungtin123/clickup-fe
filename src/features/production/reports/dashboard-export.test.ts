import { describe, expect, it } from "vitest";

import {
  ReportConfigSchema,
  type AdminDashboard,
  type ReportResult
} from "@/contracts/production-reports";

import { canUndoReview, firstAnomalyKind, unreviewedTotal } from "./anomalies";
import {
  adminDashboardCsv,
  adminDashboardCsvName,
  csvCell,
  csvLine,
  resultLines
} from "./dashboard-export";

const U1 = "00000000-0000-4000-8000-000000000001";
const T1 = "00000000-0000-4000-8000-0000000000a1";

const result = (input: Pick<ReportResult, "columns" | "rows" | "totals">): ReportResult => ({
  config: ReportConfigSchema.parse({ measures: ["points"] }),
  from: "2026-10-01",
  to: "2026-10-11",
  generatedAt: "2026-10-11T03:00:00.000Z",
  truncated: false,
  rowLimit: 5000,
  ...input
});

const fbByUser = result({
  columns: [
    { key: "user", kind: "dimension", label: "Nhân viên", format: "text" },
    { key: "fb_rate", kind: "measure", label: "Tỉ lệ FB", format: "percent" },
    { key: "task_count", kind: "measure", label: "Số task", format: "count" }
  ],
  rows: [
    { user: U1, user_label: "=Nguyễn, An", fb_rate: 0.125, task_count: 8 },
    { user: null, user_label: null, fb_rate: null, task_count: 0 }
  ],
  totals: { fb_rate: 0.1, task_count: 8 }
});

describe("CSV cells", () => {
  it("quotes separators and guards against spreadsheet formulas", () => {
    expect(csvCell("Team A")).toBe("Team A");
    expect(csvCell('Nói "ok", xong')).toBe('"Nói ""ok"", xong"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-5 tấm")).toBe("'-5 tấm");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(1234.567)).toBe("1234.57");
    expect(csvCell(null)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvLine(["a", 1, null])).toBe("a,1,");
  });

  it("writes a report block: labels, measures (rates in %), total", () => {
    expect(resultLines(fbByUser)).toEqual([
      "Nhân viên,Tỉ lệ FB (%),Số task",
      `"'=Nguyễn, An",12.5,8`,
      "Không rõ,,0",
      "Tổng,10,8"
    ]);
  });
});

describe("adminDashboardCsv", () => {
  // A card with no row yet: header and total only.
  const empty = result({
    columns: [
      { key: "team", kind: "dimension", label: "Team", format: "text" },
      { key: "points", kind: "measure", label: "Điểm", format: "points" }
    ],
    rows: [],
    totals: { points: 0 }
  });
  const data: AdminDashboard = {
    generatedAt: "2026-10-11T03:00:00.000Z",
    today: "2026-10-11",
    period: { key: "2026-10", from: "2026-09-26", to: "2026-10-25" },
    cards: {
      pointsToday: { title: "Điểm hôm nay toàn team", config: empty.config, result: empty },
      lateJobs: {
        title: "Job đang trễ",
        config: empty.config,
        jobCount: 1,
        taskCount: 2,
        items: [
          {
            job: { id: T1, number: 12, code: "VD-0012" },
            projectCode: "VD",
            leader: { id: U1, displayName: "Lê Leader", email: null, avatarUrl: null },
            deadline: "2026-10-10T10:00:00.000Z",
            lateTaskCount: 2,
            oldestDeadline: "2026-10-09T10:00:00.000Z"
          }
        ]
      },
      fbRateByUser: { title: "Tỉ lệ FB theo NV", config: empty.config, result: fbByUser },
      fbRateByClient: { title: "Tỉ lệ FB theo client", config: empty.config, result: empty },
      productivityByShift: { title: "Năng suất theo ca", config: empty.config, result: empty },
      kpiAttainment: {
        title: "% đạt KPI",
        config: empty.config,
        period: "2026-10",
        members: 17,
        withoutTarget: 1,
        averagePercent: 41.08,
        buckets: [
          { key: "LT50", label: "Dưới 50%", count: 10 },
          { key: "LT80", label: "50–80%", count: 4 },
          { key: "LT100", label: "80–100%", count: 1 },
          { key: "MET", label: "Đạt", count: 1 }
        ]
      }
    },
    pinned: []
  };

  it("has one block per card, in Vietnamese, with local times", () => {
    const csv = adminDashboardCsv(data, "Asia/Ho_Chi_Minh");
    const blocks = csv.trimEnd().split("\r\n\r\n");
    expect(blocks).toHaveLength(7);
    expect(blocks[0]).toContain("Kỳ KPI 10/2026 (26/09/2026 – 25/10/2026)");
    expect(blocks[1]).toBe(
      ["Điểm hôm nay toàn team · 01/10/2026 – 11/10/2026", "Team,Điểm", "Tổng,0"].join("\r\n")
    );
    expect(blocks[2]).toBe(
      [
        "Job đang trễ · 1 job · 2 task trễ",
        "Job Code,Project,Leader,Ngày giao,Số task trễ,Trễ từ",
        'VD-0012,VD,Lê Leader,"17:00, 10/10/2026",2,"17:00, 09/10/2026"'
      ].join("\r\n")
    );
    expect(blocks[3]).toContain("Tỉ lệ FB theo NV · 01/10/2026 – 11/10/2026");
    expect(blocks[6]).toContain("Chưa đặt KPI,1");
    expect(blocks[6]).toContain("% đạt trung bình (%),41.08");
    expect(adminDashboardCsvName(data.today)).toBe("Quản trị số liệu 2026-10-11.csv");
  });
});

describe("anomaly helpers", () => {
  it("opens the first kind with unreviewed rows and counts them", () => {
    expect(firstAnomalyKind({ QTY_MISMATCH: 0, FAST_DONE: 3 })).toBe("FAST_DONE");
    expect(firstAnomalyKind({ FAST_DONE: 3 }, "QC_FAIL_REPEAT")).toBe("QC_FAIL_REPEAT");
    expect(firstAnomalyKind(undefined, "nope")).toBe("QTY_MISMATCH");
    expect(unreviewedTotal({ QTY_MISMATCH: 2, FAST_DONE: 3 })).toBe(5);
  });

  it("lets only the reviewer or an Admin take 'Đã xem' back (ANOMALY_REVIEW_NOT_OWNER)", () => {
    const reviewed = {
      reviewed: {
        by: { id: U1, displayName: "Lê Leader", email: null, avatarUrl: null },
        at: "2026-10-11T03:00:00.000Z",
        note: null
      }
    };
    expect(canUndoReview(reviewed, { userId: U1, isAdmin: false })).toBe(true);
    expect(canUndoReview(reviewed, { userId: T1, isAdmin: false })).toBe(false);
    expect(canUndoReview(reviewed, { userId: T1, isAdmin: true })).toBe(true);
    expect(canUndoReview({ reviewed: null }, { userId: U1, isAdmin: true })).toBe(false);
  });
});
