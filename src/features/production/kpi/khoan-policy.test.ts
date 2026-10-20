import { describe, expect, it } from "vitest";

import {
  ifSettledTodaySentence,
  khoanPolicyMeta,
  settlementKhoanSentence,
  topUpRule
} from "./khoan-policy";

const words = (text: string | null) => text?.replace(/\s/g, " ") ?? null;

const topUp = (overrides: Partial<Parameters<typeof ifSettledTodaySentence>[0]> = {}) => ({
  shortfall: 0,
  khoanPointsConverted: 0,
  khoanMoneyEarned: 1_000_000,
  khoanMoneyPaid: 1_000_000,
  met: true,
  ...overrides
});

describe("Khoán wording (PD-066: money only, TOP_UP at the close)", () => {
  it("names the rule; the retired policies stay readable on old runs", () => {
    expect(khoanPolicyMeta.TOP_UP.label).toBe("Thiếu bao nhiêu bù bấy nhiêu");
    expect(khoanPolicyMeta.ALWAYS.label).toContain("chính sách cũ");
    expect(khoanPolicyMeta.IF_KPI.label).toContain("chính sách cũ");
    expect(topUpRule).toContain("bù bấy nhiêu");
    for (const meta of Object.values(khoanPolicyMeta)) {
      expect(`${meta.label}${meta.short}${meta.description}`).not.toMatch(/điểm Khoán/i);
    }
  });

  it("“Nếu chốt hôm nay”: met, topped up, beyond the Khoán, no Khoán, no KPI", () => {
    expect(words(ifSettledTodaySentence(topUp(), true))).toBe(
      "Nếu chốt hôm nay: đủ KPI, nhận đủ tiền Khoán (1.000.000 ₫)."
    );
    expect(
      words(
        ifSettledTodaySentence(
          topUp({ shortfall: 50, khoanPointsConverted: 50, khoanMoneyPaid: 750_000 }),
          true
        )
      )
    ).toBe("Nếu chốt hôm nay: nhận 750.000 ₫ (bù 50 điểm từ Khoán để đủ KPI).");
    expect(
      words(
        ifSettledTodaySentence(
          topUp({ shortfall: 60, khoanPointsConverted: 30, khoanMoneyPaid: 0, met: false }),
          true
        )
      )
    ).toBe(
      "Nếu chốt hôm nay: chưa đủ KPI kể cả khi quy hết Khoán (còn thiếu 30 điểm) → tiền Khoán 0 ₫."
    );
    expect(
      ifSettledTodaySentence(
        topUp({ khoanMoneyEarned: 0, khoanMoneyPaid: 0, shortfall: 20, met: false }),
        true
      )
    ).toBe("Nếu chốt hôm nay: còn thiếu 20 điểm KPI, chưa có Khoán để bù.");
    expect(
      ifSettledTodaySentence(topUp({ khoanMoneyEarned: 0, khoanMoneyPaid: 0 }), true)
    ).toBeNull();
    expect(words(ifSettledTodaySentence(topUp(), false))).toBe(
      "Nếu chốt hôm nay: nhận đủ 1.000.000 ₫ tiền Khoán."
    );
  });

  it("explains a settled row with the rule of its run", () => {
    const row = {
      met: true,
      khoanPolicy: "TOP_UP" as const,
      target: 2600,
      shortfall: 50,
      khoanCredits: 200,
      khoanPointsConverted: 50,
      khoanMoneyEarned: 1_000_000,
      khoanMoneyPaid: 750_000
    };
    expect(words(settlementKhoanSentence(row))).toBe(
      "Thiếu 50 điểm, đã bù 50 điểm từ Khoán để đủ KPI; tiền Khoán nhận phần còn lại (750.000 ₫)."
    );
    expect(
      settlementKhoanSentence({ ...row, khoanMoneyPaid: null, khoanMoneyEarned: null })
    ).not.toContain("₫");
    expect(
      words(
        settlementKhoanSentence({
          ...row,
          met: false,
          shortfall: 600,
          khoanPointsConverted: 200,
          khoanMoneyPaid: 0
        })
      )
    ).toBe("Thiếu 600 điểm; đã quy hết Khoán (200 điểm) vẫn chưa đủ KPI nên tiền Khoán 0 ₫.");
    expect(settlementKhoanSentence({ ...row, shortfall: 0, khoanPointsConverted: 0 })).toContain(
      "Đủ KPI"
    );
    expect(settlementKhoanSentence({ ...row, khoanPolicy: "ALWAYS", met: false })).toContain(
      "chính sách cũ"
    );
    expect(
      settlementKhoanSentence({
        ...row,
        khoanPolicy: "IF_KPI",
        met: false,
        khoanPointsConverted: 200
      })
    ).toContain("quy hết về điểm");
  });
});
