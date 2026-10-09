import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskChangedEvent } from "@/contracts/realtime";
import type { TaskDetail, TaskPage, TaskSummary } from "@/contracts/work";
import { ApiError } from "@/lib/api/errors";
import { qk } from "@/lib/query-keys";

import { tasksApi } from "./api";
import { flattenPages, type TaskPages } from "./cache";
import { applyTaskChanges, maxTargetedFetches } from "./realtime-sync";

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
    const { client } = setup();
    const burst = Array.from({ length: maxTargetedFetches + 1 }, (_, index) => change(uuid(500 + index), "updated"));
    await applyTaskChanges(client, burst, self);
    expect(tasksApi.get).not.toHaveBeenCalled();
    expect(invalidations[0]).toEqual(qk.tasks(projectId));
  });
});
