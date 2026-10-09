import type { z } from "zod";

import type {
  CreateListRequestSchema,
  CreateProjectRequestSchema,
  UpdateListRequestSchema
} from "@/contracts/work";
import {
  ListSchema,
  ProjectCollectionSchema,
  ProjectMemberCollectionSchema,
  ProjectMemberSchema,
  ProjectSchema,
  type ProjectAccessLevel,
  type UpdateProjectRequest
} from "@/contracts/work";
import { api, apiPath } from "@/lib/api/client";
import { OkResponseSchema } from "@/lib/api/schemas";

export type CreateProjectInput = z.input<typeof CreateProjectRequestSchema>;
export type CreateListInput = z.input<typeof CreateListRequestSchema>;
export type UpdateListInput = z.input<typeof UpdateListRequestSchema>;

export const projectsApi = {
  list: (signal?: AbortSignal) => api.get("/projects", ProjectCollectionSchema, { signal }),
  get: (projectId: string, signal?: AbortSignal) =>
    api.get(apiPath`/projects/${projectId}`, ProjectSchema, { signal }),
  create: (input: CreateProjectInput) => api.post("/projects", ProjectSchema, input),
  /** Also used for reordering: `{ placement: { afterId, beforeId } }`. */
  update: (projectId: string, input: UpdateProjectRequest) =>
    api.patch(apiPath`/projects/${projectId}`, ProjectSchema, input),
  archive: (projectId: string) => api.delete(apiPath`/projects/${projectId}`, OkResponseSchema),

  members: (projectId: string, signal?: AbortSignal) =>
    api.get(apiPath`/projects/${projectId}/members`, ProjectMemberCollectionSchema, { signal }),
  addMember: (projectId: string, input: { userId: string; accessLevel: ProjectAccessLevel }) =>
    api.post(apiPath`/projects/${projectId}/members`, ProjectMemberSchema, input),
  updateMember: (projectId: string, userId: string, accessLevel: ProjectAccessLevel) =>
    api.patch(apiPath`/projects/${projectId}/members/${userId}`, ProjectMemberSchema, {
      accessLevel
    }),
  removeMember: (projectId: string, userId: string) =>
    api.delete(apiPath`/projects/${projectId}/members/${userId}`, OkResponseSchema),

  createList: (projectId: string, input: CreateListInput) =>
    api.post(apiPath`/projects/${projectId}/lists`, ListSchema, input),
  /** Also used for reordering: `{ placement: { afterId, beforeId } }`. */
  updateList: (projectId: string, listId: string, input: UpdateListInput) =>
    api.patch(apiPath`/projects/${projectId}/lists/${listId}`, ListSchema, input),
  archiveList: (projectId: string, listId: string) =>
    api.delete(apiPath`/projects/${projectId}/lists/${listId}`, OkResponseSchema)
};
