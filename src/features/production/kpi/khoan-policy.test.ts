import { describe, expect, it } from "vitest";

import {
  khoanPolicyMeta,
  khoanPolicyOptions,
  khoanPolicyRule,
  khoanProvisionalHint,
  kpiTotalHint,
  settlementKhoanSentence
} from "./khoan-policy";

const row = {
  met: false,
  khoanCredits: 30,
  khoanPointsConverted: 0,
  totalPoints: 80
};

describe("Khoán pay policy wording (PD-033)", () => {
  it("offers ALWAYS first (the default) with a label and a one-line explanation each", () => {
    expect(khoanPolicyOptions).toEqual(["ALWAYS", "IF_KPI"]);
    expect(khoanPolicyMeta.ALWAYS.label).toBe("Luôn trả tiền Khoán (như Excel)");
    expect(khoanPolicyMeta.IF_KPI.label).toBe("Chỉ trả khi đạt KPI");
    for (const policy of khoanPolicyOptions) {
      expect(khoanPolicyMeta[policy].description).not.toContain("\n");
    }
  });

  it("forecast hints: ALWAYS says the money is always paid, IF_KPI keeps the conversion", () => {
    expect(khoanProvisionalHint("ALWAYS")).toContain("Luôn được trả");
    expect(khoanProvisionalHint("ALWAYS")).not.toContain("quy về điểm");
    expect(khoanProvisionalHint("IF_KPI")).toBe("Nhận tiền nếu đạt KPI khi chốt kỳ; nếu thiếu sẽ quy về điểm.");
    expect(khoanPolicyRule("ALWAYS")).toContain("luôn được trả");
    expect(khoanPolicyRule("IF_KPI")).toContain("quy về điểm");
    expect(kpiTotalHint("IF_KPI")).toContain("Khoán quy đổi khi không đạt KPI");
    expect(kpiTotalHint("ALWAYS")).toContain("luôn được trả");
  });

  it("explains a settled row with the policy of its run", () => {
    expect(settlementKhoanSentence({ ...row, khoanPolicy: "ALWAYS" })).toContain("tiền Khoán vẫn được trả đủ");
    expect(settlementKhoanSentence({ ...row, khoanPolicy: "ALWAYS", khoanCredits: 0 })).toBe(
      "Thiếu KPI; kỳ này không có điểm Khoán."
    );
    expect(settlementKhoanSentence({ ...row, khoanPolicy: "ALWAYS", met: true })).toContain("luôn được trả");
    expect(
      settlementKhoanSentence({ ...row, khoanPolicy: "IF_KPI", khoanPointsConverted: 30, totalPoints: 110 })
    ).toBe("Thiếu KPI nên 30,00 điểm Khoán được quy về điểm KPI (tổng 110,00); tiền Khoán = 0.");
    expect(settlementKhoanSentence({ ...row, khoanPolicy: "IF_KPI", met: true })).toBe(
      "Đủ KPI nên điểm Khoán được trả tiền và không cộng vào KPI."
    );
  });
});
