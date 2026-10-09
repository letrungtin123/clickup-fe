import { isApiError } from "@/lib/api/errors";

import { productionErrorMessage } from "../errors";

/**
 * Vietnamese copy for the score / KPI / leave API codes (BE scores, kpi-targets, kpi-settlement and
 * leave services). Unknown codes fall back to the production map, then the shared one.
 */
const messages: Record<string, string> = {
  SCORES_PRIVATE: "Bảng điểm chung đang để riêng tư.",
  INVALID_RANGE: "Khoảng thời gian không hợp lệ.",
  KPI_PERIOD_INVALID:
    "KPI quý phải bắt đầu từ kỳ tháng 1, 4, 7 hoặc 10; KPI năm bắt đầu từ kỳ tháng 1.",
  KPI_TARGET_NOT_FOUND: "KPI này không còn tồn tại. Hãy tải lại.",
  KPI_PERIOD_NOT_STARTED: "Kỳ này chưa bắt đầu, chưa thể chốt KPI.",
  MEMBER_NOT_FOUND: "Không tìm thấy thành viên.",
  LEAVE_NOT_FOUND: "Không tìm thấy đơn nghỉ. Có thể đơn đã bị xóa.",
  LEAVE_OVERLAP: "Bạn đã có đơn nghỉ (đang chờ duyệt hoặc đã duyệt) trùng thời gian này.",
  LEAVE_SELF_DECISION: "Bạn không thể tự duyệt đơn nghỉ của chính mình.",
  LEAVE_NOT_PENDING: "Đơn nghỉ này đã được xử lý.",
  LEAVE_ALREADY_STARTED: "Đơn nghỉ đã bắt đầu nên không thể tự hủy. Vui lòng liên hệ Quản trị.",
  LEAVE_NOT_CANCELLABLE: "Đơn nghỉ này đã bị từ chối hoặc đã hủy.",
  LEAVE_DATE_INVALID: "Ngày nghỉ không hợp lệ.",
  LEAVE_RANGE_INVALID: "Ngày kết thúc phải sau hoặc trùng ngày bắt đầu.",
  LEAVE_HALF_DAY_RANGE: "Nghỉ nửa ngày chỉ áp dụng cho đơn nghỉ trong một ngày.",
  LEAVE_WINDOW_TOO_LONG: "Khoảng ngày xem lịch quá dài."
};

/** Codes whose server message carries numbers from the limits (kept verbatim). */
const serverWorded = new Set(["LEAVE_TOO_LONG", "LEAVE_TOO_OLD", "LEAVE_TOO_FAR"]);

export const scoreErrorMessage = (error: unknown, fallback?: string) => {
  if (isApiError(error)) {
    if (serverWorded.has(error.code) && error.message) return error.message;
    const message = messages[error.code];
    if (message) return message;
  }
  return productionErrorMessage(error, { fallback });
};

/** The board is private for this user (settings.scoresPublic off and not ADMIN). */
export const isScoresPrivate = (error: unknown) =>
  isApiError(error) && (error.code === "SCORES_PRIVATE" || error.status === 403);
