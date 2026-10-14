// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminRole } from "@/lib/api/schemas";

import { productionGroups } from "./org-catalog";
import { OrgMatrix, type OrgCellState } from "./org-matrix";

afterEach(cleanup);

const role = (key: string, name: string, permissions: string[], isSystem = false): AdminRole => ({
  id: `role-${key}`,
  organizationId: "org-1",
  key,
  name,
  description: null,
  isSystem,
  permissions,
  createdAt: "2026-10-14T00:00:00.000Z",
  updatedAt: "2026-10-14T00:00:00.000Z"
});

describe("OrgMatrix (PD-042)", () => {
  it("toggles a permission of an editable role; locked cells stay disabled", () => {
    const roles = [
      role("superadmin", "Superadmin", [], true),
      role("member", "Member", ["task.view"])
    ];
    const cell = (item: AdminRole, key: string): OrgCellState => ({
      checked: item.key === "superadmin" || item.permissions.includes(key),
      changed: false,
      lockReason: item.key === "superadmin" ? "Siêu quản trị luôn có mọi quyền" : null
    });
    const onToggle = vi.fn();
    render(
      <OrgMatrix
        caption="Quyền"
        groups={productionGroups}
        roles={roles}
        cell={cell}
        onToggle={onToggle}
      />
    );
    expect(screen.getByText("Danh sách trong dự án")).toBeTruthy();
    const superadmin = screen.getByRole("checkbox", { name: "Xem dự án — Siêu quản trị" });
    expect(superadmin.getAttribute("aria-checked")).toBe("true");
    expect(superadmin.hasAttribute("data-disabled")).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: "Tạo công việc — Thành viên" }));
    expect(onToggle).toHaveBeenCalledWith(roles[1], "task.create", true);
  });
});
