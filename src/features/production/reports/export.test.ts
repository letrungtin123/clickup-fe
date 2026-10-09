import { describe, expect, it } from "vitest";

import { filenameFromDisposition, sanitizeFileName, withXlsxExtension } from "./export";

describe("filenameFromDisposition", () => {
  it("prefers the RFC 5987 UTF-8 name", () => {
    const header =
      "attachment; filename=\"Bao cao (xuat 2026-10-10).xlsx\"; filename*=UTF-8''B%C3%A1o%20c%C3%A1o%20%C4%91i%E1%BB%83m%20(xu%E1%BA%A5t%202026-10-10).xlsx";
    expect(filenameFromDisposition(header)).toBe("Báo cáo điểm (xuất 2026-10-10).xlsx");
  });

  it("accepts lowercase charsets, quotes and ISO-8859-1", () => {
    expect(
      filenameFromDisposition("attachment; filename*=utf-8''Danh%20s%C3%A1ch%20job.xlsx")
    ).toBe("Danh sách job.xlsx");
    expect(filenameFromDisposition("attachment; filename*=\"UTF-8''a%20b.xlsx\"")).toBe("a b.xlsx");
    expect(filenameFromDisposition("attachment; filename*=iso-8859-1'en'caf%E9.xlsx")).toBe(
      "café.xlsx"
    );
  });

  it("falls back to the plain filename, quoted or not", () => {
    expect(filenameFromDisposition('attachment; filename="KPI 2026-05.xlsx"')).toBe(
      "KPI 2026-05.xlsx"
    );
    expect(filenameFromDisposition("attachment; filename=jobs.xlsx")).toBe("jobs.xlsx");
    expect(
      filenameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A; filename=\"safe.xlsx\"")
    ).toBe("safe.xlsx");
  });

  it("strips path separators and control characters", () => {
    expect(filenameFromDisposition("attachment; filename*=UTF-8''..%2F..%2Fetc%2Fpasswd")).toBe(
      "....etcpasswd"
    );
    expect(filenameFromDisposition('attachment; filename="a\\\\b:c.xlsx"')).toBe("abc.xlsx");
  });

  it("returns null when nothing usable is present", () => {
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition("attachment")).toBeNull();
    expect(filenameFromDisposition('attachment; filename=""')).toBeNull();
  });
});

describe("file names", () => {
  it("sanitizes and adds the extension once", () => {
    expect(sanitizeFileName('  Báo/cáo: "Tháng 5"  ')).toBe("Báocáo Tháng 5");
    expect(withXlsxExtension("Báo cáo")).toBe("Báo cáo.xlsx");
    expect(withXlsxExtension("report.XLSX")).toBe("report.XLSX");
  });
});
