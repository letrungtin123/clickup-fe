import { describe, expect, it } from "vitest";

import {
  canSeeJob,
  canSeeTask,
  flattenPages,
  isFinishedStatus,
  jobDeadlineCountdown,
  pagedCountLabel,
  taskAgenda
} from "./jobs-model";

// Obviously fake ids (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VN = "Asia/Ho_Chi_Minh";

const statuses = [
  { id: id(1), code: "PROCESSING", sortOrder: 2, isTerminal: false },
  { id: id(2), code: "CHECKED", sortOrder: 5, isTerminal: false },
  { id: id(3), code: "COMPLETE", sortOrder: 6, isTerminal: false },
  { id: id(4), code: "DELIVERING", sortOrder: 7, isTerminal: false },
  { id: id(5), code: "FEEDBACK", sortOrder: 8, isTerminal: false },
  { id: id(6), code: "DELIVERED", sortOrder: 9, isTerminal: true }
];
const ref = (n: number, code: string) => ({ id: id(n), code });

describe("finished jobs (BUG-PR-26)", () => {
  it("treats Complete and later statuses as finished, like the API", () => {
    expect(isFinishedStatus(ref(1, "PROCESSING"), statuses)).toBe(false);
    expect(isFinishedStatus(ref(2, "CHECKED"), statuses)).toBe(false);
    expect(isFinishedStatus(ref(3, "COMPLETE"), statuses)).toBe(true);
    expect(isFinishedStatus(ref(6, "DELIVERED"), statuses)).toBe(true);
    expect(isFinishedStatus(null, statuses)).toBe(false);
    // Workflow not loaded: the default codes decide.
    expect(isFinishedStatus(ref(4, "DELIVERING"), [])).toBe(true);
    expect(isFinishedStatus(ref(1, "PROCESSING"), [])).toBe(false);
  });

  it("drops the countdown once the job is complete, unless client feedback is open", () => {
    const now = new Date("2026-10-10T03:00:00.000Z");
    const job = { deadline: "2026-10-10T10:00:00.000Z", openFeedbackCount: 0 };
    const status = (n: number, code: string) => ({
      ...ref(n, code),
      name: code,
      color: "blue" as const
    });
    expect(
      jobDeadlineCountdown({ ...job, status: status(1, "PROCESSING") }, statuses, now)
    ).toEqual({
      late: false,
      label: "còn 7 giờ"
    });
    expect(
      jobDeadlineCountdown({ ...job, status: status(6, "DELIVERED") }, statuses, now)
    ).toBeNull();
    expect(
      jobDeadlineCountdown({ ...job, status: status(3, "COMPLETE") }, statuses, now)
    ).toBeNull();
    expect(
      jobDeadlineCountdown(
        { ...job, openFeedbackCount: 1, status: status(5, "FEEDBACK") },
        statuses,
        now
      )?.label
    ).toBe("còn 7 giờ");
  });
});

describe("who may be mentioned", () => {
  const task = { assignee: { id: id(10) }, qc: { id: id(11) } };
  it("limits task mentions to people who can read the task", () => {
    expect(canSeeTask(id(10), ["STAFF"], task)).toBe(true);
    expect(canSeeTask(id(11), ["QC"], task)).toBe(true);
    expect(canSeeTask(id(12), ["LEADER"], task)).toBe(true);
    expect(canSeeTask(id(13), ["ACCOUNT"], task)).toBe(true);
    expect(canSeeTask(id(14), ["ADMIN"], task)).toBe(true);
    // Another worker or QC of the job does not see this task.
    expect(canSeeTask(id(15), ["STAFF"], task)).toBe(false);
    expect(canSeeTask(id(16), ["QC"], task)).toBe(false);
    // Roles unknown (the caller cannot list members): only the task's own people.
    expect(canSeeTask(id(15), undefined, task)).toBe(false);
    expect(canSeeTask(id(17), undefined, task, id(17))).toBe(true);
    expect(canSeeTask(id(10), ["STAFF"], { ...task, qc: null })).toBe(true);
  });

  it("limits job mentions to its leader, people on its tasks and managers", () => {
    const job = { leader: { id: id(20) }, tasks: [task] };
    expect(canSeeJob(id(20), ["LEADER"], job)).toBe(true);
    expect(canSeeJob(id(10), ["STAFF"], job)).toBe(true);
    expect(canSeeJob(id(11), ["QC"], job)).toBe(true);
    expect(canSeeJob(id(13), ["ACCOUNT"], job)).toBe(true);
    expect(canSeeJob(id(15), ["STAFF", "QC"], job)).toBe(false);
  });
});

describe("paging (BUG-PR-18)", () => {
  it("flattens pages in order without duplicates", () => {
    const pages = [{ items: [{ id: "a" }, { id: "b" }] }, { items: [{ id: "b" }, { id: "c" }] }];
    expect(flattenPages(pages).map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(flattenPages(undefined)).toEqual([]);
  });

  it("says whether the list is complete", () => {
    expect(pagedCountLabel(200, true)).toBe("Đang hiện 200 task đầu (theo deadline)");
    expect(pagedCountLabel(1234, false)).toBe("Tất cả 1.234 task");
  });
});

describe("overview agenda (BUG-PR-21)", () => {
  const now = new Date("2026-10-10T03:00:00.000Z"); // 10:00 in Ho Chi Minh City
  const task = (
    n: number,
    deadline: string,
    extra: { isLate?: boolean; doneAt?: string } = {}
  ) => ({
    id: id(n),
    deadline,
    isLate: extra.isLate ?? false,
    doneAt: extra.doneAt ?? null
  });

  it("counts late and due-today work and lists late tasks first, done ones last", () => {
    const tasks = [
      task(1, "2026-10-12T10:00:00.000Z"),
      task(2, "2026-10-10T10:00:00.000Z"), // today 17:00
      task(3, "2026-10-09T10:00:00.000Z"), // overdue
      task(4, "2026-10-01T10:00:00.000Z", { doneAt: "2026-10-01T09:00:00.000Z" }), // done, waiting
      task(5, "2026-10-10T16:30:00.000Z") // 23:30 today
    ];
    const agenda = taskAgenda(tasks, VN, now);
    expect(agenda.open).toBe(5);
    expect(agenda.todo).toBe(4);
    expect(agenda.late).toBe(1);
    expect(agenda.dueToday).toBe(2);
    expect(agenda.next.map((item) => item.id)).toEqual([id(3), id(2), id(5), id(1), id(4)]);
    expect(taskAgenda(tasks, VN, now, 2).next).toHaveLength(2);
  });
});
