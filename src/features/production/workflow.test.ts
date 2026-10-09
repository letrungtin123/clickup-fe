import { describe, expect, it } from "vitest";

import type { ProductionStatus, StatusTransition } from "@/contracts/production-catalog";

import {
  orderedStatuses,
  statusCodeFrom,
  statusOrderIds,
  toDraftTransitions,
  toTransitionsPayload,
  transitionsChanged,
  validateTransitions,
  type DraftTransition
} from "./workflow";

const status = (id: string, sortOrder: number, active = true): ProductionStatus => ({
  id,
  code: id.toUpperCase(),
  name: id,
  color: "slate",
  sortOrder,
  countsDone: false,
  countsChecked: false,
  isTerminal: false,
  isInitial: false,
  setByRoles: [],
  active
});

const saved: StatusTransition[] = [
  { id: "t1", fromStatusId: "a", toStatusId: "b", actors: ["QC", "ASSIGNEE"], requiresNote: false },
  { id: "t2", fromStatusId: "b", toStatusId: "c", actors: ["SYSTEM"], requiresNote: true }
];

describe("transitions", () => {
  it("round-trips the saved set without reporting a change", () => {
    const drafts = toDraftTransitions(saved);
    expect(drafts[0]?.actors).toEqual(["ASSIGNEE", "QC"]);
    expect(transitionsChanged(drafts, saved)).toBe(false);
    expect(toTransitionsPayload(drafts).transitions).toHaveLength(2);
  });

  it("detects edits, removals and reordering", () => {
    const drafts = toDraftTransitions(saved);
    expect(transitionsChanged([{ ...drafts[0]!, requiresNote: true }, drafts[1]!], saved)).toBe(
      true
    );
    expect(transitionsChanged([drafts[0]!], saved)).toBe(true);
    expect(transitionsChanged([drafts[1]!, drafts[0]!], saved)).toBe(true);
  });

  it("flags same-status, empty-actor and duplicate rows", () => {
    const rows: DraftTransition[] = [
      { key: "1", fromStatusId: "a", toStatusId: "a", actors: ["QC"], requiresNote: false },
      { key: "2", fromStatusId: "a", toStatusId: "b", actors: [], requiresNote: false },
      { key: "3", fromStatusId: "a", toStatusId: "c", actors: ["QC"], requiresNote: false },
      { key: "4", fromStatusId: "a", toStatusId: "c", actors: ["LEADER"], requiresNote: false }
    ];
    expect(validateTransitions(rows)).toEqual({
      "1": "Trạng thái đầu và cuối phải khác nhau.",
      "2": "Chọn ít nhất một người được chuyển.",
      "4": "Luồng chuyển này bị trùng."
    });
  });
});

describe("statuses", () => {
  it("orders active statuses first, then by sort order", () => {
    const list = [status("c", 1, false), status("b", 2), status("a", 1)];
    expect(orderedStatuses(list).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("sends reordered active ids followed by archived ones", () => {
    const list = [status("a", 1), status("b", 2), status("x", 3, false)];
    expect(statusOrderIds([list[1]!, list[0]!], list)).toEqual(["b", "a", "x"]);
  });

  it("derives a code from a Vietnamese name", () => {
    expect(statusCodeFrom("Chờ QC")).toBe("CHO_QC");
    expect(statusCodeFrom("Đã giao khách")).toBe("DA_GIAO_KHACH");
    expect(statusCodeFrom("2 lần")).toBe("LAN");
  });
});
