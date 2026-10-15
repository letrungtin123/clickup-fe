import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";

import type {
  JobDetail,
  JobPage,
  JobSummary,
  ProductionTask,
  ProductionTaskPage
} from "@/contracts/production-jobs";
import type { ProductionChangedEvent } from "@/contracts/realtime";

import { qcQueueCodes } from "./jobs-model";
import { productionKeys } from "./keys";
import { kpiKeys, scoreKeys } from "./scores/keys";

/**
 * Production cache upkeep (PERF-01, BUG-PR-19). Realtime `production:changed` hints carry ids only;
 * instead of refetching every list, queue and score view on each hint, we:
 *
 * - coalesce hints for a short debounce and treat our own changes as "mark stale only" (the
 *   mutation already stored the server's answer; other tabs refresh on focus);
 * - invalidate only cached views that contain the job / task ids of the hint (job lists, the job and
 *   task details, timelines, my tasks, the QC queue). Comment hints only touch timelines;
 * - for my tasks / the QC queue a hint about tasks they do not hold yet (a new assignment, a task
 *   entering QC) marks them stale and refreshes them while on screen once, 30 s later, however many
 *   hints arrive (`notification:new` refreshes them right away for the person concerned);
 * - scores / KPI views are marked stale at once and refetched while on screen at most every 30 s.
 *
 * Pure helpers over a QueryClient; unit tested in live-sync.test.ts.
 */

export const LIVE_DEBOUNCE_MS = 300;
/** At most one network refresh per window for score / KPI views and speculative list refreshes. */
export const LIVE_REFRESH_MS = 30_000;

export type ChangeKind = ProductionChangedEvent["kind"];

export type PendingChange = {
  jobIds: Set<string>;
  taskIds: Set<string>;
  kinds: Set<ChangeKind>;
  /** Jobs named by a "job" hint (created, edited, archived): they may be missing from cached lists. */
  jobEvents: Set<string>;
};

export const emptyChange = (): PendingChange => ({
  jobIds: new Set(),
  taskIds: new Set(),
  kinds: new Set(),
  jobEvents: new Set()
});

export const isEmptyChange = (change: PendingChange) => change.kinds.size === 0;

/** True when the hint describes the signed-in user's own change (already applied from the response). */
export const isOwnChange = (event: Pick<ProductionChangedEvent, "actorId">, myId: string) =>
  event.actorId !== null && event.actorId === myId;

export const addChange = (
  change: PendingChange,
  event: Pick<ProductionChangedEvent, "jobId" | "taskIds" | "kind">
) => {
  change.jobIds.add(event.jobId);
  for (const taskId of event.taskIds) change.taskIds.add(taskId);
  change.kinds.add(event.kind);
  if (event.kind === "job") change.jobEvents.add(event.jobId);
};

export type Invalidation = {
  queryKey: QueryKey;
  exact: boolean;
  /** false = mark stale only (refetched on next mount / focus). */
  refetch: boolean;
};

export type ChangePlan = {
  invalidations: Invalidation[];
  /** Lists that may have gained a row: refresh while on screen, throttled. */
  speculative: QueryKey[];
  /** Score entries may have changed (task moves, quantities, feedback). */
  scores: boolean;
};

const pagesContain = (
  data: { pages: { items: { id: string }[] }[] } | undefined,
  ids: ReadonlySet<string>
) => Boolean(data?.pages.some((page) => page.items.some((item) => ids.has(item.id))));

const pageHolds = (data: { items: { id: string }[] } | undefined, ids: ReadonlySet<string>) =>
  Boolean(data?.items.some((item) => ids.has(item.id)));

const isCached = (client: QueryClient, queryKey: QueryKey, exact = true) =>
  client.getQueryCache().findAll({ queryKey, exact }).length > 0;

/**
 * Which cached production views a coalesced change touches. Only cached queries appear in the
 * plan; nothing is fetched here.
 */
export const planChangeInvalidations = (client: QueryClient, change: PendingChange): ChangePlan => {
  const invalidations: Invalidation[] = [];
  const speculative: QueryKey[] = [];
  const add = (queryKey: QueryKey, exact = true, refetch = true) =>
    invalidations.push({ queryKey, exact, refetch });

  const touchesWork =
    change.kinds.has("job") || change.kinds.has("tasks") || change.kinds.has("feedback");

  for (const jobId of change.jobIds) {
    // The job timeline and, under its key, the job page's "Nhật ký" (history only, PD-044, job-log-hooks.ts): a
    // comment leaves the log alone, any work change refreshes both (prefix).
    const key = productionKeys.timeline("jobs", jobId);
    const exact = !touchesWork;
    if (isCached(client, key, exact)) add(key, exact);
  }
  for (const taskId of change.taskIds) {
    const key = productionKeys.timeline("tasks", taskId);
    if (isCached(client, key)) add(key);
  }

  if (!touchesWork) return { invalidations, speculative, scores: false };

  for (const jobId of change.jobIds) {
    const key = productionKeys.job(jobId);
    if (isCached(client, key)) add(key);
  }
  for (const taskId of change.taskIds) {
    // Prefix: the task and its score rows.
    const key = productionKeys.task(taskId);
    if (isCached(client, key, false)) add(key, false);
  }

  // Job lists: the rows of the changed jobs; every list when a job event names a job no list holds
  // (a new job, or one entering the view after an edit).
  const lists = client.getQueriesData<InfiniteData<JobPage>>({ queryKey: productionKeys.jobs() });
  const unknownJob = [...change.jobEvents].some(
    (jobId) => !lists.some(([, data]) => pagesContain(data, new Set([jobId])))
  );
  if (unknownJob) {
    if (lists.length > 0) add(productionKeys.jobs(), false);
  } else {
    for (const [key, data] of lists) if (pagesContain(data, change.jobIds)) add(key);
  }
  // The "Nhập công việc" job picker shows each job's manual status (PD-038) and lists new jobs.
  if (change.kinds.has("job") && isCached(client, productionKeys.jobOptions(), false)) {
    add(productionKeys.jobOptions(), false);
  }

  // My tasks and the QC queue: refetch when they hold a changed task. A task hint they do not hold
  // may be a new assignment: mark stale and refresh later (throttled) while on screen.
  const taskHints =
    change.taskIds.size > 0 && (change.kinds.has("tasks") || change.kinds.has("feedback"));
  for (const [key, data] of client.getQueriesData<InfiniteData<ProductionTaskPage>>({
    queryKey: productionKeys.myTasks()
  })) {
    if (pagesContain(data, change.taskIds)) add(key);
    else if (taskHints) {
      add(key, true, false);
      speculative.push(key);
    }
  }
  // The plain queue and its tag / custom-field filtered variants (same prefix).
  for (const [qcKey, data] of client.getQueriesData<ProductionTaskPage>({
    queryKey: productionKeys.qcQueue()
  })) {
    if (pageHolds(data, change.taskIds)) add(qcKey);
    else if (taskHints) {
      add(qcKey, true, false);
      speculative.push(qcKey);
    }
  }

  return {
    invalidations,
    speculative,
    scores: change.kinds.has("tasks") || change.kinds.has("feedback")
  };
};

/** Applies a plan; `markOnly` turns every refetch into "stale until next use" (own changes). */
export const applyInvalidations = (
  client: QueryClient,
  invalidations: readonly Invalidation[],
  markOnly = false
) =>
  Promise.all(
    invalidations.map((entry) =>
      client.invalidateQueries({
        queryKey: entry.queryKey,
        exact: entry.exact,
        refetchType: entry.refetch && !markOnly ? "active" : "none"
      })
    )
  );

// Throttle ----------------------------------------------------------------------------------------------------

export type Throttle = { request: () => void; cancel: () => void };

/**
 * Leading + trailing throttle: the first request runs at once, later ones within `intervalMs`
 * collapse into one run at the end of the window. `leading: false` waits a full window first
 * (speculative refreshes: a burst of unrelated hints costs one refetch, not one per hint).
 */
export const createThrottle = (
  intervalMs: number,
  run: () => void,
  options: { leading?: boolean; now?: () => number } = {}
): Throttle => {
  const { leading = true, now = Date.now } = options;
  let last = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    timer = null;
    last = now();
    run();
  };
  return {
    request: () => {
      if (timer !== null) return;
      // Trailing-only throttles always wait a full window after the first request.
      const wait = leading
        ? last + intervalMs - now()
        : Math.max(intervalMs, last + intervalMs - now());
      if (wait <= 0) fire();
      else timer = setTimeout(fire, wait);
    },
    cancel: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    }
  };
};

// Scores / KPI ------------------------------------------------------------------------------------------------

const scoreRefreshers = new WeakMap<QueryClient, Throttle>();

const scoreViews = () => [scoreKeys.all(), kpiKeys.reportAll()] as const;

/**
 * Score entries changed (own move / quantity edit / leave decision, or someone else's): every score
 * and KPI report view is marked stale at once (pages opened later refetch on mount) and the ones on
 * screen refetch at most once per LIVE_REFRESH_MS.
 */
export const requestScoresRefresh = (client: QueryClient) => {
  for (const queryKey of scoreViews()) {
    void client.invalidateQueries({ queryKey, refetchType: "none" });
  }
  let throttle = scoreRefreshers.get(client);
  if (!throttle) {
    throttle = createThrottle(LIVE_REFRESH_MS, () => {
      for (const queryKey of scoreViews()) {
        void client.refetchQueries({ queryKey, type: "active" });
      }
    });
    scoreRefreshers.set(client, throttle);
  }
  throttle.request();
};

// Patching caches with the server's answer to our own writes -----------------------------------------------

/** Replaces `task` wherever it appears in an infinite task list (my tasks). */
export const replaceTaskInPages = (
  data: InfiniteData<ProductionTaskPage> | undefined,
  task: ProductionTask
) =>
  data && pagesContain(data, new Set([task.id]))
    ? {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => (item.id === task.id ? task : item))
        }))
      }
    : data;

const doneTime = (task: Pick<ProductionTask, "doneAt">) =>
  task.doneAt ? new Date(task.doneAt).getTime() : Number.POSITIVE_INFINITY;

/**
 * The QC queue after a write answered with `task`: it leaves the queue once it is no longer waiting
 * for my check or being checked (Chờ QC / Đang check, PD-044), is replaced in place otherwise, and
 * joins it (oldest Done first) when it starts waiting for me (`myId`). Subtasks are never queue cards.
 */
export const patchQcQueue = (
  data: ProductionTaskPage | undefined,
  task: ProductionTask,
  myId: string | null
) => {
  if (!data) return data;
  const waiting = qcQueueCodes.has(task.status.code) && !task.isSubtask;
  const index = data.items.findIndex((item) => item.id === task.id);
  if (index >= 0) {
    if (waiting && (myId === null || task.qc?.id === myId)) {
      const items = [...data.items];
      items[index] = task;
      return { ...data, items };
    }
    return { ...data, items: data.items.filter((item) => item.id !== task.id) };
  }
  if (!waiting || myId === null || task.qc?.id !== myId) return data;
  const items = [...data.items, task].sort(
    (a, b) => doneTime(a) - doneTime(b) || a.id.localeCompare(b.id)
  );
  return { ...data, items };
};

/**
 * Job list rows refreshed from a job the API returned (detail fields dropped). A row of the per-person
 * view keeps its person share: the detail never carries one.
 */
export const patchJobInPages = (
  data: InfiniteData<JobPage> | undefined,
  job: JobSummary | JobDetail
) => {
  if (!data || !pagesContain(data, new Set([job.id]))) return data;
  const summary = toJobSummary(job);
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === summary.id ? { ...summary, personShare: item.personShare } : item
      )
    }))
  };
};

const toJobSummary = (job: JobSummary | JobDetail): JobSummary => {
  if (!("tasks" in job)) return job;
  const { tasks: _tasks, feedbacks: _feedbacks, capabilities: _capabilities, ...summary } = job;
  return summary;
};
