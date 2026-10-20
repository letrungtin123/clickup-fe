import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient
} from "@tanstack/react-query";

import type {
  JobDetail,
  JobPage,
  ProductionStatusRef,
  ProductionTask,
  ProductionTaskPage
} from "@/contracts/production-jobs";
import { useSessionContext } from "@/features/auth/hooks";
import type { QueryValue } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";

import {
  jobsApi,
  type AssignInput,
  type CreateJobInput,
  type CreateSubtaskInput,
  type DecideQtyRequestInput,
  type JobListQuery,
  type JobOptionsInput,
  type MyTasksRole,
  type QtyInput,
  type QtyRequestInput,
  type TaskLineInput,
  type TimelineEntity,
  type TransitionInput,
  type UpdateJobInput,
  type UpdateTaskInput,
  type WorkEntryInput
} from "./jobs-api";
import { productionKeys } from "./keys";
import {
  patchJobInPages,
  patchQcQueue,
  replaceTaskInPages,
  requestScoresRefresh
} from "./live-sync";

/**
 * Data hooks for production jobs and tasks. Every write answers with fresh server state (the task or
 * the job with its capabilities); we store it where it is cached (task, job, my tasks, QC queue, job
 * list rows) and only refetch what derives from it server-side (job status/progress, timelines),
 * and only while on screen. Realtime `production:changed` hints for other people's changes are
 * handled by production-runtime.tsx / live-sync.ts (PERF-01).
 */

const nextCursor = (page: { pageInfo: { hasMore: boolean; nextCursor: string | null } }) =>
  page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;

const noFilters: Record<string, QueryValue> = {};

// --- Reads ---------------------------------------------------------------------------------------------

export const useJobs = (query: JobListQuery, enabled = true) =>
  useInfiniteQuery({
    queryKey: productionKeys.jobs(query),
    queryFn: ({ pageParam, signal }) => jobsApi.list(query, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    placeholderData: keepPreviousData,
    enabled
  });

/**
 * PD-067 counts of the job List view: jobs per month of "Ngày nhận" (group headers) and per project (sidebar), same
 * filters as the list. The previous answer stays while the next filters load.
 */
export const useJobFacets = (query: JobListQuery, enabled = true) =>
  useQuery({
    queryKey: productionKeys.jobFacets(query),
    queryFn: ({ signal }) => jobsApi.facets(query, signal),
    placeholderData: keepPreviousData,
    enabled
  });

/**
 * The details of the jobs expanded in the List view (PD-067: a job row unfolds into its tasks): the job page's own query
 * (same key, so the page, task moves and realtime updates share it), fetched when expanded and cached.
 */
export const useJobDetails = (jobIds: readonly string[]) =>
  useQueries({
    queries: jobIds.map((jobId) => ({
      queryKey: productionKeys.job(jobId),
      queryFn: ({ signal }: { signal: AbortSignal }) => jobsApi.get(jobId, signal)
    }))
  });

/**
 * "Gói công việc" picker of "Nhập công việc" (PD-038): the project's jobs (closed ones too) filtered on the server by
 * text and statuses; the previous answer stays while the next search loads.
 */
export const useJobOptions = (query: JobOptionsInput | null, enabled = true) =>
  useQuery({
    queryKey: productionKeys.jobOptions({
      projectId: query?.projectId ?? null,
      q: query?.q?.trim() ?? "",
      statusIds: [...(query?.statusIds ?? [])].sort(),
      limit: query?.limit ?? 50
    }),
    queryFn: ({ signal }) => jobsApi.jobOptions(query!, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled: enabled && Boolean(query?.projectId)
  });

export const useJob = (jobId: string | undefined) =>
  useQuery({
    queryKey: productionKeys.job(jobId ?? ""),
    queryFn: ({ signal }) => jobsApi.get(jobId ?? "", signal),
    enabled: Boolean(jobId)
  });

/** The job detail if it is already cached (e.g. the task was opened from its job); never fetches. */
export const useCachedJob = (jobId: string | null | undefined) =>
  useQuery({
    queryKey: productionKeys.job(jobId ?? ""),
    queryFn: ({ signal }) => jobsApi.get(jobId ?? "", signal),
    enabled: false
  }).data;

export const useProductionTask = (taskId: string | null | undefined) =>
  useQuery({
    queryKey: productionKeys.task(taskId ?? ""),
    queryFn: ({ signal }) => jobsApi.task(taskId ?? "", signal),
    enabled: Boolean(taskId)
  });

export const useTaskScores = (taskId: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: productionKeys.taskScores(taskId ?? ""),
    queryFn: ({ signal }) => jobsApi.taskScores(taskId ?? "", signal),
    enabled: Boolean(taskId) && enabled
  });

/** My tasks in pages of MY_TASKS_PAGE (deadline order); `fetchNextPage` loads more (BUG-PR-18). */
export const useMyTasks = (
  role: MyTasksRole,
  includeFinished: boolean,
  enabled = true,
  /** TASK tag / custom-field query (list-filters.ts `listFiltersToQuery`). */
  filters: Record<string, QueryValue> = noFilters
) =>
  useInfiniteQuery({
    queryKey: productionKeys.myTasks(role, includeFinished, filters),
    queryFn: ({ pageParam, signal }) =>
      jobsApi.myTasks(role, includeFinished, pageParam, signal, filters),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    placeholderData: keepPreviousData,
    enabled
  });

export const useQcQueue = (enabled = true, filters: Record<string, QueryValue> = noFilters) =>
  useQuery({
    queryKey: productionKeys.qcQueue(filters),
    queryFn: ({ signal }) => jobsApi.qcQueue(signal, filters),
    placeholderData: keepPreviousData,
    enabled
  });

export const useProductionTimeline = (entity: TimelineEntity, id: string) =>
  useInfiniteQuery({
    queryKey: productionKeys.timeline(entity, id),
    queryFn: ({ pageParam, signal }) => jobsApi.timeline(entity, id, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: Boolean(id)
  });

// --- Cache helpers ---------------------------------------------------------------------------------------

/**
 * Views derived from a write on a job or several of its tasks (split, work entry, delete): refetched only while on
 * screen (TanStack's default), others are marked stale.
 */
export const invalidateProductionViews = (
  client: QueryClient,
  jobId?: string | null,
  taskIds: readonly string[] = []
) =>
  Promise.all([
    client.invalidateQueries({ queryKey: productionKeys.jobs() }),
    client.invalidateQueries({ queryKey: productionKeys.jobOptions() }),
    client.invalidateQueries({
      queryKey: jobId ? productionKeys.job(jobId) : productionKeys.jobAll()
    }),
    client.invalidateQueries({ queryKey: productionKeys.myTasks() }),
    client.invalidateQueries({ queryKey: productionKeys.qcQueue() }),
    client.invalidateQueries({
      queryKey: jobId ? productionKeys.timeline("jobs", jobId) : productionKeys.timeline()
    }),
    ...taskIds.flatMap((taskId) => [
      client.invalidateQueries({ queryKey: productionKeys.task(taskId) }),
      client.invalidateQueries({ queryKey: productionKeys.timeline("tasks", taskId) })
    ])
  ]);

/** Stores a job the API returned: its detail and its row in every cached job list. */
const storeJob = (client: QueryClient, job: JobDetail) => {
  client.setQueryData(productionKeys.job(job.id), job);
  client.setQueriesData<InfiniteData<JobPage>>({ queryKey: productionKeys.jobs() }, (data) =>
    patchJobInPages(data, job)
  );
};

/**
 * Stores a task the API returned everywhere it is cached (task, job, my tasks, QC queue) instead of
 * refetching the 200-row lists; those are only marked stale (filters such as "finished" re-apply on
 * the next visit). The job (status and progress are derived server-side) and the two timelines
 * refetch while on screen.
 */
export const applyTask = (
  client: QueryClient,
  task: ProductionTask,
  myId: string | null = null
) => {
  client.setQueryData(productionKeys.task(task.id), task);
  void client.invalidateQueries({ queryKey: productionKeys.taskScores(task.id) });
  client.setQueryData<JobDetail>(productionKeys.job(task.jobId), (job) =>
    job ? { ...job, tasks: job.tasks.map((item) => (item.id === task.id ? task : item)) } : job
  );
  void client.invalidateQueries({ queryKey: productionKeys.job(task.jobId), exact: true });
  client.setQueriesData<InfiniteData<ProductionTaskPage>>(
    { queryKey: productionKeys.myTasks() },
    (data) => replaceTaskInPages(data, task)
  );
  void client.invalidateQueries({ queryKey: productionKeys.myTasks(), refetchType: "none" });
  const plainQueue = productionKeys.qcQueue();
  for (const [key] of client.getQueriesData<ProductionTaskPage>({ queryKey: plainQueue })) {
    // Filtered queues (tag / custom fields) only replace or drop the row: the task may not match.
    const filtered = key.length > plainQueue.length;
    client.setQueryData<ProductionTaskPage>(key, (data) =>
      patchQcQueue(data, task, filtered ? null : myId)
    );
  }
  void client.invalidateQueries({ queryKey: productionKeys.qcQueue(), refetchType: "none" });
  void client.invalidateQueries({ queryKey: productionKeys.jobs() });
  void client.invalidateQueries({ queryKey: productionKeys.timeline("jobs", task.jobId) });
  void client.invalidateQueries({ queryKey: productionKeys.timeline("tasks", task.id) });
  // PD-044: a subtask's edit changes its line (quantity, `subtasks`, SUBTASK history row); a line's write moves,
  // re-assigns and re-dates its subtasks (their pages refetch while open, scores included).
  if (task.isSubtask && task.parentTaskId) {
    void client.invalidateQueries({ queryKey: productionKeys.task(task.parentTaskId), exact: true });
    void client.invalidateQueries({ queryKey: productionKeys.timeline("tasks", task.parentTaskId) });
  }
  for (const subtask of task.subtasks ?? []) {
    void client.invalidateQueries({ queryKey: productionKeys.task(subtask.id) });
  }
};

// --- Job writes ---------------------------------------------------------------------------------------

export const useCreateJob = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobInput) => jobsApi.create(input),
    meta: { errorMessage: false },
    onSuccess: (job) => {
      client.setQueryData(productionKeys.job(job.id), job);
      void client.invalidateQueries({ queryKey: productionKeys.jobs() });
      // A new job is offered by the "Nhập công việc" picker.
      void client.invalidateQueries({ queryKey: productionKeys.jobOptions() });
    }
  });
};

export const useUpdateJob = (jobId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateJobInput) => jobsApi.update(jobId, input),
    meta: { errorMessage: false },
    onSuccess: (job) => {
      storeJob(client, job);
      // Rows are patched; filtered lists (archived, deadline range) re-apply on the next visit.
      void client.invalidateQueries({ queryKey: productionKeys.jobs(), refetchType: "none" });
      void client.invalidateQueries({ queryKey: productionKeys.timeline("jobs", jobId) });
      // Archiving hides the job's tasks from my tasks, and the job from the "Nhập công việc" picker.
      void client.invalidateQueries({ queryKey: productionKeys.myTasks(), refetchType: "none" });
      void client.invalidateQueries({ queryKey: productionKeys.jobOptions() });
    }
  });
};

/**
 * The manual job status (PD-038 / PD-045, the job's only status): the answer is stored (detail + list rows); filtered
 * lists (by status), the job picker, the timeline (history row) and led jobs refresh. The line workflow is untouched,
 * so no task view changes. A refusal because lines are not checked yet (409 JOB_NOT_READY) means the cached job's
 * counts are stale: it refetches, so the menu shows the status blocked with the current count.
 */
export const useChangeJobStatus = (jobId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (statusId: string) => jobsApi.changeStatus(jobId, statusId),
    meta: { errorMessage: false },
    onSuccess: (job) => {
      storeJob(client, job);
      void client.invalidateQueries({ queryKey: productionKeys.jobs() });
      void client.invalidateQueries({ queryKey: productionKeys.jobOptions() });
      void client.invalidateQueries({ queryKey: productionKeys.timeline("jobs", jobId) });
      void client.invalidateQueries({ queryKey: ["production", "led-jobs"] });
    },
    onError: (error) => {
      if (isApiError(error) && error.code === "JOB_NOT_READY") {
        void client.invalidateQueries({ queryKey: productionKeys.job(jobId) });
      }
    }
  });
};

/** Deletes a job and its lines (PD-036); every derived view refreshes, scores too (reversals). */
export const useDeleteJob = (jobId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => jobsApi.remove(jobId),
    meta: { errorMessage: false },
    onSuccess: () => {
      client.removeQueries({ queryKey: productionKeys.job(jobId), exact: true });
      void invalidateProductionViews(client, null);
      requestScoresRefresh(client);
    }
  });
};

/** "Nhập công việc" (PD-035): one work-log row; the job list, my tasks and the job refresh. */
export const useCreateWorkEntry = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkEntryInput) => jobsApi.createWorkEntry(input),
    meta: { errorMessage: false },
    onSuccess: (result) => void invalidateProductionViews(client, result.jobId)
  });
};

export const useCreateTasks = (jobId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (tasks: TaskLineInput[]) => jobsApi.createTasks(jobId, tasks),
    meta: { errorMessage: false },
    onSuccess: () => void invalidateProductionViews(client, jobId)
  });
};

export const useOpenJobChat = () =>
  useMutation({
    mutationFn: (jobId: string) => jobsApi.chat(jobId),
    meta: { errorMessage: false }
  });

// --- Task writes ------------------------------------------------------------------------------------------

type TransitionVariables = {
  task: ProductionTask;
  input: TransitionInput;
  /** Shown immediately in "my tasks" (kanban drop); rolled back if the API refuses. */
  optimisticStatus?: ProductionStatusRef;
};

export const useTransitionTask = () => {
  const client = useQueryClient();
  const myId = useSessionContext().user.id;
  return useMutation({
    mutationFn: ({ task, input }: TransitionVariables) => jobsApi.transitionTask(task.id, input),
    meta: { errorMessage: false },
    onMutate: async ({ task, optimisticStatus }) => {
      if (!optimisticStatus) return { snapshot: [] as [readonly unknown[], unknown][] };
      await client.cancelQueries({ queryKey: productionKeys.myTasks() });
      const snapshot = client.getQueriesData<InfiniteData<ProductionTaskPage>>({
        queryKey: productionKeys.myTasks()
      });
      client.setQueriesData<InfiniteData<ProductionTaskPage>>(
        { queryKey: productionKeys.myTasks() },
        (data) =>
          replaceTaskInPages(data, {
            ...task,
            status: optimisticStatus,
            capabilities: { ...task.capabilities, transitions: [] }
          })
      );
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) client.setQueryData(key, data);
    },
    onSuccess: (task) => {
      applyTask(client, task, myId);
      // Done / Checked write score entries (BUG-PR-19).
      requestScoresRefresh(client);
    }
  });
};

export const useTaskMutations = () => {
  const client = useQueryClient();
  const myId = useSessionContext().user.id;
  const onSuccess = (task: ProductionTask) => applyTask(client, task, myId);
  return {
    update: useMutation({
      mutationFn: ({ taskId, input }: { taskId: string; input: UpdateTaskInput }) =>
        jobsApi.updateTask(taskId, input),
      meta: { errorMessage: false },
      onSuccess
    }),
    setQty: useMutation({
      mutationFn: ({ taskId, input }: { taskId: string; input: QtyInput }) =>
        jobsApi.setQty(taskId, input),
      meta: { errorMessage: false },
      onSuccess: (task: ProductionTask) => {
        onSuccess(task);
        // A corrected Done quantity adds adjustment score rows.
        requestScoresRefresh(client);
      }
    }),
    assign: useMutation({
      mutationFn: ({ taskId, input }: { taskId: string; input: AssignInput }) =>
        jobsApi.assign(taskId, input),
      meta: { errorMessage: false },
      onSuccess
    }),
    /** Deletes a line (PD-036): its job, lists and scores (reversal rows) refresh. */
    remove: useMutation({
      mutationFn: (taskId: string) => jobsApi.removeTask(taskId),
      meta: { errorMessage: false },
      onSuccess: (result) => {
        // A deleted subtask gives its quantity back to its line (PD-044): refresh the line too.
        const parentId = client.getQueryData<ProductionTask>(productionKeys.task(result.taskId))
          ?.parentTaskId;
        client.removeQueries({ queryKey: productionKeys.task(result.taskId), exact: true });
        void invalidateProductionViews(client, result.jobId, parentId ? [parentId] : []);
        requestScoresRefresh(client);
      }
    })
  };
};

/**
 * PD-044 subtasks of a line. Creating answers the line (with its `subtasks`); editing a subtask answers the subtask
 * (applyTask refreshes its line); deleting one refreshes its line (`lineId`), whose quantity grows back.
 */
export const useSubtaskMutations = () => {
  const client = useQueryClient();
  const myId = useSessionContext().user.id;
  const onSuccess = (task: ProductionTask) => applyTask(client, task, myId);
  return {
    create: useMutation({
      mutationFn: ({ taskId, input }: { taskId: string; input: CreateSubtaskInput }) =>
        jobsApi.createSubtask(taskId, input),
      meta: { errorMessage: false },
      onSuccess
    }),
    /** Công đoạn / Số tấm giao / Ghi chú / Hình lỗi of a subtask (before Done). */
    update: useMutation({
      mutationFn: ({ subtaskId, input }: { subtaskId: string; input: UpdateTaskInput }) =>
        jobsApi.updateTask(subtaskId, input),
      meta: { errorMessage: false },
      onSuccess
    }),
    // A subtask's Done quantity is corrected on its own page (useTaskMutations().setQty, PD-048).
    remove: useMutation({
      mutationFn: ({ subtaskId }: { subtaskId: string; lineId: string }) =>
        jobsApi.removeTask(subtaskId),
      meta: { errorMessage: false },
      onSuccess: (result, { lineId }) => {
        client.removeQueries({ queryKey: productionKeys.task(result.taskId), exact: true });
        void invalidateProductionViews(client, result.jobId, [lineId]);
        requestScoresRefresh(client);
      }
    })
  };
};

/**
 * PD-044 "Số lượng giao" requests: the worker asks (new total + reason), the Leader / "update: all" approves or
 * rejects, the worker may cancel. Each answers the line; it is stored where cached (task, job, my tasks).
 */
export const useQtyRequestMutations = () => {
  const client = useQueryClient();
  const myId = useSessionContext().user.id;
  const onSuccess = (task: ProductionTask) => applyTask(client, task, myId);
  return {
    request: useMutation({
      mutationFn: ({ taskId, input }: { taskId: string; input: QtyRequestInput }) =>
        jobsApi.requestQty(taskId, input),
      meta: { errorMessage: false },
      onSuccess
    }),
    decide: useMutation({
      mutationFn: ({ requestId, input }: { requestId: string; input: DecideQtyRequestInput }) =>
        jobsApi.decideQtyRequest(requestId, input),
      meta: { errorMessage: false },
      onSuccess
    }),
    cancel: useMutation({
      mutationFn: (requestId: string) => jobsApi.cancelQtyRequest(requestId),
      meta: { errorMessage: false },
      onSuccess
    })
  };
};

// --- Comments ----------------------------------------------------------------------------------------------

export const useCommentMutations = () => {
  const client = useQueryClient();
  return {
    add: useMutation({
      mutationFn: ({
        entity,
        id,
        body,
        mentionedUserIds
      }: {
        entity: TimelineEntity;
        id: string;
        body: string;
        mentionedUserIds: string[];
      }) => jobsApi.comment(entity, id, body, mentionedUserIds),
      meta: { errorMessage: false },
      // The comment's own timeline and its job's (which interleaves task comments).
      onSuccess: (comment) => {
        void client.invalidateQueries({
          queryKey: productionKeys.timeline(
            comment.entity === "JOB" ? "jobs" : "tasks",
            comment.entityId
          )
        });
        void client.invalidateQueries({ queryKey: productionKeys.timeline("jobs", comment.jobId) });
      }
    }),
    edit: useMutation({
      mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
        jobsApi.editComment(commentId, body),
      meta: { errorMessage: false },
      onSuccess: (comment) => {
        void client.invalidateQueries({
          queryKey: productionKeys.timeline(
            comment.entity === "JOB" ? "jobs" : "tasks",
            comment.entityId
          )
        });
        void client.invalidateQueries({ queryKey: productionKeys.timeline("jobs", comment.jobId) });
      }
    }),
    remove: useMutation({
      mutationFn: (commentId: string) => jobsApi.deleteComment(commentId),
      meta: { errorMessage: false },
      onSuccess: () => void client.invalidateQueries({ queryKey: productionKeys.timeline() })
    })
  };
};
