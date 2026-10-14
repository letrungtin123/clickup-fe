import { describe, expect, it } from "vitest";

import type { ProductionRole } from "@/contracts/production-catalog";
import { productionNavEntries, settingsPages } from "@/features/production/nav";
import { hasAnyRole } from "@/features/production/roles";

import { retouchColumns, retouchFixedRules, type RetouchRule } from "./retouch-rules";

const rule = (rules: RetouchRule[], id: string) => {
  const found = rules.find((item) => item.id === id);
  if (!found) throw new Error(`missing rule ${id}`);
  return found;
};

const navRoles = (to: string) => {
  const entry = productionNavEntries.find((item) => item.to === to);
  if (!entry) throw new Error(`missing nav entry ${to}`);
  return entry.roles;
};

describe("Photo Retouch fixed rules (PD-042)", () => {
  const rules = retouchFixedRules({ scoresPublic: true, moneyPublic: false });

  it("lists the ten fixed features in order, ADMIN always allowed", () => {
    expect(rules.map((item) => item.label)).toEqual([
      "Hàng chờ QC",
      "Xem điểm người khác",
      "Xem tiền Khoán người khác",
      "Bảng điều khiển",
      "Quản trị số liệu",
      "Báo cáo",
      "Bất thường",
      "Duyệt lịch nghỉ",
      "Khách hàng",
      "Cấu hình Photo Retouch"
    ]);
    for (const item of rules) expect(item.cells.ADMIN).toBe(true);
  });

  it("matches the production menu roles", () => {
    const pairs: [string, string][] = [
      ["qc-queue", "/production/qc"],
      ["dashboard", "/production/dashboard"],
      ["admin-dashboard", "/production/admin"],
      ["reports", "/production/reports"],
      ["anomalies", "/production/anomalies"],
      ["clients", "/production/clients"]
    ];
    for (const [id, to] of pairs) {
      for (const role of retouchColumns) {
        expect(rule(rules, id).cells[role], `${id} / ${role}`).toBe(
          hasAnyRole([role], navRoles(to))
        );
      }
    }
  });

  it("opens Cấu hình to ADMIN, and only the client page to ACCOUNT", () => {
    const settings = rule(rules, "settings").cells;
    const accountPages = settingsPages.filter((page) => hasAnyRole(["ACCOUNT"], page.roles));
    expect(accountPages.map((page) => page.slug)).toEqual(["clients"]);
    expect(settings.ACCOUNT).toEqual({ partial: "Chỉ mục Khách hàng" });
    for (const role of ["LEADER", "QC", "STAFF"] as ProductionRole[]) {
      expect(settings[role]).toBe(false);
      expect(settingsPages.some((page) => hasAnyRole([role], page.roles))).toBe(false);
    }
  });

  it("follows the public score / money settings", () => {
    expect(rule(rules, "others-scores").cells.STAFF).toBe(true);
    expect(rule(rules, "others-money").cells.STAFF).toBe(false);

    const closed = retouchFixedRules({ scoresPublic: false, moneyPublic: true });
    expect(rule(closed, "others-scores").cells.STAFF).toBe(false);
    expect(rule(closed, "others-scores").cells.LEADER).toHaveProperty("partial");
    expect(rule(closed, "others-money").cells.QC).toBe(true);
    expect(rule(closed, "others-scores").description).toContain("đang tắt");

    const unknown = retouchFixedRules();
    expect(rule(unknown, "others-scores").cells.QC).toHaveProperty("partial");
  });
});
