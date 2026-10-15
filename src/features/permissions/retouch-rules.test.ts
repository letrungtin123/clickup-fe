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
  const rules = retouchFixedRules({ moneyPublic: false });

  it("lists the ten fixed features in order, ADMIN always allowed except editing Cấu hình (PD-050)", () => {
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
    for (const item of rules) {
      expect(item.cells.ADMIN, item.id).toEqual(
        item.id === "settings" ? { partial: "Chỉ xem" } : true
      );
    }
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

  it("Cấu hình is edited by the superadmin only (PD-050): ADMIN reads every page, ACCOUNT the client page and the workflow, others the workflow", () => {
    const settings = rule(rules, "settings");
    expect(settings.description).toBe(
      "Cấu hình Photo Retouch: chỉ Siêu quản trị sửa; Quản trị xem mọi trang, Account xem Khách hàng, mọi vai trò xem Trạng thái & luồng chuyển."
    );
    expect(settings.cells.ADMIN).toEqual({ partial: "Chỉ xem" });
    const accountPages = settingsPages.filter((page) => hasAnyRole(["ACCOUNT"], page.roles));
    expect(accountPages.map((page) => page.slug)).toEqual(["clients", "workflow"]);
    expect(settings.cells.ACCOUNT).toEqual({
      partial: "Xem Khách hàng, Trạng thái & luồng chuyển"
    });
    for (const role of ["LEADER", "QC", "STAFF"] as ProductionRole[]) {
      expect(settings.cells[role]).toEqual({ partial: "Chỉ xem Trạng thái & luồng chuyển" });
      expect(
        settingsPages.filter((page) => hasAnyRole([role], page.roles)).map((page) => page.slug)
      ).toEqual(["workflow"]);
    }
  });

  it("others' scores are open to every role whatever the settings (PD-052)", () => {
    for (const settings of [{ moneyPublic: true }, { moneyPublic: false }, {}]) {
      const scores = rule(retouchFixedRules(settings), "others-scores");
      for (const role of retouchColumns) expect(scores.cells[role], role).toBe(true);
      expect(scores.description).not.toContain("đang");
    }
  });

  it("others' money follows “Công khai tiền công”", () => {
    expect(rule(rules, "others-money").cells.STAFF).toBe(false);
    expect(rule(rules, "others-money").description).toContain("đang tắt");

    const open = retouchFixedRules({ moneyPublic: true });
    expect(rule(open, "others-money").cells.QC).toBe(true);

    const unknown = retouchFixedRules();
    expect(rule(unknown, "others-money").cells.QC).toHaveProperty("partial");
  });
});
