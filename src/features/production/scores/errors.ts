import { isApiError } from "@/lib/api/errors";

import { productionErrorMessage } from "../errors";

/**
 * Vietnamese copy for the score / KPI / leave API codes (BE scores, kpi-targets, kpi-settlement and
 * leave services). Unknown codes fall back to the production map, then the shared one.
 */
const messages: Record<string, string> = {
  SCORES_PRIVATE: "Bạn không có quyền xem điểm của người khác.",
  SCORE_USER_NOT_FOUND: "Không tìm thấy nhân viên này trong Photo Retouch.",
  INVALID_RANGE: "Khoảng thời gian không hợp lệ.",
  KPI_PERIOD_INVALID:
    "KPI quý phải bắt đầu từ kỳ tháng 1, 4, 7 hoặc 10; KPI năm bắt đầu từ kỳ tháng 1.",
  KPI_TARGET_NOT_FOUND: "KPI này không còn tồn tại. Hãy tải lại.",
  KPI_PERIOD_NOT_STARTED: "Kỳ này chưa bắt đầu, chưa thể chốt KPI.",
  MEMBER_NOT_FOUND: "Không tìm thấy thành viên.",
  LEAVE_NOT_FOUND: "Không tìm thấy đơn nghỉ. Có thể đơn đã bị xóa.",
  LEAVE_OVERLAP: "Bạn đã có đơn nghỉ (đang chờ duyệt hoặc đã duyệt) trùng thời gian này.",
  LEAVE_NOT_PENDING: "Đơn nghỉ này đã được xử lý.",
  LEAVE_ALREADY_STARTED:
    "Đơn nghỉ đã diễn ra nên không thể hủy — chỉ hủy được đơn nghỉ từ ngày mai trở đi.",
  LEAVE_NOT_CANCELLABLE: "Đơn nghỉ này đã bị từ chối hoặc đã hủy.",
  LEAVE_DATE_INVALID: "Ngày nghỉ không hợp lệ.",
  LEAVE_RANGE_INVALID: "Ngày kết thúc phải sau hoặc trùng ngày bắt đầu.",
  LEAVE_HALF_DAY_RANGE: "Nghỉ nửa ngày chỉ áp dụng cho đơn nghỉ trong một ngày.",
  // Fallback; the server names the limit ("Chỉ xuất được tối đa 366 ngày mỗi lần.", PD-057).
  LEAVE_WINDOW_TOO_LONG: "Khoảng ngày quá dài.",
  CUSTOM_FIELDS_FORBIDDEN: "Chỉ Quản trị lọc được theo trường tùy chỉnh hoặc tag của nhân viên.",
  CUSTOM_FIELD_FILTER_INVALID:
    "Bộ lọc nhân viên không còn hợp lệ (trường hoặc lựa chọn đã đổi). Hãy bỏ lọc rồi chọn lại."
};

/** Codes whose server message carries details (limits, the field at fault): kept verbatim. */
const serverWorded = new Set([
  "LEAVE_TOO_LONG",
  "LEAVE_TOO_OLD",
  "LEAVE_TOO_FAR",
  "LEAVE_WINDOW_TOO_LONG",
  "CUSTOM_FIELD_FILTER_INVALID"
]);

export const scoreErrorMessage = (error: unknown, fallback?: string) => {
  if (isApiError(error)) {
    if (serverWorded.has(error.code) && error.message) return error.message;
    const message = messages[error.code];
    if (message) return message;
  }
  return productionErrorMessage(error, { fallback });
};
