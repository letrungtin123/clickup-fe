import { describe, expect, it } from "vitest";

import type { KnowledgeCategory } from "@/contracts/knowledge";

import { purgeCountdown, restoreDestination, trashCategoryLabel, trashReasonMode } from "./trash-view";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

const category = (n: number, name: string, parent: number | null = null): KnowledgeCategory => ({
  id: id(n),
  parentId: parent === null ? null : id(parent),
  name,
  rank: `a${n}`,
  itemCount: 0
});

const categories = [category(1, "Quy trình"), category(2, "Retouch", 1)];

describe("purge countdown", () => {
  const now = new Date("2026-10-11T08:00:00Z");

  it("rounds days up", () => {
    expect(purgeCountdown("2026-11-10T08:00:00Z", now)).toEqual({ label: "Tự xoá vĩnh viễn sau 30 ngày", urgent: false });
    expect(purgeCountdown("2026-10-15T07:00:00Z", now)).toEqual({ label: "Tự xoá vĩnh viễn sau 4 ngày", urgent: false });
    expect(purgeCountdown("2026-10-13T09:00:00Z", now)).toEqual({ label: "Tự xoá vĩnh viễn sau 3 ngày", urgent: true });
  });

  it("switches to hours on the last day", () => {
    expect(purgeCountdown("2026-10-11T13:30:00Z", now)).toEqual({ label: "Tự xoá vĩnh viễn sau 6 giờ", urgent: true });
    expect(purgeCountdown("2026-10-11T07:00:00Z", now)).toEqual({ label: "Sắp tự xoá vĩnh viễn", urgent: true });
  });
});

describe("trash categories", () => {
  it("labels the original category", () => {
    expect(trashCategoryLabel(categories, id(2))).toBe("Quy trình › Retouch");
    expect(trashCategoryLabel(categories, null)).toBe("Chưa phân loại");
    expect(trashCategoryLabel(categories, id(9))).toBeNull();
  });

  it("says where a restore goes", () => {
    expect(restoreDestination(categories, id(1))).toBe("chuyên mục “Quy trình”");
    expect(restoreDestination(categories, null)).toBe("phần Chưa phân loại của kho");
    expect(restoreDestination(categories, id(9))).toBe("kho (chuyên mục cũ không còn)");
  });
});

describe("trash reasons", () => {
  it("requires a reason for critical items", () => {
    expect(trashReasonMode("restore", "critical")).toBe("required");
    expect(trashReasonMode("purge", "critical")).toBe("required");
  });

  it("keeps other items light", () => {
    expect(trashReasonMode("restore", "important")).toBe("none");
    expect(trashReasonMode("purge", "normal")).toBe("optional");
  });

  it("follows the server when it insists", () => {
    expect(trashReasonMode("restore", "normal", true)).toBe("required");
  });
});
