import { describe, expect, it } from "vitest";

import type { TeamMemberLoad } from "@/contracts/production-overview";

import {
  groupTeam,
  isFree,
  leaveLabel,
  loadLabel,
  loadTag,
  shortName,
  suggestAssignees,
  unavailable,
  worksOnProject
} from "./team-load";

// PD-080 team load of "Chia task". Made-up project codes and names only (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const AXP = { id: id(901), code: "AXP" };
const BRX = { id: id(902), code: "BRX" };
const CQZ = { id: id(903), code: "CQZ" };

const member = (
  n: number,
  name: string,
  load: { project: { id: string; code: string }; images: number; tasks?: number }[] = [],
  extra: Partial<TeamMemberLoad> = {}
): TeamMemberLoad => ({
  user: { id: id(n), displayName: name, email: null, avatarUrl: null },
  roles: ["STAFF"],
  leave: null,
  openTasks: load.reduce((sum, entry) => sum + (entry.tasks ?? 1), 0),
  images: load.reduce((sum, entry) => sum + entry.images, 0),
  tasksWithoutQty: 0,
  byProject: load
    .map((entry) => ({ project: entry.project, images: entry.images, tasks: entry.tasks ?? 1 }))
    .sort((a, b) => b.images - a.images),
  ...extra
});

const names = (list: readonly TeamMemberLoad[]) => list.map((item) => item.user.displayName);

describe("team load labels (PD-080)", () => {
  it("Rảnh without an open line; per project, biggest first, joined with ' - '", () => {
    expect(loadLabel(member(1, "Test Alpha"))).toBe("Rảnh");
    expect(isFree(member(1, "Test Alpha"))).toBe(true);
    const busy = member(2, "Test Beta", [
      { project: BRX, images: 2 },
      { project: AXP, images: 10 }
    ]);
    expect(isFree(busy)).toBe(false);
    expect(loadLabel(busy)).toBe("10 AXP - 2 BRX");
  });

  it("lines without a quantity are added as '+N task chưa có SL' (alone when no line has one)", () => {
    expect(loadLabel(member(3, "Test Gamma", [{ project: AXP, images: 20 }], { tasksWithoutQty: 2, openTasks: 3 }))).toBe(
      "20 AXP · +2 task chưa có SL"
    );
    expect(loadLabel(member(4, "Test Delta", [{ project: CQZ, images: 0, tasks: 1 }], { tasksWithoutQty: 1 }))).toBe(
      "+1 task chưa có SL"
    );
  });

  it("leave labels; on leave now or all day = unavailable, a half day later today is not", () => {
    expect(leaveLabel(null)).toBe("");
    expect(leaveLabel({ part: "FULL_DAY", now: true })).toBe("Nghỉ cả ngày");
    expect(leaveLabel({ part: "MORNING", now: false })).toBe("Nghỉ sáng");
    expect(leaveLabel({ part: "AFTERNOON", now: true })).toBe("Nghỉ chiều");
    expect(unavailable({ leave: null })).toBe(false);
    expect(unavailable({ leave: { part: "FULL_DAY", now: false } })).toBe(true);
    expect(unavailable({ leave: { part: "AFTERNOON", now: true } })).toBe(true);
    expect(unavailable({ leave: { part: "MORNING", now: false } })).toBe(false);
  });

  it("works on a project only with an open line there; tags Rảnh / Đang làm <code> / none", () => {
    const onAxp = member(5, "Test Epsilon", [{ project: AXP, images: 4 }]);
    expect(worksOnProject(onAxp, AXP.id)).toBe(true);
    expect(worksOnProject(onAxp, BRX.id)).toBe(false);
    expect(loadTag(member(6, "Test Zeta"), AXP)).toEqual({ kind: "free", label: "Rảnh" });
    expect(loadTag(onAxp, AXP)).toEqual({ kind: "project", label: "Đang làm AXP" });
    expect(loadTag(onAxp, BRX)).toBeNull();
  });

  it("short names keep the last two words", () => {
    expect(shortName("Nguyen Van Test")).toBe("Van Test");
    expect(shortName("Test Alpha")).toBe("Test Alpha");
  });
});

describe("suggestions and the whole team (PD-080)", () => {
  const team = [
    member(10, "Test Kilo", [{ project: BRX, images: 3 }]),
    member(11, "Test Bravo"),
    member(12, "Test Lima", [{ project: AXP, images: 25 }]),
    member(13, "Test Alpha"),
    member(14, "Test Mike", [{ project: AXP, images: 5 }, { project: BRX, images: 1 }]),
    member(15, "Test Oscar", [{ project: CQZ, images: 3 }]),
    member(16, "Test Away"),
    member(17, "Test Charlie", [{ project: AXP, images: 5 }])
  ];
  team[6] = { ...team[6]!, leave: { part: "FULL_DAY", now: true } };
  const everyone = null;

  it("Rảnh first (by name), then people on the project (fewest images first, ties by name), then the lightest others", () => {
    expect(names(suggestAssignees(team, AXP.id, everyone, 10))).toEqual([
      "Test Alpha",
      "Test Bravo",
      "Test Charlie",
      "Test Mike",
      "Test Lima",
      "Test Kilo",
      "Test Oscar"
    ]);
  });

  it("five at most by default; people on leave never suggested", () => {
    const suggested = names(suggestAssignees(team, AXP.id, everyone));
    expect(suggested).toHaveLength(5);
    expect(suggested).not.toContain("Test Away");
  });

  it("only the people the line may take (eligible ids)", () => {
    const eligible = new Set([id(10), id(12), id(16)]);
    expect(names(suggestAssignees(team, AXP.id, eligible))).toEqual(["Test Lima", "Test Kilo"]);
  });

  it("groups Rảnh · Đang làm <code> · Khác · Đang nghỉ, empty ones left out", () => {
    const groups = groupTeam(team, AXP, everyone);
    expect(groups.map((group) => group.title)).toEqual(["Rảnh", "Đang làm AXP", "Khác", "Đang nghỉ"]);
    expect(names(groups[0]!.members)).toEqual(["Test Alpha", "Test Bravo"]);
    expect(names(groups[1]!.members)).toEqual(["Test Charlie", "Test Mike", "Test Lima"]);
    expect(names(groups[2]!.members)).toEqual(["Test Kilo", "Test Oscar"]);
    expect(names(groups[3]!.members)).toEqual(["Test Away"]);
    expect(groupTeam(team, CQZ, new Set([id(15)])).map((group) => group.title)).toEqual(["Đang làm CQZ"]);
  });
});
