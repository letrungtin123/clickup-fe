import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { TaskPage, TaskSummary } from "@/contracts/work";
import { qk } from "@/lib/query-keys";

import { flattenPages, patchTaskEverywhere, reconcileTask, removeTaskEverywhere, taskMatchesQuery, type TaskPages } from "./cache";

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

describe("parent counters (BUG-WK-19)", () => {
  const withParentRow = () => {
    const { client, todoKey } = setup();
    // "a" is a parent with 2 subtasks, 1 still open; its detail is not cached.
    client.setQueryData(todoKey, pages(page([task("a", "a1", todo, { subtaskCount: 2, openSubtaskCount: 1 }), task("b", "a3")])));
    const childKey = qk.tasks(projectId, { listId, parent: "a" });
    client.setQueryData(childKey, { items: [task("k1", "a1", todo, { parentTaskId: "a" }), task("k2", "a2", done, { parentTaskId: "a" })], pageInfo: { hasMore: false, nextCursor: null } });
    const parentRow = () => flattenPages(client.getQueryData<TaskPages>(todoKey)).find((item) => item.id === "a");
    return { client, parentRow };
  };

  it("counts a newly created subtask on the parent's row", () => {
    const { client, parentRow } = withParentRow();
    reconcileTask(client, task("k3", "a3", todo, { parentTaskId: "a" }), { created: true });
    expect(parentRow()).toMatchObject({ subtaskCount: 3, openSubtaskCount: 2 });
    // Applying the same task again (realtime echo) does not count it twice.
    reconcileTask(client, task("k3", "a3", todo, { parentTaskId: "a" }), { created: true });
    expect(parentRow()).toMatchObject({ subtaskCount: 3, openSubtaskCount: 2 });
  });

  it("follows completion, reopening and deletion of a subtask", () => {
    const { client, parentRow } = withParentRow();
    reconcileTask(client, task("k1", "a1", done, { parentTaskId: "a" }));
    expect(parentRow()).toMatchObject({ subtaskCount: 2, openSubtaskCount: 0 });
    reconcileTask(client, task("k2", "a2", todo, { parentTaskId: "a" }));
    expect(parentRow()).toMatchObject({ subtaskCount: 2, openSubtaskCount: 1 });
    removeTaskEverywhere(client, projectId, "k2");
    expect(parentRow()).toMatchObject({ subtaskCount: 1, openSubtaskCount: 0 });
  });

  it("uses the parent's detail as the source of truth when it is cached", () => {
    const { client, parentRow } = withParentRow();
    client.setQueryData(qk.task("a"), {
      ...task("a", "a1", todo, { subtaskCount: 2, openSubtaskCount: 1 }),
      subtasks: [task("k1", "a1", todo, { parentTaskId: "a" }), task("k2", "a2", done, { parentTaskId: "a" })]
    });
    reconcileTask(client, task("k3", "a3", todo, { parentTaskId: "a" }), { created: true });
    expect(parentRow()).toMatchObject({ subtaskCount: 3, openSubtaskCount: 2 });
  });

  it("patches comment counters on rows and the detail", () => {
    const { client, parentRow } = withParentRow();
    client.setQueryData(qk.task("a"), { ...task("a", "a1"), subtasks: [] });
    patchTaskEverywhere(client, projectId, "a", (item) => ({ commentCount: item.commentCount + 1 }));
    expect(parentRow()?.commentCount).toBe(1);
    expect(client.getQueryData<TaskSummary>(qk.task("a"))?.commentCount).toBe(1);
  });
});
