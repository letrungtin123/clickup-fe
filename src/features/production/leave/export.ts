import { buildQueryString, type QueryValue } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";

import { scoreErrorMessage } from "../scores/errors";
import { downloadExport } from "../scores/export";
import { formatLeaveDates } from "./calendar";
import type { LeaveWindow } from "./range";

/**
 * "Xuất Excel" of the Lịch nghỉ page (PD-057): GET /production/leave/export?from&to[&teamId], ADMIN
 * only. The workbook is the payroll attendance sheet (approved requests only) plus one line per
 * request (part of day, reason, approver). Downloaded with the session like the score exports.
 */

export const LEAVE_EXPORT_PATH = "/production/leave/export";

export const LEAVE_EXPORT_HINT =
  "Bảng chấm công (chỉ đơn đã duyệt) + chi tiết từng đơn: buổi nghỉ, lý do, người duyệt.";

export const LEAVE_EXPORT_FORBIDDEN =
  "Bạn không có quyền Duyệt lịch nghỉ nên không xuất được bảng chấm công nghỉ phép.";

/** What the button will export, e.g. "Xuất 01/10 – 31/10/2026". */
export const leaveExportScope = (span: LeaveWindow | null) =>
  span ? `Xuất ${formatLeaveDates(span.from, span.to)}` : "Chọn khoảng ngày hợp lệ để xuất";

/** Query of the export: the filter's days plus the team filter (omitted for "Tất cả team"). */
export const leaveExportQuery = (
  span: LeaveWindow,
  teamId: string | null
): Record<string, QueryValue> => ({ from: span.from, to: span.to, teamId: teamId ?? undefined });

/** Relative URL of the export (what the browser requests, after the API base URL). */
export const leaveExportUrl = (span: LeaveWindow, teamId: string | null) =>
  `${LEAVE_EXPORT_PATH}${buildQueryString(leaveExportQuery(span, teamId))}`;

/** File name when the server sends none: cham-cong-nghi-phep_2026-10-01_2026-10-31.xlsx. */
export const leaveExportFallbackName = (span: LeaveWindow) =>
  `cham-cong-nghi-phep_${span.from}_${span.to}.xlsx`;

/** Toast copy for a failed export; a 403 is always the "Quản trị only" message. */
export const leaveExportErrorMessage = (error: unknown) =>
  isApiError(error) && error.status === 403
    ? LEAVE_EXPORT_FORBIDDEN
    : scoreErrorMessage(error, "Không xuất được bảng chấm công nghỉ phép. Thử lại sau.");

/** Downloads the workbook; resolves with the saved file name, throws ApiError on failure. */
export const downloadLeaveExport = (span: LeaveWindow, teamId: string | null) =>
  downloadExport(LEAVE_EXPORT_PATH, leaveExportQuery(span, teamId), leaveExportFallbackName(span));
