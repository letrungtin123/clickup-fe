import { useQuery } from "@tanstack/react-query";

import { TeamLoadSchema, type TeamMemberLoad } from "@/contracts/production-overview";
import { api } from "@/lib/api/client";

import { productionKeys } from "./keys";

/**
 * PD-080 — "ảnh đang ôm" of the team for "Chia task": the suggestions ("Gợi ý"), "Xem cả team" and the load next to each
 * name in the "Nhân viên thực hiện" picker. Load = images of a person's lines in Mới giao / Đang làm / Cần sửa lại over
 * every live job (not Chờ QC), per project, biggest first (BE GET /production/team-load, LEADER / ADMIN only). Pure
 * helpers below are unit tested.
 */

export const teamLoadApi = {
  get: (signal?: AbortSignal) => api.get("/production/team-load", TeamLoadSchema, { signal })
};

/**
 * The team's load. Fresh for 30 s (a split adds tasks: every task write refreshes it — its key sits under the job lists'
 * prefix); refetched when the window regains focus. 403 is never retried (query-client defaults).
 */
export const useTeamLoad = (enabled = true) =>
  useQuery({
    queryKey: productionKeys.teamLoad(),
    queryFn: ({ signal }) => teamLoadApi.get(signal),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled
  });

type Leave = TeamMemberLoad["leave"];

/** No open line at all ("Rảnh"). */
export const isFree = (member: Pick<TeamMemberLoad, "openTasks">) => member.openTasks === 0;

/** "Nghỉ cả ngày" / "Nghỉ sáng" / "Nghỉ chiều" (empty without leave). */
export const leaveLabel = (leave: Leave) =>
  !leave ? "" : leave.part === "FULL_DAY" ? "Nghỉ cả ngày" : leave.part === "MORNING" ? "Nghỉ sáng" : "Nghỉ chiều";

/** On leave right now, or for the whole day: not selectable, never suggested. */
export const unavailable = (member: Pick<TeamMemberLoad, "leave">) =>
  member.leave !== null && (member.leave.now || member.leave.part === "FULL_DAY");

/**
 * "Rảnh", "10 AXP - 2 BRX" (per project, biggest first as the API orders them), plus " · +N task chưa có SL" for lines
 * without a quantity ("+N task chưa có SL" alone when none has one).
 */
export const loadLabel = (member: Pick<TeamMemberLoad, "openTasks" | "tasksWithoutQty" | "byProject">) => {
  if (isFree(member)) return "Rảnh";
  const parts = member.byProject
    .filter((entry) => entry.images > 0)
    .map((entry) => `${entry.images} ${entry.project.code}`)
    .join(" - ");
  const withoutQty = member.tasksWithoutQty > 0 ? `+${member.tasksWithoutQty} task chưa có SL` : "";
  if (parts && withoutQty) return `${parts} · ${withoutQty}`;
  return parts || withoutQty || `${member.openTasks} task`;
};

/** Works on that project now (an open line there). */
export const worksOnProject = (member: Pick<TeamMemberLoad, "byProject">, projectId: string) =>
  member.byProject.some((entry) => entry.project.id === projectId && entry.tasks > 0);

const byName = (a: TeamMemberLoad, b: TeamMemberLoad) =>
  a.user.displayName.localeCompare(b.user.displayName, "vi");
const lightestFirst = (a: TeamMemberLoad, b: TeamMemberLoad) =>
  a.images - b.images || a.openTasks - b.openTasks || byName(a, b);

const eligibleOnly = (members: readonly TeamMemberLoad[], eligibleIds: ReadonlySet<string> | null) =>
  eligibleIds ? members.filter((member) => eligibleIds.has(member.user.id)) : [...members];

/** Splits the available people: Rảnh (by name), on the project (lightest first), the others (lightest first). */
const rankAvailable = (members: readonly TeamMemberLoad[], projectId: string) => {
  const available = members.filter((member) => !unavailable(member));
  return {
    free: available.filter(isFree).sort(byName),
    onProject: available
      .filter((member) => !isFree(member) && worksOnProject(member, projectId))
      .sort(lightestFirst),
    others: available
      .filter((member) => !isFree(member) && !worksOnProject(member, projectId))
      .sort(lightestFirst)
  };
};

/**
 * "Gợi ý": up to `limit` people the line may take (`eligibleIds`, null = everyone) — Rảnh first, then people already on
 * the project (fewest images first), then everyone else (fewest images first); people on leave are left out.
 */
export const suggestAssignees = (
  members: readonly TeamMemberLoad[],
  projectId: string,
  eligibleIds: ReadonlySet<string> | null,
  limit = 5
) => {
  const ranked = rankAvailable(eligibleOnly(members, eligibleIds), projectId);
  return [...ranked.free, ...ranked.onProject, ...ranked.others].slice(0, limit);
};

export type TeamGroupKey = "free" | "project" | "other" | "leave";
export type TeamGroup = { key: TeamGroupKey; title: string; members: TeamMemberLoad[] };

/** "Xem cả team": Rảnh · Đang làm <code> · Khác · Đang nghỉ, in the suggestions' order; empty groups left out. */
export const groupTeam = (
  members: readonly TeamMemberLoad[],
  project: { id: string; code: string },
  eligibleIds: ReadonlySet<string> | null
): TeamGroup[] => {
  const eligible = eligibleOnly(members, eligibleIds);
  const ranked = rankAvailable(eligible, project.id);
  const groups: TeamGroup[] = [
    { key: "free", title: "Rảnh", members: ranked.free },
    { key: "project", title: `Đang làm ${project.code}`, members: ranked.onProject },
    { key: "other", title: "Khác", members: ranked.others },
    { key: "leave", title: "Đang nghỉ", members: eligible.filter(unavailable).sort(byName) }
  ];
  return groups.filter((group) => group.members.length > 0);
};

/** The tag of a tile: "Rảnh", "Đang làm <code>", or none. */
export const loadTag = (member: TeamMemberLoad, project: { id: string; code: string }) =>
  isFree(member)
    ? ({ kind: "free", label: "Rảnh" } as const)
    : worksOnProject(member, project.id)
      ? ({ kind: "project", label: `Đang làm ${project.code}` } as const)
      : null;

/** Last two words of a Vietnamese name ("Thị Bích Ngọc" → "Bích Ngọc"), for compact tiles. */
export const shortName = (displayName: string) => {
  const words = displayName.trim().split(/\s+/);
  return words.length > 2 ? words.slice(-2).join(" ") : displayName.trim();
};
