import { describe, expect, it } from "vitest";

import {
  agoText,
  deadlineHint,
  doneOptionOf,
  filterMyTasks,
  formatClockMinutes,
  imagesText,
  myOverviewFilterFromSearch,
  myOverviewFilterToSearch,
  myOverviewRangeOf,
  myOverviewRangeText,
  myOverviewTimeFromSearch,
  myOverviewTimeToSearch,
  myTaskActions,
  needItems,
  parseDoneQty,
  qcRowActions,
  qcTimeText,
  tagCards,
  toggleTag,
  withQcText
} from "./model";
import {
  NOW,
  TZ,
  lineOf,
  option,
  overviewOf,
  qcLineOf,
  sampleLines,
  sampleQcLines,
  statuses,
  taskOf,
  withMoves
} from "./test-fixtures";

// PD-081 — "Tổng quan của tôi" page model. Obviously fake ids, codes and names (public repository).
const now = new Date(NOW);
const statusList = Object.values(statuses);

describe("time filter (PD-081)", () => {
  it("Hôm nay by default; Tuần này Monday – Sunday; Tháng này the calendar month; Tùy chọn at most 92 days", () => {
    expect(myOverviewRangeOf({ key: "today", from: null, to: null }, "2026-10-22")).toEqual({
      from: "2026-10-22",
      to: "2026-10-22"
    });
    expect(myOverviewRangeOf({ key: "week", from: null, to: null }, "2026-10-22")).toEqual({
      from: "2026-10-19",
      to: "2026-10-25"
    });
    expect(myOverviewRangeOf({ key: "week", from: null, to: null }, "2026-10-25")).toEqual({
      from: "2026-10-19",
      to: "2026-10-25"
    });
    expect(myOverviewRangeOf({ key: "month", from: null, to: null }, "2026-02-10")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28"
    });
    expect(
      myOverviewRangeOf({ key: "custom", from: "2026-10-05", to: "2026-10-02" }, "2026-10-22")
    ).toEqual({ from: "2026-10-02", to: "2026-10-05" });
    // A longer link keeps its last 92 days.
    expect(
      myOverviewRangeOf({ key: "custom", from: "2026-01-01", to: "2026-10-22" }, "2026-10-22")
    ).toEqual({ from: "2026-07-23", to: "2026-10-22" });
  });

  it("lives in the URL (?range=week|month|custom&from=&to=), keeping the other parameters", () => {
    expect(myOverviewTimeFromSearch(new URLSearchParams(""))).toEqual({
      key: "today",
      from: null,
      to: null
    });
    expect(myOverviewTimeFromSearch(new URLSearchParams("range=week"))).toEqual({
      key: "week",
      from: null,
      to: null
    });
    expect(
      myOverviewTimeFromSearch(new URLSearchParams("range=custom&from=2026-10-02&to=2026-10-05"))
    ).toEqual({
      key: "custom",
      from: "2026-10-02",
      to: "2026-10-05"
    });
    expect(myOverviewTimeFromSearch(new URLSearchParams("range=custom&from=2026-02-31")).key).toBe(
      "today"
    );
    const next = myOverviewTimeToSearch(
      { key: "custom", from: "2026-10-02", to: "2026-10-05" },
      new URLSearchParams("tag=late&ptask=x")
    );
    expect(next.toString()).toBe("tag=late&ptask=x&range=custom&from=2026-10-02&to=2026-10-05");
    expect(myOverviewTimeToSearch({ key: "today", from: null, to: null }, next).toString()).toBe(
      "tag=late&ptask=x"
    );
  });

  it("the header says what the list holds", () => {
    expect(
      myOverviewRangeText(
        { key: "today", from: null, to: null },
        { from: "2026-10-22", to: "2026-10-22" },
        "2026-10-22"
      )
    ).toBe("Hôm nay, 22/10 · đến hạn hôm nay + task trễ và bị trả sửa từ trước");
    expect(
      myOverviewRangeText(
        { key: "week", from: null, to: null },
        { from: "2026-10-19", to: "2026-10-25" },
        "2026-10-22"
      )
    ).toBe("Tuần này, 19/10 – 25/10 · đến hạn trong khoảng + task trễ và bị trả sửa từ trước");
    expect(
      myOverviewRangeText(
        { key: "month", from: null, to: null },
        { from: "2026-10-01", to: "2026-10-31" },
        "2026-10-22"
      )
    ).toContain("Tháng 10/2026");
  });
});

describe("tags and filters (PD-081)", () => {
  const lines = sampleLines();
  const all = Object.values(lines);

  it("a tag filters the list; the same tag again (or Bỏ lọc) goes back to Việc của tôi; status within the tag", () => {
    expect(filterMyTasks(all, { tag: "mine", statusId: null })).toHaveLength(6);
    expect(
      filterMyTasks(all, { tag: "inProgress", statusId: null }).map((line) => line.task.code)
    ).toEqual(["1303", "1302", "1361", "1362", "1312"]);
    expect(
      filterMyTasks(all, { tag: "done", statusId: null }).map((line) => line.task.code)
    ).toEqual(["1355"]);
    expect(
      filterMyTasks(all, { tag: "late", statusId: null }).map((line) => line.task.code)
    ).toEqual(["1303", "1302"]);
    expect(
      filterMyTasks(all, { tag: "inProgress", statusId: statuses.ASSIGNED.id }).map(
        (line) => line.task.code
      )
    ).toEqual(["1302", "1362"]);
    expect(filterMyTasks(all, { tag: "qc", statusId: null })).toEqual([]);
    expect(toggleTag({ tag: "mine", statusId: null }, "late")).toEqual({
      tag: "late",
      statusId: null
    });
    expect(toggleTag({ tag: "late", statusId: statuses.ASSIGNED.id }, "late")).toEqual({
      tag: "mine",
      statusId: null
    });
  });

  it("the filter lives in the URL; the QC tag only for holders of QC", () => {
    expect(myOverviewFilterFromSearch(new URLSearchParams("tag=late&status=s1"), false)).toEqual({
      tag: "late",
      statusId: "s1"
    });
    expect(myOverviewFilterFromSearch(new URLSearchParams("tag=qc&status=s1"), true)).toEqual({
      tag: "qc",
      statusId: null
    });
    expect(myOverviewFilterFromSearch(new URLSearchParams("tag=qc"), false)).toEqual({
      tag: "mine",
      statusId: null
    });
    expect(myOverviewFilterFromSearch(new URLSearchParams("tag=nope"), true)).toEqual({
      tag: "mine",
      statusId: null
    });
    expect(
      myOverviewFilterToSearch(
        { tag: "inProgress", statusId: "s2" },
        new URLSearchParams("range=week")
      ).toString()
    ).toBe("range=week&tag=inProgress&status=s2");
    expect(
      myOverviewFilterToSearch(
        { tag: "mine", statusId: null },
        new URLSearchParams("range=week&tag=late&status=s")
      ).toString()
    ).toBe("range=week");
  });

  it("tags in their fixed order, the QC tag 3rd for QC holders; Trễ in red only when > 0", () => {
    const staff = tagCards(overviewOf(all));
    expect(staff.map((card) => card.key)).toEqual(["mine", "inProgress", "done", "late"]);
    expect(staff.find((card) => card.key === "late")).toMatchObject({
      count: 2,
      strong: true,
      sub: "Quá hạn task"
    });
    expect(staff.find((card) => card.key === "done")).toMatchObject({
      count: 1,
      sub: "8 tấm · được tính điểm"
    });
    const qc = tagCards(overviewOf(all, { qc: sampleQcLines() }));
    expect(qc.map((card) => card.key)).toEqual(["mine", "inProgress", "qc", "done", "late"]);
    expect(qc[2]).toMatchObject({ count: 3, sub: "lâu nhất 2h 15m" });
    expect(tagCards(overviewOf([lines.checked])).find((card) => card.key === "late")).toMatchObject(
      { count: 0, strong: false }
    );
  });

  it("Cần bạn xử lý: items with a count only, each leading to its filter; the QC item with its 'quá 2h'", () => {
    const items = needItems(overviewOf(all, { qc: sampleQcLines() }));
    expect(items.map((item) => item.text)).toEqual([
      "1 task bị QC trả sửa",
      "2 task trễ",
      "2 task đến hạn trong 3h",
      "3 task chờ bạn QC (1 quá 2h)"
    ]);
    expect(items[0]!.filter).toEqual({ tag: "inProgress", statusId: statuses.REWORK.id });
    expect(items[1]!.filter).toEqual({ tag: "late", statusId: null });
    expect(items[2]!.filter).toEqual({ tag: "inProgress", statusId: null });
    expect(items[3]!.filter).toEqual({ tag: "qc", statusId: null });
    expect(needItems(overviewOf([lines.checked]))).toEqual([]);
  });
});

describe("wording (PD-081)", () => {
  const lines = sampleLines();

  it("deadline hints: late in days or hours, core time left when ≤ 3h, tomorrow, done", () => {
    expect(deadlineHint(lines.rework, now, TZ)).toEqual({ text: "Trễ · 2 ngày", tone: "danger" });
    expect(deadlineHint(lines.late, now, TZ)).toEqual({ text: "Trễ · 1 ngày", tone: "danger" });
    const lateToday = lineOf(taskOf(80, "PROCESSING", { deadline: "2026-10-22T06:50:00.000Z" }), {
      late: true
    });
    expect(deadlineHint(lateToday, now, TZ)).toEqual({ text: "Trễ · 2h 10m", tone: "danger" });
    expect(deadlineHint(lines.doing, now, TZ)).toEqual({ text: "còn 30m", tone: "warning" });
    expect(deadlineHint({ ...lines.doing, dueCoreMinutes: 130 }, now, TZ)).toEqual({
      text: "còn 2h 10m",
      tone: "warning"
    });
    expect(deadlineHint({ ...lines.doing, dueCoreMinutes: 0 }, now, TZ)).toEqual({
      text: "đến hạn ngay",
      tone: "warning"
    });
    const tomorrow = lineOf(taskOf(81, "ASSIGNED", { deadline: "2026-10-23T10:00:00.000Z" }));
    expect(deadlineHint(tomorrow, now, TZ)).toEqual({ text: "Ngày mai", tone: "muted" });
    expect(
      deadlineHint(
        lineOf(taskOf(82, "ASSIGNED", { deadline: "2026-10-26T10:00:00.000Z" })),
        now,
        TZ
      ).text
    ).toBe("còn 4 ngày");
    expect(deadlineHint(lines.checked, now, TZ)).toEqual({
      text: "Xong · đã qua QC",
      tone: "success"
    });
    expect(deadlineHint(lines.waiting, now, TZ)).toEqual({
      text: "Done đúng hạn",
      tone: "success"
    });
  });

  it("images: '— / 25 tấm' while open (a line sent back too), 'xong / giao' once Done", () => {
    expect(imagesText(lines.doing)).toBe("— / 25 tấm");
    expect(imagesText(lines.rework)).toBe("— / 4 tấm");
    expect(imagesText(lines.waiting)).toBe("20 / 20 tấm");
    expect(imagesText({ ...lines.doing, images: { assigned: null, done: null } })).toBe(
      "— / chưa có số lượng"
    );
  });

  it("my lines with QC: 'Done 11:05 · đang chờ QC 3h'", () => {
    expect(withQcText(lines.waiting, TZ, "2026-10-22")).toBe("Done 11:05 · đang chờ QC 3h");
    const checking = {
      ...lines.waiting,
      task: taskOf(13, "QC_CHECKING", { doneAt: "2026-10-21T04:05:00.000Z" }),
      lastDoneAt: "2026-10-21T04:05:00.000Z"
    };
    expect(withQcText(checking, TZ, "2026-10-22")).toBe("Done 21/10 11:05 · QC đang check");
  });

  it("the QC queue: 'Chờ 2h 15m' (orange from 2h of core time) or 'Bạn bắt đầu check 10 phút trước'", () => {
    const [long, fresh, checking] = sampleQcLines();
    expect(qcTimeText(long!, now)).toEqual({ text: "Chờ 2h 15m", tone: "warning" });
    expect(qcTimeText(fresh!, now)).toEqual({ text: "Chờ 20m", tone: "muted" });
    expect(qcTimeText(checking!, now)).toEqual({
      text: "Bạn bắt đầu check 10 phút trước",
      tone: "muted"
    });
    expect(qcTimeText(qcLineOf(taskOf(90, "WAITING_QC"), { waitMinutes: 0 }), now).text).toBe(
      "Vừa vào chờ QC"
    );
    expect(formatClockMinutes(45)).toBe("45m");
    expect(formatClockMinutes(180)).toBe("3h");
    expect(agoText("2026-10-22T08:59:40.000Z", now)).toBe("vừa xong");
    expect(agoText("2026-10-20T09:00:00.000Z", now)).toBe("2 ngày trước");
  });
});

describe("quick actions (PD-081)", () => {
  it("Mới giao → Bắt đầu; Đang làm → Done; Cần sửa lại → Done through Đang làm; nothing invented", () => {
    expect(myTaskActions(withMoves(taskOf(1, "ASSIGNED"), "PROCESSING"), statusList)).toEqual({
      start: option("PROCESSING"),
      done: null
    });
    expect(myTaskActions(withMoves(taskOf(2, "PROCESSING"), "DONE"), statusList)).toEqual({
      start: null,
      done: { option: option("DONE"), via: null }
    });
    expect(myTaskActions(withMoves(taskOf(3, "REWORK"), "PROCESSING"), statusList)).toEqual({
      start: null,
      done: { option: null, via: option("PROCESSING") }
    });
    // No move offered (someone else's line, archived job, a subtask, Chờ QC): no button.
    expect(myTaskActions(taskOf(4, "PROCESSING"), statusList)).toEqual({ start: null, done: null });
    expect(
      myTaskActions(withMoves(taskOf(5, "PROCESSING", { jobArchived: true }), "DONE"), statusList)
    ).toEqual({ start: null, done: null });
    expect(
      myTaskActions(withMoves(taskOf(6, "PROCESSING", { isSubtask: true }), "DONE"), statusList)
    ).toEqual({ start: null, done: null });
    expect(myTaskActions(taskOf(7, "WAITING_QC"), statusList)).toEqual({ start: null, done: null });
    expect(doneOptionOf(withMoves(taskOf(8, "PROCESSING"), "DONE"), statusList)).toEqual(
      option("DONE")
    );
  });

  it("Số ảnh xong: required whole number; ≥ 1 without a quantity (PD-058); at most the SEC2-03 cap", () => {
    const task = taskOf(1, "PROCESSING", { qtyAssigned: 25 });
    expect(parseDoneQty("25", task)).toEqual({ value: 25 });
    expect(parseDoneQty(" 0 ", task)).toEqual({ value: 0 });
    expect(parseDoneQty("", task)).toEqual({ error: "Nhập số ảnh xong." });
    expect(parseDoneQty("2,5", task)).toEqual({ error: "Số ảnh xong phải là số nguyên ≥ 0." });
    expect(parseDoneQty("51", task)).toEqual({
      error: "Tối đa 50 cho 25 tấm được giao — báo Leader nếu làm nhiều hơn."
    });
    const empty = taskOf(2, "PROCESSING", { qtyAssigned: null });
    expect(parseDoneQty("0", empty)).toEqual({
      error: "Task chưa có số lượng — nhập số ảnh xong (≥ 1)."
    });
    expect(parseDoneQty("120", empty)).toEqual({ value: 120 });
  });

  it("QC rows: Chờ QC → Bắt đầu check only; Đang check → Đạt and Trả sửa", () => {
    const [waiting, , checking] = sampleQcLines();
    expect(qcRowActions(waiting!.task, statusList)).toEqual({
      start: option("QC_CHECKING"),
      pass: null,
      fail: null
    });
    expect(qcRowActions(checking!.task, statusList)).toEqual({
      start: null,
      pass: option("CHECKED"),
      fail: option("REWORK", { requiresNote: true })
    });
  });
});
