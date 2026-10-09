import { describe, expect, it } from "vitest";

import {
  formatDeadline,
  sortWorkload,
  teamPointsModel,
  workloadTotals,
  type WorkloadRow
} from "./dashboard";

const row = (name: string, patch: Partial<WorkloadRow> = {}): WorkloadRow => ({
  user: {
    id: `00000000-0000-4000-8000-${name.padStart(12, "0").slice(-12)}`,
    displayName: name,
    email: null,
    avatarUrl: null
  },
  teamId: null,
  teamName: null,
  qtyNotStarted: 0,
  qtyProcessing: 0,
  openTasks: 0,
  qtyDoneToday: 0,
  tasksDoneToday: 0,
  leaveToday: null,
  ...patch
});

describe("workload", () => {
  const rows = [
    row("Bình", {
      qtyNotStarted: 5,
      qtyProcessing: 5,
      openTasks: 2,
      qtyDoneToday: 3,
      tasksDoneToday: 1
    }),
    row("An", { qtyProcessing: 20, openTasks: 1, leaveToday: "MORNING" }),
    row("Châu", { qtyDoneToday: 12, tasksDoneToday: 2 })
  ];

  it("sorts by open load, done today or name", () => {
    expect(sortWorkload(rows, "load").map((item) => item.user.displayName)).toEqual([
      "An",
      "Bình",
      "Châu"
    ]);
    expect(sortWorkload(rows, "done").map((item) => item.user.displayName)).toEqual([
      "Châu",
      "Bình",
      "An"
    ]);
    expect(sortWorkload(rows, "name").map((item) => item.user.displayName)).toEqual([
      "An",
      "Bình",
      "Châu"
    ]);
  });

  it("adds up the headline figures", () => {
    expect(workloadTotals(rows)).toEqual({
      notStarted: 5,
      processing: 25,
      doneToday: 15,
      tasksDoneToday: 3,
      busy: 2,
      onLeave: 1
    });
  });
});

describe("teamPointsModel", () => {
  const weeks = ["2026-05-04", "2026-05-11"];

  it("stacks one series per team per week", () => {
    const model = teamPointsModel(
      {
        weeks,
        series: [
          { teamId: null, teamName: "Team A", points: [10, 20], pointsKhoan: [1, 2] },
          { teamId: null, teamName: "Team B", points: [5, 0], pointsKhoan: [0, 0] }
        ]
      },
      "points"
    );
    expect(model.series).toEqual([
      { key: "s0", label: "Team A" },
      { key: "s1", label: "Team B" }
    ]);
    expect(model.data[0]).toEqual({
      category: "2026-05-04",
      label: "Tuần 04/05/2026",
      s0: 10,
      s1: 5
    });
    expect(model.timeAxis).toBe(true);
    expect(teamPointsModel({ weeks, series: [] }, "pointsKhoan").measure).toBe("points_khoan");
  });

  it("folds teams past the 8th slot into Khác", () => {
    const series = Array.from({ length: 10 }, (_, index) => ({
      teamId: null,
      teamName: `T${index}`,
      points: [index, index],
      pointsKhoan: [0, 0]
    }));
    const model = teamPointsModel({ weeks, series }, "points");
    expect(model.series).toHaveLength(8);
    expect(model.series.at(-1)).toEqual({ key: "other", label: "Khác", other: true });
    expect(model.data[0]?.other).toBe(0 + 1 + 2);
  });
});

describe("formatDeadline", () => {
  it("shows time and day in the organization timezone", () => {
    const now = new Date("2026-10-10T03:00:00.000Z");
    expect(formatDeadline("2026-05-12T07:30:00.000Z", "Asia/Ho_Chi_Minh", now)).toBe("14:30 · 12/05");
    expect(formatDeadline("2025-05-12T07:30:00.000Z", "Asia/Ho_Chi_Minh", now)).toBe(
      "14:30 · 12/05/2025"
    );
  });
});
