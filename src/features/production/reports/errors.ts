import { toast } from "sonner";

import { isApiError } from "@/lib/api/errors";

import { productionErrorMessage } from "../errors";

/**
 * Vietnamese copy for the Phase 5 API codes (reports, saved reports, dashboards, anomalies, exports).
 * The server already words most of them in Vietnamese; unknown codes fall back to the module map.
 */
const messages: Record<string, string> = {
  REPORT_INVALID: "Cấu hình báo cáo không hợp lệ. Hãy kiểm tra lại chiều và chỉ số.",
  INVALID_RANGE: "Khoảng ngày không hợp lệ (tối đa 366 ngày).",
  REPORT_TIMEOUT: "Báo cáo chạy quá lâu. Hãy thu hẹp khoảng ngày hoặc thêm bộ lọc.",
  MONEY_FORBIDDEN: "Chỉ Quản trị được xem tiền khoán.",
  SCORES_PRIVATE:
    "Bảng điểm đang để riêng tư nên không xem được điểm theo từng người, từng job hay tag.",
  REPORT_NOT_FOUND: "Không tìm thấy báo cáo đã lưu. Có thể báo cáo đã bị xoá.",
  REPORT_CONFIG_OUTDATED: "Cấu hình báo cáo đã cũ, không còn chạy được. Hãy tạo lại.",
  ANOMALY_NOT_FOUND: "Không tìm thấy mục bất thường này. Hãy tải lại."
};

/** Codes whose server message is already user-facing Vietnamese. */
const serverWorded = new Set([
  "FORBIDDEN",
  "INVALID_RANGE",
  "REPORT_TIMEOUT",
  "SCORES_PRIVATE",
  "MONEY_FORBIDDEN"
]);

export const reportErrorMessage = (error: unknown, fallback?: string) => {
  if (isApiError(error)) {
    if (serverWorded.has(error.code) && /[À-ỹ]/.test(error.message)) return error.message;
    const message = messages[error.code];
    if (message) return message;
  }
  return productionErrorMessage(error, { fallback });
};

export const toastReportError = (error: unknown, fallback?: string) => {
  toast.error(reportErrorMessage(error, fallback));
};
