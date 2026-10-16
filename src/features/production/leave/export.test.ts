import { describe, expect, it } from "vitest";

import { LeaveExportQuerySchema } from "@/contracts/production-leave";
import { ApiError } from "@/lib/api/errors";

import {
  LEAVE_EXPORT_FORBIDDEN,
  leaveExportErrorMessage,
  leaveExportFallbackName,
  leaveExportQuery,
  leaveExportScope,
  leaveExportUrl
} from "./export";
import { leaveFilterWindow } from "./range";

// PD-057 — "Xuất Excel" of the Lịch nghỉ page. Fake ids only (the repository is public).
const teamId = "00000000-0000-4000-8000-000000000123";

describe("leave export URL", () => {
  it("exports the shown month from its first to its last day", () => {
    const span = leaveFilterWindow({ mode: "month", month: "2026-02" });
    expect(span).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(span && leaveExportUrl(span, null)).toBe(
      "/production/leave/export?from=2026-02-01&to=2026-02-28"
    );
    const leap = leaveFilterWindow({ mode: "month", month: "2028-02" });
    expect(leap && leaveExportUrl(leap, null)).toBe(
      "/production/leave/export?from=2028-02-01&to=2028-02-29"
    );
  });

  it("exports the chosen range, with the team filter when set", () => {
    const span = leaveFilterWindow({ mode: "range", from: "2026-09-26", to: "2026-10-25" });
    expect(span && leaveExportUrl(span, teamId)).toBe(
      `/production/leave/export?from=2026-09-26&to=2026-10-25&teamId=${teamId}`
    );
    expect(span && leaveExportQuery(span, null)).toEqual({
      from: "2026-09-26",
      to: "2026-10-25",
      teamId: undefined
    });
    // The query is what the server's LeaveExportQuerySchema accepts.
    expect(
      LeaveExportQuerySchema.safeParse({ from: "2026-09-26", to: "2026-10-25", teamId }).success
    ).toBe(true);
  });

  it("has nothing to export while the range is invalid", () => {
    expect(leaveFilterWindow({ mode: "range", from: "2026-10-25", to: "2026-09-26" })).toBeNull();
    expect(leaveExportScope(null)).toBe("Chọn khoảng ngày hợp lệ để xuất");
    expect(leaveExportScope({ from: "2026-10-01", to: "2026-10-31" })).toBe(
      "Xuất 01/10 – 31/10/2026"
    );
  });

  it("names the file after the window when the server sends no name", () => {
    expect(leaveExportFallbackName({ from: "2026-10-01", to: "2026-10-31" })).toBe(
      "cham-cong-nghi-phep_2026-10-01_2026-10-31.xlsx"
    );
  });
});

describe("leave export errors", () => {
  it("maps any 403 to the Quản trị-only message", () => {
    const forbidden = new ApiError({ status: 403, code: "FORBIDDEN", message: "Forbidden" });
    expect(leaveExportErrorMessage(forbidden)).toBe(LEAVE_EXPORT_FORBIDDEN);
    expect(LEAVE_EXPORT_FORBIDDEN).toBe(
      "Bạn không có quyền Duyệt lịch nghỉ nên không xuất được bảng chấm công nghỉ phép."
    );
  });

  it("keeps the server's wording of the window limit, the leave copy for other codes", () => {
    const tooLong = new ApiError({
      status: 400,
      code: "LEAVE_WINDOW_TOO_LONG",
      message: "Chỉ xuất được tối đa 366 ngày mỗi lần."
    });
    expect(leaveExportErrorMessage(tooLong)).toBe("Chỉ xuất được tối đa 366 ngày mỗi lần.");
    const reversed = new ApiError({ status: 400, code: "LEAVE_RANGE_INVALID", message: "x" });
    expect(leaveExportErrorMessage(reversed)).toBe(
      "Ngày kết thúc phải sau hoặc trùng ngày bắt đầu."
    );
    const network = new Error("offline");
    expect(leaveExportErrorMessage(network)).toBe(
      "Không xuất được bảng chấm công nghỉ phép. Thử lại sau."
    );
  });
});
