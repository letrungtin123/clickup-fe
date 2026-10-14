// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultJobPermissions } from "@/contracts/production-catalog";

import { RetouchMatrix } from "./retouch-matrix";
import { retouchFixedRules } from "./retouch-rules";

afterEach(cleanup);

const renderMatrix = (props: Partial<Parameters<typeof RetouchMatrix>[0]> = {}) =>
  render(
    <RetouchMatrix
      value={defaultJobPermissions}
      saved={defaultJobPermissions}
      loading={false}
      editable
      disabled={false}
      unreadableNote="Chỉ Quản trị xem được."
      onScope={vi.fn()}
      rules={retouchFixedRules({ scoresPublic: true, moneyPublic: false })}
      {...props}
    />
  );

describe("RetouchMatrix (PD-042)", () => {
  it("edits the job scopes per role; ADMIN is fixed at “Tất cả”", () => {
    renderMatrix();
    expect(screen.getByRole("combobox", { name: "Xem job — Leader" }).textContent).toContain(
      "Tất cả"
    );
    expect(screen.getByRole("combobox", { name: "Xoá — Nhân viên" }).textContent).toContain(
      "Của mình"
    );
    expect(screen.queryByRole("combobox", { name: /Quản trị/ })).toBeNull();
  });

  it("derives “Đổi trạng thái job” from “Sửa”", () => {
    renderMatrix({
      value: { ...defaultJobPermissions, STAFF: { ...defaultJobPermissions.STAFF, update: "none" } }
    });
    const row = screen.getByRole("button", { name: /Đổi trạng thái job/ }).closest("tr");
    if (!row) throw new Error("row");
    const cells = within(row).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "Tất cả",
      "Tất cả",
      "Tất cả",
      "Của mình",
      "Không"
    ]);
  });

  it("shows the fixed rules as locked checkboxes", () => {
    renderMatrix();
    const qc = screen.getByRole("checkbox", { name: "Hàng chờ QC — QC" });
    expect(qc.getAttribute("aria-checked")).toBe("true");
    expect(qc.hasAttribute("data-disabled")).toBe(true);
    expect(
      screen.getByRole("checkbox", { name: "Hàng chờ QC — Nhân viên" }).getAttribute("aria-checked")
    ).toBe("false");
  });

  it("is read-only without edit rights, and explains when the matrix is not readable", () => {
    const { unmount } = renderMatrix({ editable: false });
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    unmount();
    renderMatrix({ value: null, saved: null, editable: false });
    expect(screen.getByText("Chỉ Quản trị xem được.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Đổi trạng thái job/ })).toBeNull();
  });
});
