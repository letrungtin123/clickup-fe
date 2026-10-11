import {
  anomalyKinds,
  fastDoneMinutes,
  type Anomaly,
  type AnomalyKind
} from "@/contracts/production-reports";

import { formatReportValue } from "./format";

/** Look-back window of the Leader dashboard tab (the full page lets you pick 7–180 days). */
export const leaderAnomalyDays = 30;

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

/** Short tab labels (the contract labels are sentences). */
export const anomalyTabLabels: Record<AnomalyKind, string> = {
  QTY_MISMATCH: "Lệch số lượng",
  QC_FAIL_REPEAT: "QC trả lại ≥ 2 lần",
  WORKER_FAIL_RATE: "Tỉ lệ lỗi cao",
  FAST_DONE: "Xong quá nhanh",
  MISSING_CREDIT_RULE: "Thiếu đơn giá"
};

/** Section titles in the wording of the tabs and the user guide (the contract labels say "QC fail"). */
export const anomalyKindTitles: Record<AnomalyKind, string> = {
  QTY_MISMATCH: "Số tấm xong khác số được giao",
  QC_FAIL_REPEAT: "Task bị QC trả lại từ 2 lần",
  WORKER_FAIL_RATE: "Nhân viên có tỉ lệ lỗi cao",
  FAST_DONE: `Báo xong trong ${fastDoneMinutes} phút sau khi giao`,
  MISSING_CREDIT_RULE: "Ghi điểm khi chưa có đơn giá"
};

export const isAnomalyKind = (value: string | null | undefined): value is AnomalyKind =>
  anomalyKinds.includes(value as AnomalyKind);

/** The kind to open first: the requested one, else the first with unreviewed rows. */
export const firstAnomalyKind = (
  counts: Partial<Record<AnomalyKind, number>> | undefined,
  requested?: string | null
): AnomalyKind =>
  isAnomalyKind(requested)
    ? requested
    : (anomalyKinds.find((kind) => (counts?.[kind] ?? 0) > 0) ?? "QTY_MISMATCH");

/** Unreviewed rows over every kind (badge of the Leader dashboard tab). */
export const unreviewedTotal = (counts: Partial<Record<AnomalyKind, number>> | undefined) =>
  anomalyKinds.reduce((sum, kind) => sum + (counts?.[kind] ?? 0), 0);

/**
 * Who may take "Đã xem" back (API: 403 ANOMALY_REVIEW_NOT_OWNER otherwise): the person who marked it,
 * or an ADMIN. Rows not reviewed have nothing to undo.
 */
export const canUndoReview = (
  item: Pick<Anomaly, "reviewed">,
  viewer: { userId: string; isAdmin: boolean }
) => item.reviewed !== null && (viewer.isAdmin || item.reviewed.by?.id === viewer.userId);
