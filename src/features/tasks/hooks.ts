import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { qk, type DirectoryParams, type TaskQueryParams } from "@/lib/query-keys";

import { tasksApi } from "./api";

/**
 * Read hooks for the work views. Mutations (create / update / move with optimistic cache patches)
 * belong to the task views and detail panel; invalidate with the keys in `qk` after they settle.
 * Realtime `task:changed` / `task:timeline` events already invalidate these keys (lib/realtime/socket.ts).
 */

/** Cursor-paged task list for a project (pass `listId` in the query for one list). */
export const useTaskPages = (projectId: string, query: TaskQueryParams, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.tasks(projectId, query),
    queryFn: ({ pageParam, signal }) => tasksApi.list(projectId, query, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasMore ? (lastPage.pageInfo.nextCursor ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    enabled
  });

export const useTask = (taskId: string | null) =>
  useQuery({
    queryKey: qk.task(taskId ?? ""),
    queryFn: ({ signal }) => tasksApi.get(taskId ?? "", signal),
    enabled: Boolean(taskId)
  });

/** Unified comments + activity, newest first; page towards older items. */
export const useTaskTimeline = (taskId: string | null) =>
  useInfiniteQuery({
    queryKey: qk.timeline(taskId ?? ""),
    queryFn: ({ pageParam, signal }) => tasksApi.timeline(taskId ?? "", pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasMore ? (lastPage.pageInfo.nextCursor ?? undefined) : undefined,
    enabled: Boolean(taskId)
  });

export const useWorkflow = (projectId: string, listId?: string | null) =>
  useQuery({
    queryKey: qk.statuses(projectId, listId),
    queryFn: ({ signal }) => tasksApi.workflow(projectId, listId, signal),
    staleTime: 5 * 60_000
  });

/** People picker (debounce `q` in the caller). */
export const useDirectory = (params: DirectoryParams, enabled = true) =>
  useQuery({
    queryKey: qk.directory(params),
    queryFn: ({ signal }) => tasksApi.directory(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled
  });
