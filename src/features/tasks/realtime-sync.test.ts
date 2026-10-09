import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskChangedEvent } from "@/contracts/realtime";
import type { TaskDetail, TaskPage, TaskSummary } from "@/contracts/work";
import { ApiError } from "@/lib/api/errors";
import { qk } from "@/lib/query-keys";

import { tasksApi } from "./api";
import { flattenPages, type TaskPages } from "./cache";
import { clearLocalTaskMutations, markLocalTaskMutation } from "./local-mutations";
import { applyTaskChanges, maxTargetedFetches, planTaskEvent } from "./realtime-sync";

vi.mock("./api", () => ({ tasksApi: { get: vi.fn() } }));
const invalidations: unknown[] = [];
vi.mock("@/lib/realtime/socket", () => ({ scheduleInvalidate: (key: unknown) => invalidations.push(key) }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projectId = uuid(1);
const listId = uuid(2);
const todo = { id: uuid(3), name: "To do", color: "slate" as const, category: "active" as const };
const doing = { id: uuid(4), name: "Doing", color: "blue" as const, category: "active" as const };
const self = uuid(9);

const task = (n: number, rank: string, status: TaskSummary["status"] = todo, extra: Partial<TaskSummary> = {}): TaskSummary => ({
  id: uuid(100 + n),
  key: `T-${n}`,
  number: n,
  projectId,
  listId,
  parentTaskId: null,
  title: `Task ${n}`,
  status,
  priority: "normal",
  startAt: null,
  dueAt: null,
  completedAt: null,
  rank,
  assignees: [],
  subtaskCount: 0,
  openSubtaskCount: 0,
  commentCount: 0,
  attachmentCount: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...extra
});
const page = (items: TaskSummary[]): TaskPage => ({ items, pageInfo: { hasMore: false, nextCursor: null } });
const pages = (...list: TaskPage[]): TaskPages => ({ pages: list, pageParams: list.map(() => undefined) });
const event = (taskId: string, kind: TaskChangedEvent["kind"]): TaskChangedEvent => ({
  projectId,
  listId,
  taskId,
  parentTaskId: null,
  kind,
  actorId: uuid(8),
  at: "2026-10-09T00:00:00.000Z"
});
const change = (taskId: string, kind: TaskChangedEvent["kind"]) => ({ event: event(taskId, kind), moved: kind === "moved" });

const setup = () => {
  const client = new QueryClient();
  const todoKey = qk.tasks(projectId, { listId, parent: "root", statusIds: [todo.id] });
  const doingKey = qk.tasks(projectId, { listId, parent: "root", statusIds: [doing.id] });
  client.setQueryData(todoKey, pages(page([task(1, "a1"), task(2, "a3")])));
  client.setQueryData(doingKey, pages(page([task(3, "a2", doing)])));
  return { client, todoKey, doingKey };
};
const ids = (client: QueryClient, key: readonly unknown[]) => flattenPages(client.getQueryData<TaskPages>(key)).map((item) => item.id);

describe("applyTaskChanges", () => {
  beforeEach(() => {
    vi.mocked(tasksApi.get).mockReset();
    invalidations.length = 0;
  });

  it("moves an updated task between cached groups without refetching listings", async () => {
    const { client, todoKey, doingKey } = setup();
    vi.mocked(tasksApi.get).mockResolvedValue({ ...task(1, "a1", doing), description: null } as unknown as TaskDetail);
    await applyTaskChanges(client, [change(uuid(101), "updated")], self);
    expect(ids(client, todoKey)).toEqual([uuid(102)]);
    expect(ids(client, doingKey)).toContain(uuid(101));
    expect(invalidations).toEqual([]);
    // Detail-only fields never leak into list rows.
    expect(flattenPages(client.getQueryData<TaskPages>(doingKey)).find((item) => item.id === uuid(101))).not.toHaveProperty("description");
  });

  it("removes deleted or no-longer-visible tasks", async () => {
    const { client, todoKey } = setup();
    await applyTaskChanges(client, [change(uuid(101), "deleted")], self);
    expect(ids(client, todoKey)).toEqual([uuid(102)]);
    expect(tasksApi.get).not.toHaveBeenCalled();

    vi.mocked(tasksApi.get).mockRejectedValue(new ApiError({ status: 404, code: "TASK_NOT_FOUND", message: "x" }));
    await applyTaskChanges(client, [change(uuid(102), "updated")], self);
    expect(ids(client, todoKey)).toEqual([]);
  });

  it("refreshes My Tasks when the task is assigned to me", async () => {
    const { client } = setup();
    vi.mocked(tasksApi.get).mockResolvedValue(
      task(2, "a3", todo, { assignees: [{ id: self, displayName: "Me", email: null, avatarUrl: null }] }) as unknown as TaskDetail
    );
    await applyTaskChanges(client, [change(uuid(102), "updated")], self);
    expect(invalidations).toEqual([qk.myTasks()]);
  });

  it("falls back to one listing refetch for large bursts", async () => {
    const { client, todoKey } = setup();
    const many = Array.from({ length: maxTargetedFetches + 1 }, (_, index) => task(500 + index, `b${index}`));
    client.setQueryData(todoKey, pages(page(many)));
    const burst = many.map((item) => change(item.id, "updated"));
    await applyTaskChanges(client, burst, self);
    expect(tasksApi.get).not.toHaveBeenCalled();
    expect(invalidations[0]).toEqual(qk.tasks(projectId));
  });
});

describe("planTaskEvent (PERF-07)", () => {
  beforeEach(() => {
    vi.mocked(tasksApi.get).mockReset();
    invalidations.length = 0;
    clearLocalTaskMutations();
  });

  it("skips the echo of this tab's own change but applies the same user's other tabs", async () => {
    const { client } = setup();
    markLocalTaskMutation(uuid(101));
    const own = { ...event(uuid(101), "updated"), actorId: self };
    expect(planTaskEvent(client, own, self)).toBe("skip");
    await applyTaskChanges(client, [{ event: own, moved: false }], self);
    expect(tasksApi.get).not.toHaveBeenCalled();

    // Same user, a task this tab never touched (changed from another tab / device).
    expect(planTaskEvent(client, { ...event(uuid(102), "updated"), actorId: self }, self)).toBe("fetch");
    // The echo window expires.
    expect(planTaskEvent(client, own, self, Date.now() + 60_000)).toBe("fetch");
  });

  it("only marks listings stale for tasks nothing on screen shows", async () => {
    const { client, todoKey } = setup();
    const unseen = event(uuid(700), "created");
    expect(planTaskEvent(client, unseen, self)).toBe("stale");
    await applyTaskChanges(client, [{ event: unseen, moved: false }], self);
    expect(tasksApi.get).not.toHaveBeenCalled();
    expect(client.getQueryState(todoKey)?.isInvalidated).toBe(true);
  });

  it("fetches a new task when an active listing could include it", () => {
    const { client, todoKey } = setup();
    const observer = new QueryObserver(client, { queryKey: todoKey, queryFn: () => pages(page([])), staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => undefined);
    expect(planTaskEvent(client, event(uuid(700), "created"), self)).toBe("fetch");
    // Another list of the project: nothing on screen can show it.
    expect(planTaskEvent(client, { ...event(uuid(701), "created"), listId: uuid(77) }, self)).toBe("stale");
    unsubscribe();
  });

  it("bumps the parent's subtask counter for a new subtask created elsewhere", async () => {
    const { client, todoKey } = setup();
    const parentId = uuid(101);
    client.setQueryData(qk.task(parentId), { ...task(1, "a1"), subtasks: [], attachments: [] });
    const child = task(9, "c1", todo, { parentTaskId: parentId });
    vi.mocked(tasksApi.get).mockResolvedValue(child as unknown as TaskDetail);
    await applyTaskChanges(client, [{ event: { ...event(child.id, "created"), parentTaskId: parentId }, moved: false }], self);
    const row = flattenPages(client.getQueryData<TaskPages>(todoKey)).find((item) => item.id === parentId);
    expect(row).toMatchObject({ subtaskCount: 1, openSubtaskCount: 1 });
    expect(client.getQueryData<TaskDetail>(qk.task(parentId))?.subtasks.map((item) => item.id)).toEqual([child.id]);
  });
});
