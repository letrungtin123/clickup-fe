import type { ProductionProject } from "@/contracts/production-catalog";

import { matchesQuery } from "./catalog";

/**
 * PD-078 — the Project page (/production/projects): Project > Job Code > Task > Subtask. Pure helpers, unit tested; the
 * rules themselves (who creates / edits / deletes, who owns) are the contract's (`projectCapabilitiesFor`,
 * `mayCreateProject`, …) and the API enforces them.
 */

export type ProjectSort = "code" | "name" | "newest" | "jobs";

export const projectSortLabels: Record<ProjectSort, string> = {
  code: "Mã A → Z",
  name: "Tên A → Z",
  newest: "Mới tạo nhất",
  jobs: "Nhiều job nhất"
};

export const projectSorts = Object.keys(projectSortLabels) as ProjectSort[];

/** Vietnamese order, case / accents ignored, numbers in numeric order ("B2" before "B10"). */
const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

const byCode = (a: ProductionProject, b: ProductionProject) =>
  collator.compare(a.code, b.code) ||
  (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) ||
  (a.id < b.id ? -1 : 1);

/** A copy in the chosen order (ties by code). */
export const sortProjects = (items: readonly ProductionProject[], sort: ProjectSort) =>
  [...items].sort((a, b) => {
    switch (sort) {
      case "name":
        return collator.compare(a.name, b.name) || byCode(a, b);
      case "newest":
        return b.createdAt.localeCompare(a.createdAt) || byCode(a, b);
      case "jobs":
        return b.jobCount - a.jobCount || byCode(a, b);
      default:
        return byCode(a, b);
    }
  });

export type ProjectListView = {
  term: string;
  /** Show the inactive ("Ngừng hoạt động") Projects too. */
  showInactive: boolean;
  /** Only the Projects I own (PD-079: am one of the owners of). */
  mineOnly: boolean;
  sort: ProjectSort;
};

export const defaultProjectListView: ProjectListView = {
  term: "",
  showInactive: false,
  mineOnly: false,
  sort: "code"
};

/** The rows shown: active ones (inactive too when asked), mine only when asked, matching the search, in the chosen order. */
export const visibleProjects = (
  items: readonly ProductionProject[],
  view: ProjectListView,
  myId: string
) =>
  sortProjects(
    items.filter(
      (project) =>
        (view.showInactive || project.active) &&
        (!view.mineOnly || isProjectOwner(project, myId)) &&
        matchesQuery(
          view.term,
          project.code,
          project.name,
          project.description,
          ...project.owners.map((owner) => owner.displayName)
        )
    ),
    view.sort
  );

/** PD-079: one of the owners of the Project. */
export const isProjectOwner = (project: Pick<ProductionProject, "owners">, userId: string) =>
  project.owners.some((owner) => owner.id === userId);

/**
 * PD-079: the people offered as a job's Leader when an Admin or an Account creates a job — the Project's owners holding
 * LEADER first (in the Project's order), then every other Leader; the first such owner is the pre-filled choice (null
 * without one).
 */
export const leaderChoicesForProject = <P extends { id: string }>(
  owners: readonly { id: string }[],
  leaders: readonly P[]
) => {
  const ownerLeaders = owners.flatMap((owner) =>
    leaders.filter((leader) => leader.id === owner.id)
  );
  const others = leaders.filter((leader) => !ownerLeaders.some((owner) => owner.id === leader.id));
  return { ownerLeaders, others, suggested: ownerLeaders[0]?.id ?? null };
};

/** Why the delete action is off (null: allowed). */
export const projectDeleteBlocker = (project: ProductionProject): string | null =>
  project.capabilities.canDelete
    ? null
    : project.hasJobs
      ? "Project đã có job — không xoá được (chỉ có thể ngừng hoạt động)."
      : "Chỉ người phụ trách, Quản trị hoặc Account đã tạo mới xoá được Project này.";

/** The Job list of a Project, on "Tất cả" (its jobs whoever owns it). */
export const projectJobsLink = (projectId: string) =>
  `/production/jobs?${new URLSearchParams({ project: projectId, scope: "all" }).toString()}`;

/** Project codes are unique case-insensitively (the API answers 409 PROJECT_CODE_TAKEN). */
export const projectCodeTaken = (
  items: readonly ProductionProject[],
  code: string,
  exceptId: string | null
) =>
  items.some(
    (project) =>
      project.id !== exceptId && project.code.trim().toLowerCase() === code.trim().toLowerCase()
  );
