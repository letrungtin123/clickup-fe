import { describe, expect, it } from "vitest";

import {
  defaultFeaturePermissions,
  effectiveFeatures,
  type ProductionRole
} from "@/contracts/production-catalog";
import { productionNavEntries, settingsPages, visibleNavEntries } from "@/features/production/nav";
import { hasAnyRole } from "@/features/production/roles";

import { retouchColumns, retouchFeatureRows, retouchFixedRules } from "./retouch-rules";

const paths = (roles: readonly ProductionRole[]) =>
  visibleNavEntries(roles).map((entry) => entry.to);

describe("Photo Retouch feature rows (PD-065)", () => {
  it("lists the eight configurable features in the contract's order, then the fixed Cấu hình row", () => {
    expect(retouchFeatureRows().map((row) => row.label)).toEqual([
      "Hàng chờ QC",
      "Xem điểm người khác",
      "Xem tiền Khoán người khác",
      "Bảng điều khiển",
      "Quản trị số liệu",
      "Bất thường",
      "Duyệt lịch nghỉ",
      "Khách hàng"
    ]);
    expect(retouchFixedRules().map((rule) => rule.label)).toEqual(["Cấu hình Photo Retouch"]);
  });

  it("has six role columns, Director last", () => {
    expect(retouchColumns).toEqual(["ADMIN", "ACCOUNT", "LEADER", "QC", "STAFF", "DIRECTOR"]);
  });

  it("the menu follows the default matrix until /production/me says otherwise", () => {
    const pairs = [
      ["qc_queue", "/production/qc"],
      ["leader_dashboard", "/production/dashboard"],
      ["admin_dashboard", "/production/admin"],
      ["anomalies", "/production/anomalies"],
      ["clients", "/production/clients"]
    ] as const;
    for (const [feature, to] of pairs) {
      expect(productionNavEntries.find((entry) => entry.to === to)?.feature, to).toBe(feature);
      for (const role of retouchColumns) {
        expect(paths([role]).includes(to), `${to} / ${role}`).toBe(
          defaultFeaturePermissions[feature].includes(role)
        );
      }
    }
  });

  it("others' money: one's own always, someone else's only with the feature — no “Công khai tiền công” (PD-066)", () => {
    const money =
      retouchFeatureRows().find((row) => row.feature === "view_others_money")?.description ?? "";
    expect(money).toContain("Tiền của chính mình luôn xem được");
    expect(money).not.toContain("Công khai tiền công");
  });

  it("the default matrix gives Bất thường and Quản trị số liệu to Director only", () => {
    expect(effectiveFeatures(["ADMIN"], defaultFeaturePermissions)).not.toEqual(
      expect.arrayContaining(["anomalies"])
    );
    expect(effectiveFeatures(["DIRECTOR"], defaultFeaturePermissions)).toEqual(
      expect.arrayContaining(["anomalies", "admin_dashboard", "leader_dashboard"])
    );
    expect(effectiveFeatures(["ADMIN"], defaultFeaturePermissions)).not.toContain(
      "admin_dashboard"
    );
  });
});

describe("Cấu hình Photo Retouch stays fixed (PD-050)", () => {
  it("is edited by the superadmin only: ADMIN reads every page, ACCOUNT the client page and the workflow, others the workflow", () => {
    const [settings] = retouchFixedRules();
    if (!settings) throw new Error("settings rule");
    expect(settings.description).toBe(
      "Cấu hình Photo Retouch: chỉ Siêu quản trị sửa; Quản trị xem mọi trang, Account xem Khách hàng, mọi vai trò xem Trạng thái & luồng chuyển."
    );
    expect(settings.cells.ADMIN).toEqual({ partial: "Chỉ xem" });
    const accountPages = settingsPages.filter((page) => hasAnyRole(["ACCOUNT"], page.roles));
    expect(accountPages.map((page) => page.slug)).toEqual(["clients", "workflow"]);
    expect(settings.cells.ACCOUNT).toEqual({
      partial: "Xem Khách hàng, Trạng thái & luồng chuyển"
    });
    for (const role of ["LEADER", "QC", "STAFF", "DIRECTOR"] as ProductionRole[]) {
      expect(settings.cells[role]).toEqual({ partial: "Chỉ xem Trạng thái & luồng chuyển" });
      expect(
        settingsPages.filter((page) => hasAnyRole([role], page.roles)).map((page) => page.slug)
      ).toEqual(["workflow"]);
    }
  });
});
