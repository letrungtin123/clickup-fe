import { hashKey, matchQuery, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { normalizeTaskQuery, qk } from "./query-keys";

const projectId = "0b8f0f5e-8f2a-4d47-9a51-3f0c1e5d7a10";
const taskId = "6a0c3c1e-2b4f-4b8e-8d0b-1f2e3d4c5b6a";

describe("normalizeTaskQuery", () => {
  it("drops defaults, empty values and whitespace", () => {
    expect(
      normalizeTaskQuery({
        listId: undefined,
        statusIds: [],
        includeDone: true,
        sort: "rank",
        order: "asc",
        limit: 50,
        q: "   "
      })
    ).toEqual({});
  });

  it("keeps meaningful filters and sorts/dedupes multi-value filters", () => {
    expect(
      normalizeTaskQuery({
        listId: "l1",
        statusIds: ["s2", "s1", "s2"],
        priorities: ["urgent", "high"],
        includeDone: false,
        q: "  login bug ",
        sort: "dueAt",
        order: "desc",
        dueFrom: "2026-10-09T00:00:00.000Z"
      })
    ).toEqual({
      listId: "l1",
      statusIds: ["s1", "s2"],
      priorities: ["high", "urgent"],
      includeDone: false,
      q: "login bug",
      sort: "dueAt",
      order: "desc",
      dueFrom: "2026-10-09T00:00:00.000Z"
    });
  });
});

describe("qk", () => {
  it("produces equal hashes for equivalent task queries", () => {
    const a = qk.tasks(projectId, { listId: "l1", statusIds: ["b", "a"], sort: "rank" });
    const b = qk.tasks(projectId, { statusIds: ["a", "b"], listId: "l1", includeDone: true });
    expect(hashKey(a)).toBe(hashKey(b));
    expect(hashKey(qk.tasks(projectId, { listId: "l1" }))).not.toBe(
      hashKey(qk.tasks(projectId, { listId: "l2" }))
    );
  });

  it("nests keys so one prefix invalidates a subtree", () => {
    const client = new QueryClient();
    const cache = client.getQueryCache();
    const keys = [
      qk.project(projectId),
      qk.projectMembers(projectId),
      qk.statuses(projectId, "l1"),
      qk.tasks(projectId, { listId: "l1" }),
      qk.task(taskId),
      qk.timeline(taskId),
      qk.projects()
    ];
    for (const queryKey of keys) {
      cache.build(client, { queryKey });
    }
    const matching = (filter: Parameters<typeof matchQuery>[0]) =>
      cache
        .getAll()
        .filter((query) => matchQuery(filter, query))
        .map((query) => query.queryHash);

    // Every task page of the project, nothing else.
    expect(matching({ queryKey: qk.tasks(projectId) })).toEqual([
      hashKey(qk.tasks(projectId, { listId: "l1" }))
    ]);
    // A project prefix covers its members, statuses and tasks but not the sidebar collection.
    expect(matching({ queryKey: qk.project(projectId) })).toHaveLength(4);
    // Exact match targets only the project itself (used for structure events).
    expect(matching({ queryKey: qk.project(projectId), exact: true })).toEqual([
      hashKey(qk.project(projectId))
    ]);
    // Task detail prefix includes its timeline.
    expect(matching({ queryKey: qk.task(taskId) })).toHaveLength(2);
    expect(matching({ queryKey: qk.projects(), exact: true })).toEqual([hashKey(qk.projects())]);
  });

  it("canonicalizes presence and directory keys", () => {
    expect(qk.presence(["b", "a", "b"])).toEqual(["presence", ["a", "b"]]);
    expect(qk.directory({ q: "  An " })).toEqual([
      "directory",
      { q: "An", projectId: null, channelId: null }
    ]);
    expect(qk.statuses(projectId)).toEqual(["project", projectId, "statuses", "*"]);
  });
});
