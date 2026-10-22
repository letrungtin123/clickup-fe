import { describe, expect, it } from "vitest";

import {
  isProjectOwner,
  leaderChoicesForProject,
  projectCodeTaken,
  projectDeleteBlocker,
  projectJobsLink,
  sortProjects,
  visibleProjects,
  defaultProjectListView
} from "./projects";
import { projectFixture } from "./test-fixtures";

// PD-078 — the Project page model. Made-up codes and names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const me = { id: id(900), displayName: "Người Thử", email: null, avatarUrl: null };
const other = { id: id(901), displayName: "Leader Hai", email: null, avatarUrl: null };
const items = [
  projectFixture({
    id: id(1),
    code: "B10",
    name: "Bờ",
    owner: me,
    jobCount: 2,
    createdAt: "2026-10-03T00:00:00.000Z"
  }),
  projectFixture({
    id: id(2),
    code: "b2",
    name: "Ánh",
    owner: other,
    jobCount: 9,
    createdAt: "2026-10-05T00:00:00.000Z"
  }),
  projectFixture({
    id: id(3),
    code: "Đ1",
    name: "Đá",
    description: "Khách mẫu",
    createdAt: "2026-10-01T00:00:00.000Z"
  }),
  projectFixture({
    id: id(4),
    code: "D2",
    name: "Dừa",
    active: false,
    owner: me,
    createdAt: "2026-10-04T00:00:00.000Z"
  })
];
const codes = (list: readonly { code: string }[]) => list.map((project) => project.code);

describe("Project page model (PD-078)", () => {
  it("sorts by code in Vietnamese order (numbers in order), by name, newest or most jobs", () => {
    expect(codes(sortProjects(items, "code"))).toEqual(["b2", "B10", "D2", "Đ1"]);
    expect(codes(sortProjects(items, "name"))).toEqual(["b2", "B10", "D2", "Đ1"]);
    expect(codes(sortProjects(items, "newest"))).toEqual(["b2", "D2", "B10", "Đ1"]);
    expect(codes(sortProjects(items, "jobs"))).toEqual(["b2", "B10", "D2", "Đ1"]);
  });

  it("shows the active ones (inactive on request), mine only on request, searching code / name / description / owner", () => {
    expect(codes(visibleProjects(items, defaultProjectListView, me.id))).toEqual([
      "b2",
      "B10",
      "Đ1"
    ]);
    expect(
      codes(visibleProjects(items, { ...defaultProjectListView, showInactive: true }, me.id))
    ).toEqual(["b2", "B10", "D2", "Đ1"]);
    expect(
      codes(
        visibleProjects(
          items,
          { ...defaultProjectListView, mineOnly: true, showInactive: true },
          me.id
        )
      )
    ).toEqual(["B10", "D2"]);
    expect(
      codes(visibleProjects(items, { ...defaultProjectListView, term: "khach" }, me.id))
    ).toEqual(["Đ1"]);
    expect(
      codes(visibleProjects(items, { ...defaultProjectListView, term: "leader hai" }, me.id))
    ).toEqual(["b2"]);
  });

  it("delete: why it is off, the Project's job list link, duplicate codes", () => {
    expect(
      projectDeleteBlocker(projectFixture({ id: id(5), code: "X", name: "X", hasJobs: true }))
    ).toBe("Project đã có job — không xoá được (chỉ có thể ngừng hoạt động).");
    expect(projectDeleteBlocker(projectFixture({ id: id(5), code: "X", name: "X" }))).toBe(
      "Chỉ người phụ trách, Quản trị hoặc Account đã tạo mới xoá được Project này."
    );
    expect(
      projectDeleteBlocker(
        projectFixture({
          id: id(5),
          code: "X",
          name: "X",
          capabilities: { canEdit: true, canChangeOwner: false, ownerEdit: "none", canDelete: true }
        })
      )
    ).toBeNull();
    expect(projectJobsLink(id(1))).toBe(`/production/jobs?project=${id(1)}&scope=all`);
    expect(projectCodeTaken(items, " B2 ", null)).toBe(true);
    expect(projectCodeTaken(items, "b2", id(2))).toBe(false);
    expect(projectCodeTaken(items, "AXP", null)).toBe(false);
  });
});

describe("PD-079 — several owners", () => {
  it("“mine” = one of the owners; search finds every owner", () => {
    const shared = projectFixture({ id: id(9), code: "S1", name: "Chung", owners: [other, me] });
    expect(isProjectOwner(shared, me.id)).toBe(true);
    expect(isProjectOwner(shared, id(999))).toBe(false);
    expect(
      codes(visibleProjects([shared], { ...defaultProjectListView, mineOnly: true }, me.id))
    ).toEqual(["S1"]);
    expect(
      codes(visibleProjects([shared], { ...defaultProjectListView, term: "nguoi thu" }, me.id))
    ).toEqual(["S1"]);
  });

  it("a job's Leader: the Project's owners holding LEADER first (in its order), the first one suggested", () => {
    const leaders = [{ id: "l1" }, { id: "l2" }, { id: "l3" }];
    expect(leaderChoicesForProject([{ id: "admin" }, { id: "l3" }, { id: "l1" }], leaders)).toEqual(
      {
        ownerLeaders: [{ id: "l3" }, { id: "l1" }],
        others: [{ id: "l2" }],
        suggested: "l3"
      }
    );
    expect(leaderChoicesForProject([{ id: "admin" }], leaders).suggested).toBeNull();
    expect(leaderChoicesForProject([], leaders).others).toHaveLength(3);
  });
});
