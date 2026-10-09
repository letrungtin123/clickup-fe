import { fastDoneMinutes, type AnomalyKind } from "@/contracts/production-reports";

import { formatReportValue } from "./format";

/** Plain-words explanation of each anomaly kind (tab intro and empty state). */
export const anomalyDescriptions: Record<AnomalyKind, (threshold: number) => string> = {
  QTY_MISMATCH: () => "Task đã xong nhưng số tấm xong khác số được giao — kèm ai nhập số hiện tại.",
  QC_FAIL_REPEAT: () => "Task bị QC trả lại từ 2 lần trở lên.",
  WORKER_FAIL_RATE: (threshold) =>
    `Nhân viên có tỉ lệ FB sai hoặc tỉ lệ QC trả lại cao hơn ngưỡng ${formatReportValue(threshold, "percent")} trên các task đã xong trong khoảng xem.`,
  FAST_DONE: () =>
    `Task báo xong trong vòng ${fastDoneMinutes} phút sau khi được giao — có thể bấm nhầm hoặc bấm sớm.`,
  MISSING_CREDIT_RULE: () =>
    "Điểm được ghi khi dự án × quy trình chưa có đơn giá, nên được 0 điểm. Hãy bổ sung đơn giá."
};
