import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import type { RichTextDoc } from "@/contracts/rich-text";
import type {
  Comment,
  MoveTaskRequest,
  Placement,
  TaskDetail,
  TaskPage,
  TaskSummary,
  TimelinePage,
  UpdateTaskRequest,
  UserRef
} from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";
import { qk, type DirectoryParams, type TaskQueryParams } from "@/lib/query-keys";

import { tasksApi, type CreateTaskInput, type MyTasksParams, type ReplaceWorkflowInput } from "./api";
import {
  cancelTaskQueries,
  reconcileTask,
  removeTaskEverywhere,
  restoreTaskCaches,
  snapshotTaskCaches,
  type TaskCacheSnapshot
} from "./cache";
import { rankPeople } from "./people";
import { toastTaskError } from "./errors";

/**
 * Data hooks for the task views and detail panel. Reads use the shared query keys (`qk`); writes
 * patch the cache optimistically through cache.ts and roll back on failure. Realtime events
 * (lib/realtime/socket.ts) invalidate the same keys afterwards, so other users' edits show up and
 * our optimistic state is reconciled with the server.
 */

export const taskKeys = {
  children: (projectId: string, query: TaskQueryParams) => [...qk.tasks(projectId, query), "children"] as const,
  replies: (taskId: string, commentId: string) => [...qk.timeline(taskId), "replies", commentId] as const,
  trash: (projectId?: string) => ["trash", projectId ?? "all"] as const,
  attachmentUrl: (attachmentId: string) => ["attachment-url", attachmentId] as const
};

const nextCursor = (page: { pageInfo: { hasMore: boolean; nextCursor: string | null } }) =>
  page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;

// --- Reads ---------------------------------------------------------------------------------------

/** Cursor-paged task list for a project (pass `listId` in the query for one list). */
export const useTaskPages = (projectId: string, query: TaskQueryParams, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.tasks(projectId, query),
    queryFn: ({ pageParam, signal }) => tasksApi.list(projectId, query, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    placeholderData: keepPreviousData,
    enabled
  });

/** Direct children of several expanded parents (first 100 each; "more" opens the parent). */
export const useChildTasks = (projectId: string, base: TaskQueryParams, parentIds: readonly string[]) =>
  useQueries({
    queries: parentIds.map((parentId) => {
      const query: TaskQueryParams = { ...base, parent: parentId, statusIds: undefined, limit: 100 };
      return {
        queryKey: taskKeys.children(projectId, query),
        queryFn: ({ signal }: { signal: AbortSignal }) => tasksApi.list(projectId, query, undefined, signal),
        staleTime: 30_000
      };
    }),
    combine: (results) => {
      const map = new Map<string, { data: TaskPage | undefined; isPending: boolean; isError: boolean; refetch: () => void }>();
      results.forEach((result, index) => {
        const id = parentIds[index];
        if (id) {
          map.set(id, {
            data: result.data,
            isPending: result.isPending,
            isError: result.isError,
            refetch: () => void result.refetch()
          });
        }
      });
      return map;
    }
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
    getNextPageParam: nextCursor,
    enabled: Boolean(taskId)
  });

export const useReplies = (taskId: string, commentId: string, enabled: boolean) =>
  useQuery({
    queryKey: taskKeys.replies(taskId, commentId),
    queryFn: ({ signal }) => tasksApi.replies(taskId, commentId, signal),
    enabled
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
    queryFn: ({ signal }) => tasksApi.directory({ ...params, limit: 50 }, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled
  });

/** Async people search for @mentions / pickers, deduplicated through the query cache. */
export const useMentionSource = (projectId: string | undefined) => {
  const client = useQueryClient();
  return useCallback(
    async (q: string) => {
      const params: DirectoryParams = { q, projectId };
      const result = await client.fetchQuery({
        queryKey: qk.directory(params),
        queryFn: ({ signal }) => tasksApi.directory({ ...params, limit: 50 }, signal),
        staleTime: 60_000
      });
      return rankPeople(result.items, q);
    },
    [client, projectId]
  );
};

/** Display names for user ids seen anywhere in the cache (directory results, assignees, authors). */
export const useUserNames = (projectId: string | undefined, extra: readonly UserRef[] = []) => {
  const client = useQueryClient();
  const directory = useDirectory({ projectId }, Boolean(projectId));
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const [, data] of client.getQueriesData<{ items: UserRef[] }>({ queryKey: ["directory"] })) {
      data?.items.forEach((user) => names.set(user.id, user.displayName));
    }
    directory.data?.items.forEach((user) => names.set(user.id, user.displayName));
    extra.forEach((user) => names.set(user.id, user.displayName));
    return (id: string) => names.get(id);
  }, [client, directory.data, extra]);
};

export const useMyTasks = (params: MyTasksParams) =>
  useInfiniteQuery({
    queryKey: qk.myTasks({
      due: params.due,
      dueFrom: params.dueFrom,
      dueTo: params.dueTo,
      includeDone: params.includeDone,
      sort: params.sort,
      limit: params.limit
    }),
    queryFn: ({ pageParam, signal }) => tasksApi.mine(params, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    placeholderData: keepPreviousData
  });

export const useTrash = (projectId?: string) =>
  useInfiniteQuery({
    queryKey: taskKeys.trash(projectId),
    queryFn: ({ pageParam, signal }) => tasksApi.trash({ projectId }, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor
  });

// --- Task mutations ------------------------------------------------------------------------------

const useSelfId = () => useSessionContext().user.id;

type UpdateVariables = {
  task: TaskSummary;
  patch: UpdateTaskRequest;
  /** Fields to show immediately (status ref, assignee refs…); defaults to the scalar patch fields. */
  optimistic?: Partial<TaskSummary> | undefined;
};

const optimisticFromPatch = (task: TaskSummary, patch: UpdateTaskRequest): Partial<TaskSummary> => {
  const next: Partial<TaskSummary> = {};
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.startAt !== undefined) next.startAt = patch.startAt;
  if (patch.dueAt !== undefined) next.dueAt = patch.dueAt;
  if (patch.assignees) {
    const removed = new Set(patch.assignees.remove);
    next.assignees = task.assignees.filter((user) => !removed.has(user.id));
  }
  return next;
};

/** PATCH /tasks/:id with optimistic placement in every view. */
export const useUpdateTask = () => {
  const client = useQueryClient();
  const selfId = useSelfId();
  return useMutation({
    mutationFn: ({ task, patch }: UpdateVariables) => tasksApi.update(task.id, patch),
    meta: { errorMessage: false },
    onMutate: async ({ task, patch, optimistic }) => {
      await cancelTaskQueries(client, task.projectId);
      const snapshot = snapshotTaskCaches(client, task.projectId);
      const next: TaskSummary = {
        ...task,
        ...optimisticFromPatch(task, patch),
        ...optimistic,
        updatedAt: new Date().toISOString()
      };
      if (next.status.category !== "active" && task.status.category === "active") {
        next.completedAt = new Date().toISOString();
      } else if (next.status.category === "active") {
        next.completedAt = null;
      }
      reconcileTask(client, next, { selfId });
      return { snapshot };
    },
    onError: (error, _variables, context) => {
      if (context?.snapshot) restoreTaskCaches(client, context.snapshot);
      toastTaskError(error, "Không lưu được thay đổi.");
    },
    onSuccess: (detail) => {
      client.setQueryData<TaskDetail>(qk.task(detail.id), detail);
      reconcileTask(client, detail, { selfId });
    }
  });
};

type MoveVariables = {
  task: TaskSummary;
  input: MoveTaskRequest;
  /** Shown immediately (e.g. the target status). */
  optimistic?: Partial<TaskSummary> | undefined;
  /** The query (group / column) the item was dropped into, with its neighbour placement. */
  anchor?: { queryKey: QueryKey; placement: Placement } | undefined;
};

/** POST /tasks/:id/move (drag & drop): optimistic, rolls back on failure. */
export const useMoveTask = () => {
  const client = useQueryClient();
  const selfId = useSelfId();
  return useMutation({
    mutationFn: ({ task, input }: MoveVariables) => tasksApi.move(task.id, input),
    meta: { errorMessage: false },
    onMutate: async ({ task, optimistic, anchor }) => {
      await cancelTaskQueries(client, task.projectId);
      const snapshot = snapshotTaskCaches(client, task.projectId);
      const next: TaskSummary = { ...task, ...optimistic, updatedAt: new Date().toISOString() };
      reconcileTask(client, next, { selfId, insert: false, anchor });
      return { snapshot };
    },
    onError: (error, _variables, context) => {
      if (context?.snapshot) restoreTaskCaches(client, context.snapshot);
      toastTaskError(error, "Không di chuyển được công việc. Đã hoàn tác.");
    },
    onSuccess: (summary) => {
      reconcileTask(client, summary, { selfId, keepPosition: false });
      void client.invalidateQueries({ queryKey: qk.task(summary.id), exact: true });
    }
  });
};

type CreateVariables = {
  projectId: string;
  input: CreateTaskInput;
  /** Where the new row should appear immediately (quick add inside a group / column). */
  anchor?: { queryKey: QueryKey; placement: Placement | null } | undefined;
};

export const useCreateTask = () => {
  const client = useQueryClient();
  const selfId = useSelfId();
  return useMutation({
    mutationFn: ({ projectId, input }: CreateVariables) => tasksApi.create(projectId, input),
    meta: { errorMessage: false },
    onError: (error) => toastTaskError(error, "Không tạo được công việc."),
    onSuccess: (summary, { anchor }) => {
      reconcileTask(client, summary, { selfId, anchor });
    }
  });
};

/** Soft delete with an undo toast (restore from trash). */
export const useDeleteTask = () => {
  const client = useQueryClient();
  const restore = useRestoreTask();
  return useMutation({
    mutationFn: (task: TaskSummary) => tasksApi.remove(task.id),
    onMutate: async (task) => {
      await cancelTaskQueries(client, task.projectId);
      const snapshot: TaskCacheSnapshot = snapshotTaskCaches(client, task.projectId);
      removeTaskEverywhere(client, task.projectId, task.id);
      return { snapshot };
    },
    onError: (_error, _task, context) => {
      if (context?.snapshot) restoreTaskCaches(client, context.snapshot);
    },
    onSuccess: (_result, task) => {
      void client.invalidateQueries({ queryKey: ["trash"] });
      toast.success(`Đã chuyển ${task.key} vào thùng rác`, {
        action: { label: "Hoàn tác", onClick: () => restore.mutate(task) },
        duration: 8000
      });
    }
  });
};

export const useRestoreTask = () => {
  const client = useQueryClient();
  const selfId = useSelfId();
  return useMutation({
    mutationFn: (task: Pick<TaskSummary, "id" | "projectId">) => tasksApi.restore(task.id),
    onSuccess: (summary) => {
      reconcileTask(client, summary, { selfId });
      void client.invalidateQueries({ queryKey: qk.tasks(summary.projectId) });
      void client.invalidateQueries({ queryKey: qk.task(summary.id) });
      void client.invalidateQueries({ queryKey: ["trash"] });
      if (summary.parentTaskId) void client.invalidateQueries({ queryKey: qk.task(summary.parentTaskId), exact: true });
      toast.success(`Đã khôi phục ${summary.key}`);
    }
  });
};

export const usePurgeTask = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => tasksApi.purge(taskId),
    meta: { successMessage: "Đã xóa vĩnh viễn công việc" },
    onSuccess: () => client.invalidateQueries({ queryKey: ["trash"] })
  });
};

// --- Comments ------------------------------------------------------------------------------------

type TimelineData = InfiniteData<TimelinePage, string | undefined>;

const patchTimeline = (
  client: QueryClient,
  taskId: string,
  fn: (items: TimelinePage["items"]) => TimelinePage["items"]
) =>
  client.setQueryData<TimelineData>(qk.timeline(taskId), (data) =>
    data ? { ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) } : data
  );

const patchComment = (items: TimelinePage["items"], commentId: string, fn: (comment: Comment) => Comment) =>
  items.map((item) => (item.kind === "comment" && item.comment.id === commentId ? { ...item, comment: fn(item.comment) } : item));

export const useCreateComment = (taskId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: RichTextDoc; parentCommentId?: string | null; attachmentIds?: string[] }) =>
      tasksApi.createComment(taskId, input),
    meta: { errorMessage: false },
    onError: (error) => toastTaskError(error, "Không gửi được bình luận."),
    onSuccess: (comment) => {
      if (comment.parentCommentId) {
        const parentId = comment.parentCommentId;
        client.setQueryData<{ items: Comment[]; pageInfo: TaskPage["pageInfo"] }>(
          taskKeys.replies(taskId, parentId),
          (data) => (data ? { ...data, items: [...data.items.filter((item) => item.id !== comment.id), comment] } : data)
        );
        patchTimeline(client, taskId, (items) =>
          patchComment(items, parentId, (parent) => ({ ...parent, replyCount: parent.replyCount + 1 }))
        );
        return;
      }
      client.setQueryData<TimelineData>(qk.timeline(taskId), (data) => {
        if (!data || data.pages.length === 0) return data;
        const [first, ...rest] = data.pages;
        if (!first) return data;
        const exists = first.items.some((item) => item.kind === "comment" && item.comment.id === comment.id);
        return exists ? data : { ...data, pages: [{ ...first, items: [{ kind: "comment", comment }, ...first.items] }, ...rest] };
      });
    }
  });
};

export const useUpdateComment = (taskId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: RichTextDoc }) =>
      tasksApi.updateComment(taskId, commentId, body),
    meta: { errorMessage: false },
    onError: (error) => toastTaskError(error, "Không lưu được bình luận."),
    onSuccess: (comment) => {
      patchTimeline(client, taskId, (items) => patchComment(items, comment.id, () => comment));
      if (comment.parentCommentId) {
        client.setQueryData<{ items: Comment[] }>(taskKeys.replies(taskId, comment.parentCommentId), (data) =>
          data ? { ...data, items: data.items.map((item) => (item.id === comment.id ? comment : item)) } : data
        );
      }
    }
  });
};

export const useDeleteComment = (taskId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (comment: Comment) => tasksApi.deleteComment(taskId, comment.id),
    meta: { successMessage: "Đã xóa bình luận" },
    onSuccess: (_result, comment) => {
      if (comment.parentCommentId) {
        const parentId = comment.parentCommentId;
        client.setQueryData<{ items: Comment[] }>(taskKeys.replies(taskId, parentId), (data) =>
          data ? { ...data, items: data.items.filter((item) => item.id !== comment.id) } : data
        );
        patchTimeline(client, taskId, (items) =>
          patchComment(items, parentId, (parent) => ({ ...parent, replyCount: Math.max(0, parent.replyCount - 1) }))
        );
        return;
      }
      patchTimeline(client, taskId, (items) =>
        items.filter((item) => !(item.kind === "comment" && item.comment.id === comment.id))
      );
    }
  });
};

// --- Workflow ------------------------------------------------------------------------------------

export const useReplaceWorkflow = (projectId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReplaceWorkflowInput) => tasksApi.replaceWorkflow(projectId, input),
    meta: { errorMessage: false },
    onSuccess: (workflow, input) => {
      client.setQueryData(qk.statuses(projectId, input.listId ?? null), workflow);
      void client.invalidateQueries({ queryKey: ["project", projectId, "statuses"] });
      void client.invalidateQueries({ queryKey: qk.tasks(projectId) });
      void client.invalidateQueries({ queryKey: qk.project(projectId), exact: true });
      void client.invalidateQueries({ queryKey: qk.projects(), exact: true });
    }
  });
};

