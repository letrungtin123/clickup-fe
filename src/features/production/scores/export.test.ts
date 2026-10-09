import { describe, expect, it } from "vitest";

import { filenameFromDisposition } from "./export";

describe("filenameFromDisposition", () => {
  it("prefers the RFC 5987 UTF-8 name", () => {
    const header =
      "attachment; filename=\"Bang diem.xlsx\"; filename*=UTF-8''B%E1%BA%A3ng%20%C4%91i%E1%BB%83m%20k%E1%BB%B3%202026-05%20(xu%E1%BA%A5t%202026-10-10).xlsx";
    expect(filenameFromDisposition(header)).toBe("Bảng điểm kỳ 2026-05 (xuất 2026-10-10).xlsx");
  });

  it("falls back to the plain filename", () => {
    expect(filenameFromDisposition('attachment; filename="KPI.xlsx"')).toBe("KPI.xlsx");
    expect(filenameFromDisposition("attachment; filename=KPI.xlsx")).toBe("KPI.xlsx");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A; filename=\"x.xlsx\"")).toBe(
      "x.xlsx"
    );
  });

  it("strips path separators and returns null when missing", () => {
    expect(filenameFromDisposition("attachment; filename=\"../../evil.xlsx\"")).toBe("....evil.xlsx");
    expect(filenameFromDisposition("attachment")).toBeNull();
    expect(filenameFromDisposition(null)).toBeNull();
  });
});
