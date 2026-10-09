import { useMemo } from "react";

import { taskKindLabels, type ReportFilters } from "@/contracts/production-reports";

import { foldText } from "../catalog";
import {
  useClients,
  useProcesses,
  useProductionMembers,
  useProductionProjects,
  useShifts,
  useTags,
  useTeams,
  useWorkflow
} from "../hooks";
import type { IdFilterKey } from "./model";

/**
 * Options of the report filters, from the catalog the builder user can read (LEADER / ADMIN: members,
 * teams, clients, projects, processes, shifts, statuses, tags). Archived entries stay selectable (old
 * data) and are listed last.
 */

export type FilterOption = {
  id: string;
  label: string;
  hint?: string | undefined;
  color?: string | undefined;
  archived?: boolean | undefined;
  search: string;
};

export type ChoiceFilterKey = "taskKind" | "scoreRole" | "taskState" | "jobState";
export type FilterKey = Exclude<IdFilterKey, "job"> | ChoiceFilterKey;

export const filterKeys: readonly FilterKey[] = [
  "user",
  "team",
  "project",
  "client",
  "process",
  "shift",
  "status",
  "taskKind",
  "tag",
  "scoreRole",
  "taskState",
  "jobState"
];

const option = (
  id: string,
  label: string,
  extra: { hint?: string | null | undefined; color?: string | undefined; archived?: boolean } = {}
): FilterOption => ({
  id,
  label,
  hint: extra.hint ?? undefined,
  color: extra.color,
  archived: extra.archived,
  search: foldText(`${label} ${extra.hint ?? ""}`)
});

const byActive = (a: FilterOption, b: FilterOption) =>
  Number(a.archived ?? false) - Number(b.archived ?? false);

export const scoreRoleLabels: Record<"WORKER" | "QC", string> = {
  WORKER: "Người làm",
  QC: "QC kiểm"
};
export const taskStateLabels: Record<"OPEN" | "DONE", string> = {
  OPEN: "Chưa xong",
  DONE: "Đã xong"
};
/** Archived jobs are read-only; reports include them unless filtered. */
export const jobStateLabels: Record<"ACTIVE" | "ARCHIVED", string> = {
  ACTIVE: "Job chưa lưu trữ",
  ARCHIVED: "Job đã lưu trữ"
};

export const useFilterOptions = (enabled = true) => {
  const members = useProductionMembers(enabled);
  const teams = useTeams(enabled);
  const projects = useProductionProjects(enabled);
  const clients = useClients(enabled);
  const processes = useProcesses(enabled);
  const shifts = useShifts(enabled);
  const workflow = useWorkflow(enabled);
  const tags = useTags(enabled);

  const isPending =
    enabled &&
    [members, teams, projects, clients, processes, shifts, workflow, tags].some(
      (query) => query.isPending
    );
  const options = useMemo(() => {
    const teamNames = new Map((teams.data?.items ?? []).map((team) => [team.id, team.name]));
    const options: Record<FilterKey, FilterOption[]> = {
      user: (members.data?.items ?? [])
        .filter((member) => member.roles.length > 0 || !member.active)
        .map((member) =>
          option(member.userId, member.displayName, {
            hint: member.teamId ? teamNames.get(member.teamId) : member.email,
            archived: !member.active
          })
        )
        .sort((a, b) => byActive(a, b) || a.label.localeCompare(b.label, "vi")),
      team: (teams.data?.items ?? [])
        .map((team) => option(team.id, team.name, { archived: !team.active }))
        .sort(byActive),
      project: (projects.data?.items ?? [])
        .map((project) =>
          option(project.id, project.code, {
            hint: [project.name, project.clientName].filter(Boolean).join(" · "),
            archived: !project.active
          })
        )
        .sort((a, b) => byActive(a, b) || a.label.localeCompare(b.label, "vi")),
      client: (clients.data?.items ?? [])
        .map((client) => option(client.id, client.name, { archived: !client.active }))
        .sort(byActive),
      process: (processes.data?.items ?? [])
        .map((process) =>
          option(process.id, process.name, {
            hint: process.isQc ? "QC" : undefined,
            archived: !process.active
          })
        )
        .sort(byActive),
      shift: (shifts.data?.items ?? [])
        .map((shift) =>
          option(shift.id, shift.name, {
            hint: shift.payMode === "POINTS" ? "Tính điểm" : "Khoán",
            archived: !shift.active
          })
        )
        .sort(byActive),
      status: (workflow.data?.statuses ?? [])
        .map((status) =>
          option(status.id, status.name, { color: status.color, archived: !status.active })
        )
        .sort(byActive),
      tag: (tags.data?.items ?? [])
        .map((tag) => option(tag.id, tag.name, { color: tag.color, archived: !tag.active }))
        .sort(byActive),
      taskKind: (Object.keys(taskKindLabels) as (keyof typeof taskKindLabels)[]).map((kind) =>
        option(kind, taskKindLabels[kind])
      ),
      scoreRole: (["WORKER", "QC"] as const).map((role) => option(role, scoreRoleLabels[role])),
      taskState: (["OPEN", "DONE"] as const).map((state) => option(state, taskStateLabels[state])),
      jobState: (["ACTIVE", "ARCHIVED"] as const).map((state) =>
        option(state, jobStateLabels[state])
      )
    };
    return options;
  }, [
    members.data,
    teams.data,
    projects.data,
    clients.data,
    processes.data,
    shifts.data,
    workflow.data,
    tags.data
  ]);
  return { options, isPending };
};

/** Selected values of a filter as a list of ids / codes. */
export const filterValues = (filters: ReportFilters, key: FilterKey): string[] => {
  const value = filters[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? [...value] : [value];
};
