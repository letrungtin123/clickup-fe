import { describe, expect, it } from "vitest";

import {
  activeOverviewPreset,
  agoLabel,
  assignJobLabel,
  barDetail,
  barFocus,
  barRatio,
  dateTimeLabel,
  durationLabel,
  filterJobs,
  groupByProject,
  isTaskMode,
  jobDeadline,
  jobFlags,
  jobMetaLine,
  lastWeeks,
  longDayLabel,
  needItemsOf,
  needsScopeLanding,
  noFilter,
  overviewFilterFromSearch,
  overviewFilterToSearch,
  overviewLandingPath,
  overviewQuery,
  overviewRangeOf,
  overviewScopeOf,
  overviewScopeToSearch,
  overviewSubtitle,
  overviewTimeFromSearch,
  overviewTimeToSearch,
  projectFlags,
  riskLabel,
  staleLabel,
  stuckChips,
  subMenuOf,
  taskDeadline,
  timeDescription,
  timeLeft,
  toggleCard,
  toggleFilter,
  updatedAgo
} from "./model";
import { CHECKER, job, overviewOf, projectAxp, projectBrx, projectCqz, task, TZ } from "./test-fixtures";

// PD-080 — Overview V2 page state and figures. Obviously fake ids, codes and names (public repository).

const now = new Date("2026-10-22T03:00:00.000Z");
const search = (value: string) => new URLSearchParams(value);

describe("landing (PD-080)", () => {
  it("Leader / Account / Quản trị / Director see the Overview; Staff and QC go to Việc của tôi", () => {
    for (const roles of [["LEADER"], ["ACCOUNT"], ["ADMIN"], ["DIRECTOR"], ["STAFF", "LEADER"]] as const) {
      expect(overviewLandingPath(roles)).toBeNull();
    }
    for (const roles of [["STAFF"], ["QC"], ["STAFF", "QC"], []] as const) {
      expect(overviewLandingPath(roles)).toBe("/production/my-overview");
    }
  });
});

describe("time (PD-080)", () => {
  it("no parameter = Hôm nay; Tuần này / Tháng này are their days; anything else is Tùy chọn", () => {
    const today = "2026-10-22";
    expect(overviewTimeFromSearch(search(""))).toEqual({ kind: "today" });
    const week = overviewTimeFromSearch(search("from=2026-10-19&to=2026-10-25"));
    expect(activeOverviewPreset(week, today)).toBe("week");
    expect(activeOverviewPreset(overviewTimeFromSearch(search("from=2026-10-01&to=2026-10-31")), today)).toBe("month");
    expect(activeOverviewPreset(overviewTimeFromSearch(search("from=2026-10-05&to=2026-10-09")), today)).toBeNull();
    expect(overviewRangeOf({ kind: "today" }, today)).toEqual({ from: today, to: today });
  });

  it("puts a reversed range in order and keeps the last 92 days of a longer one", () => {
    expect(overviewTimeFromSearch(search("from=2026-10-25&to=2026-10-19"))).toEqual({ kind: "range", from: "2026-10-19", to: "2026-10-25" });
    expect(overviewTimeFromSearch(search("from=2026-01-01&to=2026-10-22"))).toEqual({ kind: "range", from: "2026-07-23", to: "2026-10-22" });
    expect(overviewTimeFromSearch(search("from=2026-10-22"))).toEqual({ kind: "range", from: "2026-10-22", to: "2026-10-22" });
  });

  it("writes the time into the URL, keeping other parameters (Hôm nay = no days)", () => {
    const next = overviewTimeToSearch({ kind: "range", from: "2026-10-19", to: "2026-10-25" }, search("scope=mine&card=done"));
    expect(next.toString()).toBe("scope=mine&card=done&from=2026-10-19&to=2026-10-25");
    expect(overviewTimeToSearch({ kind: "today" }, next).toString()).toBe("scope=mine&card=done");
  });

  it("says what is shown, with counts and the update time", () => {
    const today = "2026-10-22";
    expect(timeDescription({ kind: "today" }, today)).toBe("Hôm nay, 22/10 · đến hạn hôm nay + trễ từ trước");
    expect(timeDescription({ kind: "range", from: "2026-10-19", to: "2026-10-25" }, today)).toBe(
      "Tuần này, 19/10 – 25/10 · đến hạn trong tuần + trễ từ trước"
    );
    expect(timeDescription({ kind: "range", from: "2026-10-01", to: "2026-10-31" }, today)).toBe(
      "Tháng này, 10/2026 · đến hạn trong tháng + trễ từ trước"
    );
    expect(timeDescription({ kind: "range", from: "2026-10-05", to: "2026-10-09" }, today)).toBe(
      "05/10 – 09/10 · đến hạn trong khoảng + trễ từ trước"
    );
    const overview = overviewOf([job(), job({ project: projectBrx }), job()]);
    expect(overviewSubtitle({ kind: "today" }, overview)).toBe(
      "Hôm nay, 22/10 · đến hạn hôm nay + trễ từ trước · 3 Job Code · 2 Project · cập nhật 10:00"
    );
    expect(longDayLabel("2026-10-22")).toBe("Thứ Năm, 22/10/2026");
  });

  it("the At risk history defaults to the last 8 weeks from a Monday", () => {
    expect(lastWeeks("2026-10-22")).toEqual({ from: "2026-08-31", to: "2026-10-22" });
    expect(lastWeeks("2026-10-19", 1)).toEqual({ from: "2026-10-19", to: "2026-10-19" });
  });
});

describe("scope (PD-080)", () => {
  const me = "me-id";
  it("a Leader defaults to Project của tôi; Quản trị / Director / Account to Tất cả; without the switch always Tất cả", () => {
    expect(overviewScopeOf(search(""), ["LEADER"], me)).toBe("mine");
    expect(overviewScopeOf(search(""), ["ADMIN"], me)).toBe("all");
    expect(overviewScopeOf(search(""), ["LEADER", "ACCOUNT"], me)).toBe("all");
    expect(overviewScopeOf(search(""), ["ACCOUNT"], me)).toBe("all");
    expect(overviewScopeOf(search("scope=mine"), ["ACCOUNT"], me)).toBe("all");
    expect(overviewScopeOf(search("scope=all"), ["LEADER"], me)).toBe("all");
    expect(overviewScopeOf(search("scope=mine"), ["ADMIN"], me)).toBe("mine");
  });

  it("an older ?leader= link is read once (my id → mine)", () => {
    expect(overviewScopeOf(search(`leader=${me}`), ["LEADER"], me)).toBe("mine");
    expect(overviewScopeOf(search("leader=all"), ["LEADER"], me)).toBe("all");
    expect(overviewScopeToSearch("mine", search(`leader=${me}&from=2026-10-01`)).toString()).toBe("from=2026-10-01&scope=mine");
  });

  it("the landing scope is written only for holders of the switch", () => {
    expect(needsScopeLanding(search(""), ["LEADER"])).toBe(true);
    expect(needsScopeLanding(search("scope=all"), ["LEADER"])).toBe(false);
    expect(needsScopeLanding(search(""), ["ACCOUNT"])).toBe(false);
    expect(needsScopeLanding(search(""), ["DIRECTOR"])).toBe(false);
  });

  it("asks the API with the scope always explicit", () => {
    expect(overviewQuery({ from: "2026-10-22", to: "2026-10-22" }, "all")).toEqual({ from: "2026-10-22", to: "2026-10-22", scope: "all" });
  });
});

describe("filters (PD-080)", () => {
  const assigned = task("ASSIGNED");
  const waiting = task("WAITING_QC", { qcWait: { since: "2026-10-21T08:00:00.000Z", minutes: 150, alert: true } });
  const waitingShort = task("WAITING_QC", { qcWait: { since: "2026-10-22T02:30:00.000Z", minutes: 30, alert: false } });
  const checked = task("CHECKED");
  const late = task("PROCESSING", { overdue: true, images: 7 });
  const jobA = job({ tasks: [assigned, waiting, checked] });
  const jobB = job({ tasks: [late, waitingShort], phase: "FEEDBACK" });
  const jobC = job({ tasks: [], noTasks: true, totalImages: 40, newNotSplit: true });
  const jobD = job({ tasks: [], noTasks: true, totalImages: 15 });
  const jobE = job({ tasks: [task("CHECKED")], phase: "READY", clientLate: true });
  const jobs = [jobA, jobB, jobC, jobD, jobE];

  it("URL ↔ filter: unknown cards fall back to Tổng", () => {
    expect(overviewFilterFromSearch(search("card=inProgress&sub=WAITING_QC"))).toEqual({ card: "inProgress", sub: "WAITING_QC" });
    expect(overviewFilterFromSearch(search("card=nope"))).toEqual(noFilter);
    expect(overviewFilterToSearch({ card: "overdue", sub: "client" }, search("scope=mine")).toString()).toBe("scope=mine&card=overdue&sub=client");
    expect(overviewFilterToSearch(noFilter, search("card=done&scope=all")).toString()).toBe("scope=all");
  });

  it("a card is a filter: click = that card, click again = Tổng; a Needs-you item toggles too", () => {
    expect(toggleCard(noFilter, "done")).toEqual({ card: "done", sub: null });
    expect(toggleCard({ card: "done", sub: "CHECKED" }, "done")).toEqual(noFilter);
    expect(toggleCard({ card: "done", sub: null }, "inProgress")).toEqual({ card: "inProgress", sub: null });
    const item = { card: "total" as const, sub: "READY" };
    expect(toggleFilter(noFilter, item)).toEqual(item);
    expect(toggleFilter(item, item)).toEqual(noFilter);
  });

  it("Tổng › phase keeps the jobs of that phase; Chưa chia = jobs without tasks (› mới chưa chia = the Account's)", () => {
    expect(filterJobs(jobs, noFilter)).toHaveLength(5);
    expect(filterJobs(jobs, { card: "total", sub: "FEEDBACK" }).map((row) => row.job.id)).toEqual([jobB.id]);
    expect(filterJobs(jobs, { card: "total", sub: "READY" }).map((row) => row.job.id)).toEqual([jobE.id]);
    expect(filterJobs(jobs, { card: "unassigned", sub: null }).map((row) => row.job.id)).toEqual([jobC.id, jobD.id]);
    expect(filterJobs(jobs, { card: "unassigned", sub: "newNotSplit" }).map((row) => row.job.id)).toEqual([jobC.id]);
  });

  it("Đang làm / Xong list only the matching lines under each job (+ the dropdown status, + Chờ QC quá 2h)", () => {
    const inProgress = filterJobs(jobs, { card: "inProgress", sub: null });
    expect(inProgress.map((row) => [row.job.id, row.tasks.map((item) => item.id)])).toEqual([
      [jobA.id, [assigned.id, waiting.id]],
      [jobB.id, [late.id, waitingShort.id]]
    ]);
    expect(filterJobs(jobs, { card: "inProgress", sub: "WAITING_QC" }).flatMap((row) => row.tasks.map((item) => item.id))).toEqual([
      waiting.id,
      waitingShort.id
    ]);
    expect(filterJobs(jobs, { card: "inProgress", sub: "qcAlert" }).flatMap((row) => row.tasks.map((item) => item.id))).toEqual([waiting.id]);
    expect(filterJobs(jobs, { card: "done", sub: "CHECKED" }).map((row) => row.job.id)).toEqual([jobA.id, jobE.id]);
    expect(isTaskMode({ card: "inProgress", sub: null })).toBe(true);
    expect(isTaskMode({ card: "done", sub: "CHECKED" })).toBe(true);
    expect(isTaskMode({ card: "overdue", sub: null })).toBe(true);
    expect(isTaskMode({ card: "overdue", sub: "client" })).toBe(false);
    expect(isTaskMode({ card: "unassigned", sub: null })).toBe(false);
  });

  it("Trễ = overdue lines + client-late jobs; › Task trễ / › Trễ khách", () => {
    expect(filterJobs(jobs, { card: "overdue", sub: null }).map((row) => [row.job.id, row.tasks.length])).toEqual([
      [jobB.id, 1],
      [jobE.id, 0]
    ]);
    expect(filterJobs(jobs, { card: "overdue", sub: "task" }).map((row) => row.job.id)).toEqual([jobB.id]);
    expect(filterJobs(jobs, { card: "overdue", sub: "client" }).map((row) => row.job.id)).toEqual([jobE.id]);
  });

  it("At risk and Không cập nhật (Needs you only)", () => {
    const risky = job({ risk: { reason: "UNASSIGNED", since: "2026-10-22T02:00:00.000Z", workHours: 0, capacityHours: 0, hoursLeft: 4, people: 0, evaluatedAt: "2026-10-22T02:45:00.000Z" } });
    const idle = job({ stale: { minutes: 130, reason: "IDLE" } });
    expect(filterJobs([risky, idle, jobA], { card: "risk", sub: null }).map((row) => row.job.id)).toEqual([risky.id]);
    expect(filterJobs([risky, idle, jobA], { card: "stale", sub: null }).map((row) => row.job.id)).toEqual([idle.id]);
  });

  it("the dropdown of each card counts over the shown jobs (Đang giao / Đã giao only when present)", () => {
    const overview = overviewOf(jobs);
    const total = subMenuOf(overview, "total")!;
    expect(total.all).toBe(5);
    expect(total.options.map((option) => [option.key, option.count])).toEqual([
      ["NEW", 0],
      ["IN_PROGRESS", 3],
      ["FEEDBACK", 1],
      ["READY", 1],
      ["COMPLETE", 0]
    ]);
    const progress = subMenuOf(overview, "inProgress")!;
    expect(progress.all).toBe(4);
    expect(progress.options.map((option) => [option.label, option.count])).toEqual([
      ["Mới giao", 1],
      ["Đang làm", 1],
      ["Cần sửa lại", 0],
      ["Chờ QC", 2],
      ["Đang check", 0],
      ["Feedback", 0],
      ["Chờ QC quá 2h", 1]
    ]);
    expect(subMenuOf(overview, "done")!.options.map((option) => [option.label, option.count])).toEqual([
      ["Đã check", 2],
      ["Complete", 0]
    ]);
    expect(subMenuOf(overview, "overdue")).toEqual({
      title: "Loại",
      all: 2,
      options: [
        { key: "task", label: "Task trễ", count: 1 },
        { key: "client", label: "Trễ khách", count: 1 }
      ]
    });
    expect(subMenuOf(overview, "unassigned")).toBeNull();
    const delivered = overviewOf([job({ phase: "DELIVERED" })]);
    expect(subMenuOf(delivered, "total")!.options.map((option) => option.key)).toContain("DELIVERED");
    expect(subMenuOf(delivered, "total")!.options.map((option) => option.key)).not.toContain("DELIVERING");
  });
});

describe("Cần bạn xử lý (PD-080)", () => {
  it("Leader items with their filters; zero items hidden", () => {
    const items = needItemsOf(
      overviewOf([], {
        leaderNeeds: { atRisk: 2, unassignedJobs: 0, qcWaitImages: 40, feedbackJobs: 1, readyJobs: 3, staleJobs: 1 },
        accountNeeds: null
      })
    );
    expect(items.map((item) => `${item.count} ${item.label}`)).toEqual([
      "2 job At risk",
      "40 tấm chờ QC quá 2h",
      "1 job Feedback của khách",
      "3 job sẵn sàng Complete",
      "1 job không cập nhật 2h+"
    ]);
    expect(items.map((item) => item.filter)).toEqual([
      { card: "risk", sub: null },
      { card: "inProgress", sub: "qcAlert" },
      { card: "total", sub: "FEEDBACK" },
      { card: "total", sub: "READY" },
      { card: "stale", sub: null }
    ]);
  });

  it("Account items (sẵn sàng giao, At risk, trễ khách, mới chưa chia) — no Leader items", () => {
    const items = needItemsOf(
      overviewOf([], {
        leaderNeeds: null,
        accountNeeds: { readyToDeliver: 2, atRisk: 1, clientLate: 3, newNotSplit: 1 },
        clock: { coreStart: "09:30", coreEnd: "16:30", alertHours: 1.5 }
      })
    );
    expect(items.map((item) => `${item.count} ${item.label}`)).toEqual([
      "2 job sẵn sàng giao",
      "1 job At risk",
      "3 job trễ khách",
      "1 job mới chưa chia 1,5h+"
    ]);
    expect(items.map((item) => item.filter)).toEqual([
      { card: "total", sub: "COMPLETE" },
      { card: "risk", sub: null },
      { card: "overdue", sub: "client" },
      { card: "unassigned", sub: "newNotSplit" }
    ]);
  });

  it("both sets (Leader + Account): At risk shown once; nothing at all → no items", () => {
    const items = needItemsOf(
      overviewOf([], {
        leaderNeeds: { atRisk: 2, unassignedJobs: 1, qcWaitImages: 0, feedbackJobs: 0, readyJobs: 0, staleJobs: 0 },
        accountNeeds: { readyToDeliver: 0, atRisk: 2, clientLate: 0, newNotSplit: 0 }
      })
    );
    expect(items.map((item) => item.key)).toEqual(["atRisk", "unassigned"]);
    expect(
      needItemsOf(
        overviewOf([], {
          leaderNeeds: { atRisk: 0, unassignedJobs: 0, qcWaitImages: 0, feedbackJobs: 0, readyJobs: 0, staleJobs: 0 },
          accountNeeds: null
        })
      )
    ).toEqual([]);
  });
});

describe("table (PD-080)", () => {
  it("groups by project, the most urgent project first; inside client-late first, then the soonest deadline", () => {
    const axpLater = job({ project: projectAxp, deadline: "2026-10-23T10:00:00.000Z", code: "A-2" });
    const axpLate = job({ project: projectAxp, deadline: "2026-10-20T10:00:00.000Z", clientLate: true, code: "A-1" });
    const brxSoon = job({ project: projectBrx, deadline: "2026-10-22T05:00:00.000Z", code: "B-1" });
    const cqz = job({ project: projectCqz, deadline: "2026-10-24T05:00:00.000Z", noTasks: true, code: "C-1", totalImages: 30, images: { done: 0, inProgress: 0, unassigned: 30, total: 30 } });
    const all = [axpLater, brxSoon, cqz, axpLate];
    const groups = groupByProject(filterJobs(all, noFilter), all);
    expect(groups.map((group) => group.project.code)).toEqual(["AXP", "BRX", "CQZ"]);
    expect(groups[0]!.rows.map((row) => row.job.code)).toEqual(["A-1", "A-2"]);
    expect(groups[0]!.clientLateJobs).toBe(1);
    expect(groups[2]!.noTaskJobs.map((item) => item.code)).toEqual(["C-1"]);
    expect(groups[2]!.bar).toEqual({ done: 0, inProgress: 0, unassigned: 30, total: 30 });
    // The project row's figures cover every shown job of the project, whatever the filter.
    const filtered = groupByProject(filterJobs(all, { card: "overdue", sub: "client" }), all);
    expect(filtered.map((group) => [group.project.code, group.rows.length, group.jobs.length])).toEqual([["AXP", 1, 2]]);
  });

  it("PD-082: jobs already handed to the client go after the open ones (their old deadline is not urgent)", () => {
    const shipped = job({ project: projectAxp, deadline: "2026-10-18T10:00:00.000Z", phase: "DELIVERED", code: "A-0" });
    const shipping = job({ project: projectAxp, deadline: "2026-10-19T10:00:00.000Z", phase: "DELIVERING", code: "A-00" });
    const open = job({ project: projectAxp, deadline: "2026-10-23T10:00:00.000Z", code: "A-1" });
    const onlyShipped = job({ project: projectBrx, deadline: "2026-10-17T10:00:00.000Z", phase: "DELIVERED", code: "B-0" });
    const all = [shipped, shipping, open, onlyShipped];
    const groups = groupByProject(filterJobs(all, noFilter), all);
    expect(groups.map((group) => [group.project.code, group.rows.map((row) => row.job.code)])).toEqual([
      ["AXP", ["A-1", "A-0", "A-00"]],
      ["BRX", ["B-0"]]
    ]);
    expect(groups[0]!.nextDeadline).toBe(open.deadline);
    expect(groups[1]!.openJobs).toBe(0);
  });

  it("bar focus / ratio / detail", () => {
    const bar = { done: 20, inProgress: 9, unassigned: 10, total: 39 };
    expect(barFocus({ card: "done", sub: null })).toBe("done");
    expect(barFocus({ card: "unassigned", sub: null })).toBe("unassigned");
    expect(barFocus(noFilter)).toBeNull();
    expect(barRatio(bar, null)).toBe("20 / 39");
    expect(barRatio(bar, "inProgress")).toBe("9 / 39");
    expect(barDetail(bar)).toBe("xong 20 · đang làm 9 · chưa chia 10");
    expect(barDetail({ done: 0, inProgress: 5, unassigned: 0, total: 5 })).toBe("đang làm 5");
  });

  it("'Đang kẹt ở đâu' chips", () => {
    const longWait = task("WAITING_QC", { images: 20, qcWait: { since: "2026-10-21T08:00:00.000Z", minutes: 180, alert: true } });
    const leaveWait = task("WAITING_QC", { images: 5, qc: CHECKER, qcOnLeave: true, qcWait: { since: "2026-10-22T02:50:00.000Z", minutes: 10, alert: true } });
    const rework = task("REWORK", { images: 4, overdue: true });
    const chips = stuckChips(job({ tasks: [longWait, leaveWait, rework], images: { done: 0, inProgress: 29, unassigned: 6, total: 35 } }), 2);
    expect(chips.map((chip) => chip.label)).toEqual([
      "25 tấm ở QC · chờ 3h",
      "QC đang nghỉ — đổi QC",
      "4 tấm cần sửa lại",
      "1 task trễ",
      "6 tấm chưa chia"
    ]);
    expect(stuckChips(job({ noTasks: true, totalImages: 60 }), 2).map((chip) => chip.label)).toEqual(["Chưa chia · 60 tấm"]);
    expect(stuckChips(job({ phase: "FEEDBACK" }), 2).map((chip) => chip.label)).toEqual(["Feedback của khách"]);
    expect(stuckChips(job({ phase: "READY" }), 2).map((chip) => chip.label)).toEqual(["Đã check đủ, chờ Complete"]);
    expect(stuckChips(job({ phase: "COMPLETE" }), 2).map((chip) => chip.label)).toEqual(["Complete · chờ Account giao"]);
    // A short wait is not mentioned.
    expect(stuckChips(job({ tasks: [task("WAITING_QC", { images: 8, qcWait: { since: NOW, minutes: 20, alert: false } })] }), 2)[0]!.label).toBe("8 tấm ở QC");
  });
});

const NOW = "2026-10-22T03:00:00.000Z";

describe("words (PD-080)", () => {
  it("time left: red when late, orange within 24 h", () => {
    expect(timeLeft("2026-10-22T06:55:00.000Z", now)).toEqual({ label: "còn 3h 55m", tone: "warning" });
    expect(timeLeft("2026-10-21T13:00:00.000Z", now)).toEqual({ label: "trễ 14h", tone: "danger" });
    expect(timeLeft("2026-10-24T06:00:00.000Z", now)).toEqual({ label: "còn 2 ngày 3h", tone: "muted" });
    expect(timeLeft("2026-11-01T03:00:00.000Z", now)).toEqual({ label: "còn 10 ngày", tone: "muted" });
    expect(durationLabel(45)).toBe("45m");
    expect(durationLabel(120)).toBe("2h");
  });

  it("dates, last update, stale and At risk wording", () => {
    expect(dateTimeLabel("2026-10-22T10:00:00.000Z", TZ)).toBe("22/10 17:00");
    expect(updatedAgo("2026-10-22T02:35:00.000Z", now)).toBe("Cập nhật 25 phút trước");
    expect(updatedAgo("2026-10-22T02:59:40.000Z", now)).toBe("Cập nhật vừa xong");
    expect(updatedAgo("2026-10-21T23:00:00.000Z", now)).toBe("Cập nhật 4 giờ trước");
    expect(staleLabel({ minutes: 130, reason: "IDLE" }, 2)).toBe("Không cập nhật 2h+");
    expect(staleLabel({ minutes: 10, reason: "STAFF_ON_LEAVE" }, 2)).toBe("Nhân viên đang nghỉ");
    expect(staleLabel(null, 2)).toBeNull();
    expect(riskLabel({ reason: "CAPACITY", workHours: 12.5, capacityHours: 7, people: 2 })).toBe("At risk · cần ~12,5h, còn 7h (2 người)");
    expect(riskLabel({ reason: "UNASSIGNED", workHours: 0, capacityHours: 0, people: 0 })).toBe("At risk · chưa ai được giao");
    expect(assignJobLabel({ code: "AXP-01", totalImages: 120, deadline: "2026-10-22T10:00:00.000Z" }, TZ)).toBe("AXP-01 — 120 tấm · hạn 22/10 17:00");
  });

  it("PD-082: one deadline wording — Trễ / Còn; a job with the client is never late; a task Done / waiting for QC", () => {
    const late = { deadline: "2026-10-21T13:00:00.000Z", clientLate: true, phase: "IN_PROGRESS" as const };
    expect(jobDeadline(late, now)).toEqual({ kind: "late", label: "Trễ 14h", tone: "danger", title: "Trễ deadline khách 14h" });
    expect(jobDeadline({ ...late, deadline: "2026-10-22T06:55:00.000Z", clientLate: false }, now)).toMatchObject({ label: "Còn 3h 55m", tone: "warning" });
    expect(jobDeadline({ ...late, deadline: "2026-10-24T06:00:00.000Z", clientLate: false }, now)).toMatchObject({ label: "Còn 2 ngày 3h", tone: "muted" });
    // The PD-082 bug: "Đã giao khách" 4 days after its deadline read "trễ 4 ngày" in red.
    expect(jobDeadline({ deadline: "2026-10-17T16:59:00.000Z", clientLate: false, phase: "DELIVERED" }, now)).toEqual({
      kind: "delivered",
      label: "Đã giao",
      tone: "done",
      title: "Đã giao khách"
    });
    expect(jobDeadline({ deadline: "2026-10-17T16:59:00.000Z", clientLate: false, phase: "DELIVERING" }, now)).toMatchObject({ label: "Đang giao", tone: "done" });

    const line = { deadline: "2026-10-22T01:00:00.000Z", overdue: true, group: "IN_PROGRESS" as const, qcWait: null };
    expect(taskDeadline(line, now)).toMatchObject({ kind: "late", label: "Trễ 2h", tone: "danger" });
    expect(taskDeadline({ ...line, overdue: false, deadline: "2026-10-22T05:00:00.000Z" }, now)).toMatchObject({ label: "Còn 2h", tone: "warning" });
    expect(taskDeadline({ ...line, overdue: false, group: "DONE" }, now)).toMatchObject({ kind: "done", label: "Đã xong" });
    expect(
      taskDeadline({ ...line, overdue: false, qcWait: { since: "2026-10-21T08:00:00.000Z", minutes: 150, alert: true } }, now)
    ).toEqual({ kind: "qc", label: "Chờ QC 2h 30m", tone: "warning", title: "Chờ QC 2h 30m (tính trong giờ lõi)" });
  });

  it("PD-082: the job's second line and the last update", () => {
    expect(agoLabel("2026-10-22T02:35:00.000Z", now)).toBe("25 phút trước");
    expect(agoLabel("2026-10-22T02:59:40.000Z", now)).toBe("vừa xong");
    expect(jobMetaLine({ leader: CHECKER, receivedAt: "2026-10-21T01:00:00.000Z", lastActivityAt: "2026-10-21T23:00:00.000Z" }, now, TZ)).toBe(
      "Leader Kiểm Tra Ba · nhận 21/10 · cập nhật 4 giờ trước"
    );
    expect(jobMetaLine({ leader: null, receivedAt: "2026-10-21T01:00:00.000Z", lastActivityAt: NOW }, now, TZ)).toBe(
      "Chưa có Leader · nhận 21/10 · cập nhật vừa xong"
    );
  });

  it("PD-082: flags of a row, most severe first (At risk, danger, warning, info, feedback, muted, success)", () => {
    const risky = job({
      phase: "FEEDBACK",
      tasks: [task("WAITING_QC", { images: 8, qcWait: { since: NOW, minutes: 20, alert: false } }), task("PROCESSING", { overdue: true })],
      stale: { minutes: 130, reason: "IDLE" },
      risk: { reason: "UNASSIGNED", since: NOW, workHours: 0, capacityHours: 0, hoursLeft: 4, people: 0, evaluatedAt: NOW }
    });
    expect(jobFlags(risky, 2).map((flag) => [flag.key, flag.label, flag.tone])).toEqual([
      ["risk", "At risk", "risk"],
      ["late", "1 task trễ", "danger"],
      ["stale", "Không cập nhật 2h+", "warning"],
      ["qc", "8 tấm ở QC", "info"],
      ["feedback", "Feedback của khách", "feedback"]
    ]);
    expect(jobFlags(risky, 2)[0]!.detail).toBe("At risk · chưa ai được giao");
    expect(jobFlags(job({ stale: { minutes: 5, reason: "STAFF_ON_LEAVE" }, noTasks: true, totalImages: 0 }), 2).map((flag) => [flag.key, flag.tone])).toEqual([
      ["staffLeave", "warning"],
      ["noTasks", "muted"]
    ]);
    expect(projectFlags({ clientLateJobs: 2, noTaskJobs: [job(), job()] }).map((flag) => flag.label)).toEqual([
      "2 job trễ khách",
      "2 Job Code chưa chia"
    ]);
    expect(projectFlags({ clientLateJobs: 0, noTaskJobs: [] })).toEqual([]);
  });
});
