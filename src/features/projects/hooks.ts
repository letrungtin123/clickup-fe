import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import type { List, Project, ProjectAccessLevel, UpdateProjectRequest } from "@/contracts/work";
import { P, accessAtLeast } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks";
import { moveItem, placementFor } from "@/lib/ordering";
import { qk } from "@/lib/query-keys";

import {
  projectsApi,
  type CreateListInput,
  type CreateProjectInput,
  type UpdateListInput
} from "./api";

type ProjectCollection = { items: Project[] };

// --- Queries ------------------------------------------------------------------------------------------

export const projectsQueryOptions = {
  queryKey: qk.projects(),
  queryFn: ({ signal }: { signal: AbortSignal }) => projectsApi.list(signal)
};

/** Sidebar collection: every visible project with its lists, ordered by rank. */
export const useProjects = () => useQuery(projectsQueryOptions);

const findInCollection = (client: QueryClient, projectId: string) =>
  client
    .getQueryData<ProjectCollection>(qk.projects())
    ?.items.find((project) => project.id === projectId);

/** One project. Seeded from the sidebar collection so navigation renders instantly. */
export const useProject = (projectId: string | undefined) => {
  const client = useQueryClient();
  return useQuery({
    queryKey: qk.project(projectId ?? ""),
    queryFn: ({ signal }) => projectsApi.get(projectId ?? "", signal),
    enabled: Boolean(projectId),
    initialData: () => (projectId ? findInCollection(client, projectId) : undefined),
    initialDataUpdatedAt: () => client.getQueryState(qk.projects())?.dataUpdatedAt
  });
};

export const useProjectMembers = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: qk.projectMembers(projectId),
    queryFn: ({ signal }) => projectsApi.members(projectId, signal),
    enabled
  });

/** UX gates for one project (backend re-checks RBAC + project membership). */
export const useProjectAbilities = (project: Pick<Project, "myAccess"> | undefined) => {
  const { can } = usePermissions();
  return useMemo(() => {
    const manage = accessAtLeast(project?.myAccess, "manage");
    return {
      canUpdate: manage && can(P.ProjectUpdate),
      canArchive: manage && can(P.ProjectDelete),
      canManageMembers: manage && can(P.ProjectManageMembers),
      canCreateList: manage && can(P.ListCreate),
      canUpdateList: manage && can(P.ListUpdate),
      canArchiveList: manage && can(P.ListDelete)
    };
  }, [can, project?.myAccess]);
};

// --- Cache helpers ------------------------------------------------------------------------------------

const patchProject = (
  client: QueryClient,
  projectId: string,
  patch: (project: Project) => Project
) => {
  client.setQueryData<ProjectCollection>(qk.projects(), (current) =>
    current
      ? {
          items: current.items.map((project) =>
            project.id === projectId ? patch(project) : project
          )
        }
      : current
  );
  client.setQueryData<Project>(qk.project(projectId), (current) =>
    current ? patch(current) : current
  );
};

const upsertProject = (client: QueryClient, next: Project) => {
  client.setQueryData<ProjectCollection>(qk.projects(), (current) => {
    if (!current) return current;
    const exists = current.items.some((project) => project.id === next.id);
    return {
      items: exists
        ? current.items.map((project) => (project.id === next.id ? next : project))
        : [...current.items, next]
    };
  });
  client.setQueryData(qk.project(next.id), next);
};

const removeProject = (client: QueryClient, projectId: string) => {
  client.setQueryData<ProjectCollection>(qk.projects(), (current) =>
    current ? { items: current.items.filter((project) => project.id !== projectId) } : current
  );
  client.removeQueries({ queryKey: qk.project(projectId) });
};

// --- Project mutations --------------------------------------------------------------------------------

export const useCreateProject = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => projectsApi.create(input),
    meta: { errorMessage: false },
    onSuccess: (project) => {
      upsertProject(client, project);
      void client.invalidateQueries({ queryKey: qk.projects(), exact: true });
    }
  });
};

export const useUpdateProject = (projectId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectRequest) => projectsApi.update(projectId, input),
    onSuccess: (project) => upsertProject(client, project)
  });
};

export const useArchiveProject = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => projectsApi.archive(projectId),
    meta: { successMessage: "Đã lưu trữ dự án" },
    onSuccess: (_result, projectId) => removeProject(client, projectId)
  });
};

/** Optimistic drag-reorder of projects; rolls back and refetches on failure. */
export const useReorderProjects = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ordered }: { projectId: string; ordered: Project[] }) => {
      const placement = placementFor(ordered, projectId);
      if (!placement) return null;
      return projectsApi.update(projectId, { placement });
    },
    onMutate: async ({ ordered }) => {
      await client.cancelQueries({ queryKey: qk.projects(), exact: true });
      const previous = client.getQueryData<ProjectCollection>(qk.projects());
      client.setQueryData<ProjectCollection>(qk.projects(), { items: ordered });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(qk.projects(), context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.projects(), exact: true })
  });
};

// --- List mutations -----------------------------------------------------------------------------------

export const useCreateList = (projectId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateListInput) => projectsApi.createList(projectId, input),
    meta: { errorMessage: false },
    onSuccess: (list) => {
      patchProject(client, projectId, (project) => ({
        ...project,
        lists: [...project.lists, list]
      }));
      void client.invalidateQueries({ queryKey: qk.projects(), exact: true });
    }
  });
};

export const useUpdateList = (projectId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, input }: { listId: string; input: UpdateListInput }) =>
      projectsApi.updateList(projectId, listId, input),
    onSuccess: (list) =>
      patchProject(client, projectId, (project) => ({
        ...project,
        lists: project.lists.map((item) => (item.id === list.id ? list : item))
      }))
  });
};

export const useArchiveList = (projectId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) => projectsApi.archiveList(projectId, listId),
    meta: { successMessage: "Đã lưu trữ danh sách" },
    onSuccess: (_result, listId) =>
      patchProject(client, projectId, (project) => ({
        ...project,
        lists: project.lists.filter((item) => item.id !== listId)
      }))
  });
};

export const useReorderLists = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      listId,
      ordered
    }: {
      projectId: string;
      listId: string;
      ordered: List[];
    }) => {
      const placement = placementFor(ordered, listId);
      if (!placement) return null;
      return projectsApi.updateList(projectId, listId, { placement });
    },
    onMutate: async ({ projectId, ordered }) => {
      await client.cancelQueries({ queryKey: qk.projects(), exact: true });
      const previous = client.getQueryData<ProjectCollection>(qk.projects());
      patchProject(client, projectId, (project) => ({ ...project, lists: ordered }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(qk.projects(), context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.projects(), exact: true })
  });
};

/** Keyboard alternative to drag: move one step up/down. */
export const reorderByStep = <T extends { id: string }>(
  items: readonly T[],
  id: string,
  step: -1 | 1
) => {
  const from = items.findIndex((item) => item.id === id);
  const to = from + step;
  if (from === -1 || to < 0 || to >= items.length) return null;
  return moveItem(items, from, to);
};

// --- Members ------------------------------------------------------------------------------------------

export const useProjectMemberMutations = (projectId: string) => {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: qk.projectMembers(projectId) }),
      client.invalidateQueries({ queryKey: qk.projects(), exact: true })
    ]);

  const add = useMutation({
    mutationFn: (input: { userId: string; accessLevel: ProjectAccessLevel }) =>
      projectsApi.addMember(projectId, input),
    meta: { successMessage: "Đã thêm thành viên" },
    onSuccess: refresh
  });
  const update = useMutation({
    mutationFn: ({ userId, accessLevel }: { userId: string; accessLevel: ProjectAccessLevel }) =>
      projectsApi.updateMember(projectId, userId, accessLevel),
    onSuccess: refresh
  });
  const remove = useMutation({
    mutationFn: (userId: string) => projectsApi.removeMember(projectId, userId),
    meta: { successMessage: "Đã gỡ thành viên khỏi dự án" },
    onSuccess: refresh
  });
  return { add, update, remove };
};
