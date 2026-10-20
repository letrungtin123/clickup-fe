import type { KhoanPayPolicy } from "@/contracts/production-catalog";
import type { KhoanTopUp, KpiSettlement } from "@/contracts/production-scores";

import { formatMoney, formatNumber } from "../format";

/**
 * Khoán wording (PD-066): Khoán is money only — a task on a Khoán shift earns money, the points equivalent stays
 * internal. At the KPI close one rule applies, TOP_UP ("thiếu bao nhiêu bù bấy nhiêu"): a shortfall against the KPI is
 * topped up from the Khoán work and the Khoán money is paid for what is left. Runs made before PD-066 keep their
 * recorded policy (ALWAYS / IF_KPI, PD-033) and are worded after it. Pure, unit tested.
 */

/** Labels of the rule a settlement run used (run history, "Kết quả chốt"). */
export const khoanPolicyMeta: Record<
  KhoanPayPolicy,
  { label: string; short: string; description: string }
> = {
  TOP_UP: {
    label: "Thiếu bao nhiêu bù bấy nhiêu",
    short: "Bù KPI từ Khoán",
    description:
      "Thiếu KPI bao nhiêu điểm thì lấy Khoán bù bấy nhiêu; tiền Khoán trả cho phần còn lại."
  },
  ALWAYS: {
    label: "Luôn trả tiền Khoán (chính sách cũ)",
    short: "Luôn trả Khoán (cũ)",
    description: "Chính sách trước PD-066: luôn trả đủ tiền Khoán, Khoán không bù KPI."
  },
  IF_KPI: {
    label: "Chỉ trả khi đạt KPI (chính sách cũ)",
    short: "Trả khi đạt KPI (cũ)",
    description:
      "Chính sách trước PD-066: đạt KPI thì trả tiền Khoán; chưa đạt thì không có tiền, Khoán quy hết về điểm."
  }
};

/** The rule in one sentence (settings, overview, settlement page). */
export const topUpRule =
  "Thiếu KPI bao nhiêu điểm thì lấy Khoán bù bấy nhiêu (theo Bảng đơn giá); tiền Khoán được trả cho phần Khoán còn lại.";

const points = (value: number) => formatNumber(value, 2);

/**
 * "Nếu chốt hôm nay" (PD-066): TOP_UP on the period's figures so far. `hasTarget` false: no KPI yet (the warning says
 * it); `earned` 0 and nothing converted: no Khoán work in the period.
 */
export const ifSettledTodaySentence = (topUp: KhoanTopUp, hasTarget: boolean) => {
  if (topUp.khoanMoneyEarned === 0 && topUp.khoanPointsConverted === 0) {
    return hasTarget && !topUp.met
      ? `Nếu chốt hôm nay: còn thiếu ${points(topUp.shortfall)} điểm KPI, chưa có Khoán để bù.`
      : null;
  }
  if (!hasTarget) {
    return `Nếu chốt hôm nay: nhận đủ ${formatMoney(topUp.khoanMoneyEarned)} tiền Khoán.`;
  }
  if (topUp.shortfall === 0) {
    return `Nếu chốt hôm nay: đủ KPI, nhận đủ tiền Khoán (${formatMoney(topUp.khoanMoneyPaid)}).`;
  }
  if (topUp.met) {
    return `Nếu chốt hôm nay: nhận ${formatMoney(topUp.khoanMoneyPaid)} (bù ${points(topUp.khoanPointsConverted)} điểm từ Khoán để đủ KPI).`;
  }
  return `Nếu chốt hôm nay: chưa đủ KPI kể cả khi quy hết Khoán (còn thiếu ${points(topUp.shortfall - topUp.khoanPointsConverted)} điểm) → tiền Khoán ${formatMoney(0)}.`;
};

/** How the KPI total of a period is made, for the "KPI 12 kỳ gần nhất" panel. */
export const kpiTotalHint =
  "Tổng = điểm chính thức + điểm bù từ Khoán (chỉ khi thiếu KPI); tiền Khoán nhận = phần Khoán còn lại sau khi bù.";

/** One sentence explaining what a settled period did with the Khoán work (rule of its own run). */
export const settlementKhoanSentence = (
  settlement: Pick<
    KpiSettlement,
    | "met"
    | "khoanPolicy"
    | "shortfall"
    | "khoanCredits"
    | "khoanPointsConverted"
    | "khoanMoneyEarned"
    | "khoanMoneyPaid"
    | "target"
  >
) => {
  const paid =
    settlement.khoanMoneyPaid === null ? "" : ` (${formatMoney(settlement.khoanMoneyPaid)})`;
  if (settlement.khoanPolicy === "ALWAYS") {
    if (settlement.met) return `Đạt KPI. Tiền Khoán được trả đủ${paid} (chính sách cũ).`;
    return settlement.khoanCredits > 0
      ? `Thiếu KPI nhưng tiền Khoán vẫn được trả đủ${paid} (chính sách cũ “Luôn trả tiền Khoán”).`
      : "Thiếu KPI; kỳ này không có Khoán.";
  }
  if (settlement.khoanPolicy === "IF_KPI") {
    if (settlement.met) return `Đạt KPI nên tiền Khoán được trả${paid} (chính sách cũ).`;
    return settlement.khoanPointsConverted > 0
      ? `Thiếu KPI nên Khoán được quy hết về điểm (${points(settlement.khoanPointsConverted)} điểm); tiền Khoán = 0 (chính sách cũ).`
      : "Thiếu KPI; kỳ này không có Khoán để quy đổi.";
  }
  // TOP_UP (PD-066).
  if (settlement.target === null) return `Kỳ này không có KPI: tiền Khoán được trả đủ${paid}.`;
  if (settlement.shortfall === 0) return `Đủ KPI nên tiền Khoán được trả đủ${paid}.`;
  if (settlement.met) {
    return `Thiếu ${points(settlement.shortfall)} điểm, đã bù ${points(settlement.khoanPointsConverted)} điểm từ Khoán để đủ KPI; tiền Khoán nhận phần còn lại${paid}.`;
  }
  return settlement.khoanPointsConverted > 0
    ? `Thiếu ${points(settlement.shortfall)} điểm; đã quy hết Khoán (${points(settlement.khoanPointsConverted)} điểm) vẫn chưa đủ KPI nên tiền Khoán ${formatMoney(0)}.`
    : `Thiếu ${points(settlement.shortfall)} điểm và không có Khoán để bù.`;
};
