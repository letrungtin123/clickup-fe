import {
  QueryClient,
  QueryObserver,
  type InfiniteData,
  type QueryKey
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  JobDetail,
  JobPage,
  JobSummary,
  ProductionTask,
  ProductionTaskPage
} from "@/contracts/production-jobs";

import { productionKeys } from "./keys";
import {
  addChange,
  applyInvalidations,
  createThrottle,
  emptyChange,
  isOwnChange,
  LIVE_REFRESH_MS,
  patchJobInPages,
  patchQcQueue,
  planChangeInvalidations,
  replaceTaskInPages,
  requestScoresRefresh,
  type ChangeKind
} from "./live-sync";
import { kpiKeys, scoreKeys } from "./scores/keys";

// Obviously fake ids (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = id(900);
const OTHER = id(901);
const user = (userId: string) => ({
  id: userId,
  displayName: "Người",
  email: null,
  avatarUrl: null
});

const status = (code: string, n: number) => ({
  id: id(n),
  code,
  name: code,
  color: "blue" as const
});

const makeTask = (n: number, extra: Partial<ProductionTask> = {}): ProductionTask => ({
  id: id(n),
  number: n,
  jobId: id(1),
  jobCode: "JOB",
  project: { id: id(2), code: "P", name: "Dự án" },
  assignee: user(OTHER),
  qc: user(ME),
  process: { id: id(3), name: "Retouch", isQc: false },
  shift: { id: id(4), name: "Ca ngày", payMode: "POINTS", requiresOtHours: false },
  qtyAssigned: 10,
  qtyDone: null,
  otHours: null,
  assignedAt: "2026-10-01T01:00:00.000Z",
  deadline: "2026-10-12T10:00:00.000Z",
  doneAt: null,
  checkedAt: null,
  status: status("PROCESSING", 50),
  kind: "NORMAL",
  parentTaskId: null,
  feedbackId: null,
  note: null,
  isLate: false,
  jobArchived: false,
  qcFailCount: 0,
  customValues: {},
  tagIds: [],
  createdAt: "2026-10-01T01:00:00.000Z",
  updatedAt: "2026-10-01T01:00:00.000Z",
  capabilities: { transitions: [], canEdit: false, canAssign: false, canEditQty: false },
  ...extra
});

const makeJob = (n: number, extra: Partial<JobSummary> = {}): JobSummary => ({
  id: id(n),
  number: n,
  code: `JOB-${n}`,
  name: null,
  project: { id: id(2), code: "P", name: "Dự án", clientName: null },
  leader: user(OTHER),
  deadline: "2026-10-12T10:00:00.000Z",
  totalImages: 100,
  driveLink: null,
  channelId: null,
  status: null,
  qtyAssigned: 0,
  qtyDone: 0,
  qtyChecked: 0,
  taskCount: 0,
  lateTaskCount: 0,
  openFeedbackCount: 0,
  customValues: {},
  tagIds: [],
  createdBy: null,
  createdAt: "2026-10-01T01:00:00.000Z",
  archived: false,
  ...extra
});

const pageOf = <T>(items: T[]) => ({ items, pageInfo: { hasMore: false, nextCursor: null } });
const infinite = <T>(items: T[]) => ({ pages: [pageOf(items)], pageParams: [undefined] });

const change = (events: { jobId: string; taskIds?: string[]; kind: ChangeKind }[]) => {
  const pending = emptyChange();
  for (const event of events) addChange(pending, { taskIds: [], ...event });
  return pending;
};

const keysOf = (
  plan: { invalidations: { queryKey: QueryKey; refetch: boolean }[] },
  refetch: boolean
) => plan.invalidations.filter((entry) => entry.refetch === refetch).map((entry) => entry.queryKey);

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  client.clear();
  vi.useRealTimers();
});

describe("own changes", () => {
  it("recognises the signed-in user's own hints; system hints are never own", () => {
    expect(isOwnChange({ actorId: ME }, ME)).toBe(true);
    expect(isOwnChange({ actorId: OTHER }, ME)).toBe(false);
    expect(isOwnChange({ actorId: null }, ME)).toBe(false);
  });
});

describe("planChangeInvalidations", () => {
  const seed = () => {
    const listWithJob = productionKeys.jobs({ q: "a" });
    const listWithout = productionKeys.jobs({ q: "b" });
    client.setQueryData<InfiniteData<JobPage>>(listWithJob, infinite([makeJob(1)]));
    client.setQueryData<InfiniteData<JobPage>>(listWithout, infinite([makeJob(7)]));
    const mine = productionKeys.myTasks("all", false);
    client.setQueryData<InfiniteData<ProductionTaskPage>>(mine, infinite([makeTask(10)]));
    client.setQueryData<ProductionTaskPage>(productionKeys.qcQueue(), pageOf([makeTask(11)]));
    client.setQueryData(productionKeys.job(id(1)), { id: id(1) });
    client.setQueryData(productionKeys.task(id(10)), makeTask(10));
    client.setQueryData(productionKeys.timeline("jobs", id(1)), { pages: [], pageParams: [] });
    client.setQueryData(productionKeys.timeline("tasks", id(10)), { pages: [], pageParams: [] });
    return { listWithJob, listWithout, mine };
  };

  it("comment hints only refresh the cached timelines", () => {
    seed();
    const plan = planChangeInvalidations(
      client,
      change([{ jobId: id(1), taskIds: [id(10)], kind: "comment" }])
    );
    expect(keysOf(plan, true)).toEqual([
      productionKeys.timeline("jobs", id(1)),
      productionKeys.timeline("tasks", id(10))
    ]);
    expect(plan.speculative).toEqual([]);
    expect(plan.scores).toBe(false);
  });

  it("task hints refetch only the views holding the job / task", () => {
    const { listWithJob, mine } = seed();
    const plan = planChangeInvalidations(
      client,
      change([{ jobId: id(1), taskIds: [id(10)], kind: "tasks" }])
    );
    const refetched = keysOf(plan, true);
    expect(refetched).toContainEqual(productionKeys.job(id(1)));
    expect(refetched).toContainEqual(productionKeys.task(id(10)));
    expect(refetched).toContainEqual(listWithJob);
    expect(refetched).toContainEqual(mine);
    expect(refetched).not.toContainEqual(productionKeys.jobs({ q: "b" }));
    // The QC queue does not hold task 10: stale only, refreshed later while on screen.
    expect(refetched).not.toContainEqual(productionKeys.qcQueue());
    expect(keysOf(plan, false)).toEqual([productionKeys.qcQueue()]);
    expect(plan.speculative).toEqual([productionKeys.qcQueue()]);
    expect(plan.scores).toBe(true);
  });

  it("a hint about someone else's job touches nothing but may add rows to my lists", () => {
    seed();
    const plan = planChangeInvalidations(
      client,
      change([{ jobId: id(99), taskIds: [id(98)], kind: "tasks" }])
    );
    expect(keysOf(plan, true)).toEqual([]);
    expect(plan.speculative).toEqual([
      productionKeys.myTasks("all", false),
      productionKeys.qcQueue()
    ]);
  });

  it("a job hint for a job no list holds refreshes every job list (new job)", () => {
    seed();
    const plan = planChangeInvalidations(client, change([{ jobId: id(42), kind: "job" }]));
    expect(plan.invalidations).toContainEqual({
      queryKey: productionKeys.jobs(),
      exact: false,
      refetch: true
    });
    expect(plan.speculative).toEqual([]);
    expect(plan.scores).toBe(false);
  });

  it("ignores views that are not cached", () => {
    const plan = planChangeInvalidations(
      client,
      change([{ jobId: id(1), taskIds: [id(10)], kind: "tasks" }])
    );
    expect(plan.invalidations).toEqual([]);
    expect(plan.speculative).toEqual([]);
  });

  it("applies plans: refetch on screen, or only mark stale for own changes", async () => {
    const { mine } = seed();
    const plan = planChangeInvalidations(
      client,
      change([{ jobId: id(1), taskIds: [id(10)], kind: "tasks" }])
    );
    await applyInvalidations(client, plan.invalidations, true);
    expect(client.getQueryState(mine)?.isInvalidated).toBe(true);
    expect(client.getQueryState(productionKeys.qcQueue())?.isInvalidated).toBe(true);
    expect(client.getQueryState(productionKeys.jobs({ q: "b" }))?.isInvalidated).toBe(false);
  });
});

describe("createThrottle", () => {
  it("runs the first request at once and collapses the rest into one trailing run", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const throttle = createThrottle(1000, run);
    throttle.request();
    expect(run).toHaveBeenCalledTimes(1);
    throttle.request();
    throttle.request();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(999);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(2);
    throttle.request();
    expect(run).toHaveBeenCalledTimes(3);
    throttle.cancel();
  });
});

describe("createThrottle (trailing only)", () => {
  it("waits a full window and collapses a burst into one run", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const throttle = createThrottle(1000, run, { leading: false });
    throttle.request();
    throttle.request();
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
    throttle.request();
    vi.advanceTimersByTime(999);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("requestScoresRefresh", () => {
  it("marks score and KPI report views stale at once and refetches at most every 30 s", async () => {
    vi.useFakeTimers();
    const forecast = vi.fn().mockResolvedValue({ ok: 1 });
    const scoresKey = scoreKeys.forecast(null);
    const reportKey = kpiKeys.report("2026-01", "2026-10", null);
    const unrelated = productionKeys.workflow();
    client.setQueryData(reportKey, { rows: [] });
    client.setQueryData(unrelated, { statuses: [] });
    // An active (observed) forecast query: its first fetch is the mount.
    const observer = new QueryObserver(client, {
      queryKey: scoresKey,
      queryFn: forecast,
      staleTime: Number.POSITIVE_INFINITY
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(forecast).toHaveBeenCalledTimes(1);

    requestScoresRefresh(client);
    await vi.advanceTimersByTimeAsync(0);
    // Inactive views are only marked stale (no fetch function ran for them).
    expect(client.getQueryState(reportKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
    // Leading edge: the view on screen refetches at once.
    expect(forecast).toHaveBeenCalledTimes(2);

    requestScoresRefresh(client);
    requestScoresRefresh(client);
    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS - 1);
    expect(forecast).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(forecast).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});

describe("patching own writes", () => {
  it("replaces a task in my-task pages and leaves other lists untouched", () => {
    const data = infinite([makeTask(10), makeTask(12)]);
    const moved = makeTask(10, { status: status("DONE", 51) });
    expect(replaceTaskInPages(data, moved)?.pages[0]?.items[0]?.status.code).toBe("DONE");
    expect(replaceTaskInPages(data, makeTask(99))).toBe(data);
    expect(replaceTaskInPages(undefined, moved)).toBeUndefined();
  });

  it("keeps the QC queue in sync: leaves on pass/fail, joins when waiting for me", () => {
    const waiting = (n: number, doneAt: string, extra: Partial<ProductionTask> = {}) =>
      makeTask(n, { status: status("WAITING_QC", 52), doneAt, ...extra });
    const queue = pageOf([
      waiting(1, "2026-10-09T01:00:00.000Z"),
      waiting(3, "2026-10-09T03:00:00.000Z")
    ]);

    const passed = patchQcQueue(queue, makeTask(1, { status: status("CHECKED", 53) }), ME);
    expect(passed?.items.map((task) => task.number)).toEqual([3]);

    const joined = patchQcQueue(queue, waiting(2, "2026-10-09T02:00:00.000Z"), ME);
    expect(joined?.items.map((task) => task.number)).toEqual([1, 2, 3]);

    const notMine = patchQcQueue(
      queue,
      waiting(2, "2026-10-09T02:00:00.000Z", { qc: user(OTHER) }),
      ME
    );
    expect(notMine).toBe(queue);

    const reassigned = patchQcQueue(
      queue,
      waiting(1, "2026-10-09T01:00:00.000Z", { qc: user(OTHER) }),
      ME
    );
    expect(reassigned?.items.map((task) => task.number)).toEqual([3]);
  });

  it("patches job rows from a job detail without its tasks", () => {
    const data = infinite([makeJob(1), makeJob(2)]);
    const detail = {
      ...makeJob(1, { qtyDone: 40 }),
      tasks: [],
      feedbacks: [],
      capabilities: {
        canEdit: true,
        canSplit: true,
        canFeedback: false,
        canCloseFeedback: false,
        canArchive: false,
        bulkActions: []
      }
    } satisfies JobDetail;
    const patched = patchJobInPages(data, detail);
    const row = patched?.pages[0]?.items[0];
    expect(row?.qtyDone).toBe(40);
    expect(row && "tasks" in row).toBe(false);
    expect(patched?.pages[0]?.items[1]).toBe(data.pages[0]?.items[1]);
    expect(patchJobInPages(data, makeJob(3))).toBe(data);
  });
});
