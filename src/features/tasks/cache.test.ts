import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { TaskPage, TaskSummary } from "@/contracts/work";
import { qk } from "@/lib/query-keys";

import { flattenPages, reconcileTask, removeTaskEverywhere, taskMatchesQuery, type TaskPages } from "./cache";

const projectId = "p1";
const listId = "l1";
const todo = { id: "s-todo", name: "To do", color: "slate" as const, category: "active" as const };
const doing = { id: "s-doing", name: "Doing", color: "blue" as const, category: "active" as const };
const done = { id: "s-done", name: "Done", color: "green" as const, category: "done" as const };

const task = (id: string, rank: string, status: TaskSummary["status"] = todo, extra: Partial<TaskSummary> = {}): TaskSummary => ({
  id,
  key: `T-${id}`,
  number: 1,
  projectId,
  listId,
  parentTaskId: null,
  title: id,
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

const page = (items: TaskSummary[], hasMore = false): TaskPage => ({ items, pageInfo: { hasMore, nextCursor: hasMore ? "c" : null } });
const pages = (...list: TaskPage[]): TaskPages => ({ pages: list, pageParams: list.map((_, index) => (index === 0 ? undefined : "c")) });

const setup = () => {
  const client = new QueryClient();
  const todoKey = qk.tasks(projectId, { listId, parent: "root", statusIds: [todo.id] });
  const doingKey = qk.tasks(projectId, { listId, parent: "root", statusIds: [doing.id] });
  client.setQueryData(todoKey, pages(page([task("a", "a1"), task("b", "a3")])));
  client.setQueryData(doingKey, pages(page([task("c", "a2", doing)])));
  return { client, todoKey, doingKey };
};

const ids = (client: QueryClient, key: readonly unknown[]) => flattenPages(client.getQueryData<TaskPages>(key)).map((item) => item.id);

describe("taskMatchesQuery", () => {
  it("evaluates structural filters", () => {
    const subject = task("x", "a", done, { assignees: [{ id: "u1", displayName: "U", email: null, avatarUrl: null }] });
    expect(taskMatchesQuery(subject, { listId, statusIds: [done.id] })).toBe(true);
    expect(taskMatchesQuery(subject, { includeDone: false })).toBe(false);
    expect(taskMatchesQuery(subject, { assigneeIds: ["me"] }, "u1")).toBe(true);
    expect(taskMatchesQuery(subject, { assigneeIds: ["none"] })).toBe(false);
    expect(taskMatchesQuery(subject, { parent: "root" })).toBe(true);
    expect(taskMatchesQuery(subject, { q: "x" })).toBe("unknown");
  });
});

describe("reconcileTask", () => {
  it("moves a task between status groups by rank", () => {
    const { client, todoKey, doingKey } = setup();
    reconcileTask(client, task("a", "a1", doing));
    expect(ids(client, todoKey)).toEqual(["b"]);
    expect(ids(client, doingKey)).toEqual(["a", "c"]);
  });

  it("honours an explicit drop placement in the target group", () => {
    const { client, todoKey, doingKey } = setup();
    reconcileTask(client, task("b", "a3", doing), {
      insert: false,
      anchor: { queryKey: doingKey, placement: { beforeId: "c" } }
    });
    expect(ids(client, doingKey)).toEqual(["b", "c"]);
    expect(ids(client, todoKey)).toEqual(["a"]);
  });

  it("does not insert beyond loaded pages", () => {
    const client = new QueryClient();
    const key = qk.tasks(projectId, { listId, parent: "root", statusIds: [todo.id] });
    client.setQueryData(key, pages(page([task("a", "a1")], true)));
    reconcileTask(client, task("z", "zz"));
    expect(ids(client, key)).toEqual(["a"]);
    reconcileTask(client, task("m", "a0"));
    expect(ids(client, key)).toEqual(["m", "a"]);
  });

  it("updates a task in place and inside its parent's subtasks", () => {
    const { client, todoKey } = setup();
    const parentDetail = { ...task("p", "a0"), subtasks: [task("child", "a1", todo, { parentTaskId: "p" })] };
    client.setQueryData(qk.task("p"), parentDetail);
    reconcileTask(client, task("a", "a1", todo, { title: "Đổi tên" }));
    expect(flattenPages(client.getQueryData<TaskPages>(todoKey))[0]?.title).toBe("Đổi tên");
    reconcileTask(client, task("child", "a1", done, { parentTaskId: "p" }));
    const detail = client.getQueryData<typeof parentDetail & { openSubtaskCount: number }>(qk.task("p"));
    expect(detail?.subtasks[0]?.status.id).toBe(done.id);
    expect(detail?.openSubtaskCount).toBe(0);
  });

  it("removes a task everywhere", () => {
    const { client, todoKey } = setup();
    removeTaskEverywhere(client, projectId, "a");
    expect(ids(client, todoKey)).toEqual(["b"]);
  });
});
