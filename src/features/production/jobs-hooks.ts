import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient
} from "@tanstack/react-query";

import type {
  JobDetail,
  ProductionStatusRef,
  ProductionTask,
  ProductionTaskPage
} from "@/contracts/production-jobs";

import {
  jobsApi,
  type AssignInput,
  type CreateJobInput,
  type FeedbackInput,
  type JobListQuery,
  type MyTasksRole,
  type QtyInput,
  type ReassignInput,
  type TaskLineInput,
  type TimelineEntity,
  type TransitionInput,
  type UpdateJobInput,
  type UpdateTaskInput
} from "./jobs-api";
import { productionKeys } from "./keys";

/**
 * Data hooks for production jobs and tasks. Every write answers with fresh server state (the task or
 * the job with its capabilities); we store it, then invalidate the derived views (job status and
 * progress, lists, queues, timelines). Realtime `production:changed` hints (production-runtime.tsx)
 * invalidate the same keys for other people's changes.
 */

const nextCursor = (page: { pageInfo: { hasMore: boolean; nextCursor: string | null } }) =>
  page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;

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

export const useJob = (jobId: string | undefined) =>
  useQuery({
    queryKey: productionKeys.job(jobId ?? ""),
    queryFn: ({ signal }) => jobsApi.get(jobId ?? "", signal),
    enabled: Boolean(jobId)
  });

export const useProductionTask = (taskId: string | null | undefined) =>
  useQuery({
    queryKey: productionKeys.task(taskId ?? ""),
    queryFn: ({ signal }) => jobsApi.task(taskId ?? "", signal),
    enabled: Boolean(taskId)
  });

export const useMyTasks = (role: MyTasksRole, includeFinished: boolean) =>
  useInfiniteQuery({
    queryKey: productionKeys.myTasks(role, includeFinished),
    queryFn: ({ pageParam, signal }) => jobsApi.myTasks(role, includeFinished, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    placeholderData: keepPreviousData
  });

export const useQcQueue = () =>
  useQuery({
    queryKey: productionKeys.qcQueue(),
    queryFn: ({ signal }) => jobsApi.qcQueue(signal)
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

/** Derived views that may change after any task or job write. */
export const invalidateProductionViews = (client: QueryClient, jobId?: string | null, taskIds: readonly string[] = []) =>
  Promise.all([
    client.invalidateQueries({ queryKey: productionKeys.jobs() }),
    client.invalidateQueries({ queryKey: jobId ? productionKeys.job(jobId) : productionKeys.jobAll() }),
    client.invalidateQueries({ queryKey: productionKeys.myTasks() }),
    client.invalidateQueries({ queryKey: productionKeys.qcQueue() }),
    client.invalidateQueries({ queryKey: productionKeys.timeline() }),
    ...taskIds.map((taskId) => client.invalidateQueries({ queryKey: productionKeys.task(taskId) }))
  ]);

const replaceInPages = (data: InfiniteData<ProductionTaskPage> | undefined, task: ProductionTask) =>
  data
    ? {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => (item.id === task.id ? task : item))
        }))
      }
    : data;

/** Stores a task the API returned everywhere it is cached, then refreshes derived views. */
export const applyTask = (client: QueryClient, task: ProductionTask) => {
  client.setQueryData(productionKeys.task(task.id), task);
  client.setQueryData<JobDetail>(productionKeys.job(task.jobId), (job) =>
    job ? { ...job, tasks: job.tasks.map((item) => (item.id === task.id ? task : item)) } : job
  );
  client.setQueriesData<InfiniteData<ProductionTaskPage>>({ queryKey: productionKeys.myTasks() }, (data) =>
    replaceInPages(data, task)
  );
  void invalidateProductionViews(client, task.jobId);
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
    }
  });
};

export const useUpdateJob = (jobId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateJobInput) => jobsApi.update(jobId, input),
    meta: { errorMessage: false },
    onSuccess: (job) => {
      client.setQueryData(productionKeys.job(job.id), job);
      void client.invalidateQueries({ queryKey: productionKeys.jobs() });
      void client.invalidateQueries({ queryKey: productionKeys.timeline("jobs", jobId) });
    }
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

export const useReassignFeedback = (jobId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ feedbackId, input }: { feedbackId: string; input: ReassignInput }) => jobsApi.reassign(feedbackId, input),
    meta: { errorMessage: false },
    onSuccess: () => void invalidateProductionViews(client, jobId)
  });
};

export const useJobTransition = (jobId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (toStatusId: string) => jobsApi.transition(jobId, toStatusId),
    meta: { errorMessage: false },
    onSuccess: (result) => {
      client.setQueryData(productionKeys.job(jobId), result.job);
      void invalidateProductionViews(client, jobId, result.job.tasks.map((task) => task.id));
    }
  });
};

export const useCreateFeedback = (jobId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: FeedbackInput) => jobsApi.feedback(jobId, input),
    meta: { errorMessage: false },
    onSuccess: (job) => {
      client.setQueryData(productionKeys.job(jobId), job);
      void invalidateProductionViews(client, jobId, job.tasks.map((task) => task.id));
    }
  });
};

export const useOpenJobChat = () =>
  useMutation({ mutationFn: (jobId: string) => jobsApi.chat(jobId), meta: { errorMessage: false } });

// --- Task writes ------------------------------------------------------------------------------------------

type TransitionVariables = {
  task: ProductionTask;
  input: TransitionInput;
  /** Shown immediately in "my tasks" (kanban drop); rolled back if the API refuses. */
  optimisticStatus?: ProductionStatusRef;
};

export const useTransitionTask = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ task, input }: TransitionVariables) => jobsApi.transitionTask(task.id, input),
    meta: { errorMessage: false },
    onMutate: async ({ task, optimisticStatus }) => {
      if (!optimisticStatus) return { snapshot: [] as [readonly unknown[], unknown][] };
      await client.cancelQueries({ queryKey: productionKeys.myTasks() });
      const snapshot = client.getQueriesData<InfiniteData<ProductionTaskPage>>({ queryKey: productionKeys.myTasks() });
      client.setQueriesData<InfiniteData<ProductionTaskPage>>({ queryKey: productionKeys.myTasks() }, (data) =>
        replaceInPages(data, { ...task, status: optimisticStatus, capabilities: { ...task.capabilities, transitions: [] } })
      );
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) client.setQueryData(key, data);
    },
    onSuccess: (task) => applyTask(client, task)
  });
};

export const useTaskMutations = () => {
  const client = useQueryClient();
  const onSuccess = (task: ProductionTask) => applyTask(client, task);
  return {
    update: useMutation({
      mutationFn: ({ taskId, input }: { taskId: string; input: UpdateTaskInput }) => jobsApi.updateTask(taskId, input),
      meta: { errorMessage: false },
      onSuccess
    }),
    setQty: useMutation({
      mutationFn: ({ taskId, input }: { taskId: string; input: QtyInput }) => jobsApi.setQty(taskId, input),
      meta: { errorMessage: false },
      onSuccess
    }),
    assign: useMutation({
      mutationFn: ({ taskId, input }: { taskId: string; input: AssignInput }) => jobsApi.assign(taskId, input),
      meta: { errorMessage: false },
      onSuccess
    })
  };
};

// --- Comments ----------------------------------------------------------------------------------------------

export const useCommentMutations = () => {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: productionKeys.timeline() });
  return {
    add: useMutation({
      mutationFn: ({ entity, id, body, mentionedUserIds }: { entity: TimelineEntity; id: string; body: string; mentionedUserIds: string[] }) =>
        jobsApi.comment(entity, id, body, mentionedUserIds),
      meta: { errorMessage: false },
      onSuccess: refresh
    }),
    edit: useMutation({
      mutationFn: ({ commentId, body }: { commentId: string; body: string }) => jobsApi.editComment(commentId, body),
      meta: { errorMessage: false },
      onSuccess: refresh
    }),
    remove: useMutation({
      mutationFn: (commentId: string) => jobsApi.deleteComment(commentId),
      meta: { errorMessage: false },
      onSuccess: refresh
    })
  };
};
