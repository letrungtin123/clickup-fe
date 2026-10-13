import type { KhoanPayPolicy } from "@/contracts/production-catalog";
import type { KpiSettlement } from "@/contracts/production-scores";

import { formatCredit } from "../format";

/**
 * Wording of the Khoán pay policy (PD-033, settings.khoanPayPolicy): the settings page, the settlement
 * screens and the scores pages say the same thing. In both policies "đạt KPI" = official points
 * (Chính thức + OT + QC) ≥ target. Pure, unit tested.
 */

export const khoanPolicyOptions = ["ALWAYS", "IF_KPI"] as const satisfies readonly KhoanPayPolicy[];

export const khoanPolicyMeta: Record<
  KhoanPayPolicy,
  { label: string; short: string; description: string }
> = {
  ALWAYS: {
    label: "Luôn trả tiền Khoán (như Excel)",
    short: "Luôn trả Khoán",
    description: "Đạt hay không đạt KPI đều nhận đủ tiền Khoán; điểm Khoán không tính vào KPI."
  },
  IF_KPI: {
    label: "Chỉ trả khi đạt KPI",
    short: "Trả khi đạt KPI",
    description: "Đạt KPI thì nhận tiền Khoán; chưa đạt thì không có tiền, điểm Khoán được quy về điểm KPI."
  }
};

/** What the close does with Khoán work, as a clause: "… : {rule}." */
export const khoanPolicyRule = (policy: KhoanPayPolicy) =>
  policy === "ALWAYS"
    ? "tiền Khoán luôn được trả, điểm Khoán không quy về điểm KPI"
    : "đủ KPI thì tiền Khoán được trả, thiếu thì điểm Khoán quy về điểm";

/** Hint under "Tiền Khoán tạm tính" while the period runs. */
export const khoanProvisionalHint = (policy: KhoanPayPolicy) =>
  policy === "ALWAYS"
    ? "Luôn được trả khi chốt kỳ, dù đạt KPI hay không; điểm Khoán không tính vào KPI."
    : "Nhận tiền nếu đạt KPI khi chốt kỳ; nếu thiếu sẽ quy về điểm.";

/** How the KPI total of a period is made, for the "KPI 12 kỳ gần nhất" panel. */
export const kpiTotalHint = (policy: KhoanPayPolicy) =>
  policy === "ALWAYS"
    ? "Tổng = điểm chính thức (tiền Khoán luôn được trả, không quy điểm; kỳ chốt theo chính sách cũ có thể có Khoán quy điểm)."
    : "Tổng = điểm chính thức + điểm Khoán quy đổi khi không đạt KPI.";

/** One sentence explaining what a settled period did with the Khoán work (policy of its run). */
export const settlementKhoanSentence = (
  settlement: Pick<
    KpiSettlement,
    "met" | "khoanPolicy" | "khoanCredits" | "khoanPointsConverted" | "totalPoints"
  >
) => {
  if (settlement.khoanPolicy === "ALWAYS") {
    if (settlement.met) return "Đạt KPI. Tiền Khoán luôn được trả và điểm Khoán không cộng vào KPI.";
    return settlement.khoanCredits > 0
      ? "Thiếu KPI nhưng tiền Khoán vẫn được trả đủ (chính sách “Luôn trả tiền Khoán”); điểm Khoán không cộng vào KPI."
      : "Thiếu KPI; kỳ này không có điểm Khoán.";
  }
  if (settlement.met) return "Đủ KPI nên điểm Khoán được trả tiền và không cộng vào KPI.";
  return settlement.khoanPointsConverted > 0
    ? `Thiếu KPI nên ${formatCredit(settlement.khoanPointsConverted)} điểm Khoán được quy về điểm KPI (tổng ${formatCredit(settlement.totalPoints)}); tiền Khoán = 0.`
    : "Thiếu KPI; kỳ này không có điểm Khoán để quy đổi.";
};
