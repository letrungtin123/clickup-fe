// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultJobPermissions } from "@/contracts/production-catalog";

import { RetouchMatrix, RetouchReadOnlyNote } from "./retouch-matrix";
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
      rules={retouchFixedRules({ moneyPublic: false })}
      {...props}
    />
  );

describe("RetouchMatrix (PD-042)", () => {
  it("edits the job scopes per role; ADMIN is fixed at “Tất cả”", () => {
    renderMatrix();
    expect(screen.getByRole("combobox", { name: "Xem job — Leader" }).textContent).toContain(
      "Tất cả"
    );
    // PD-051: QC no longer deletes tasks by default.
    expect(screen.getByRole("combobox", { name: "Xoá — QC" }).textContent).toContain("Không");
    expect(screen.getByRole("combobox", { name: "Sửa — QC" }).textContent).toContain("Của mình");
    expect(screen.queryByRole("combobox", { name: /Quản trị/ })).toBeNull();
  });

  it("reads fine with staff who neither create nor delete (PD-047)", async () => {
    renderMatrix({
      value: {
        ...defaultJobPermissions,
        STAFF: { ...defaultJobPermissions.STAFF, create: "none", delete: "none" }
      }
    });
    expect(
      screen.getByRole("combobox", { name: "Tạo job / task — Nhân viên" }).textContent
    ).toContain("Không");
    expect(screen.getByRole("combobox", { name: "Xoá — Nhân viên" }).textContent).toContain(
      "Không"
    );
    // The row help says a worker's own subtasks stay deletable.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
      await Promise.resolve();
    });
    expect(await screen.findByText(/Subtask của task mình làm/)).toBeTruthy();
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
    // PD-050: only the superadmin edits (4 job rows × 4 roles; ADMIN is fixed).
    expect(screen.getAllByTitle("Chỉ Siêu quản trị sửa được")).toHaveLength(16);
    unmount();
    renderMatrix({ value: null, saved: null, editable: false });
    expect(screen.getByText("Chỉ Quản trị xem được.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Đổi trạng thái job/ })).toBeNull();
  });

  it("the read-only note names the superadmin (PD-050)", () => {
    render(<RetouchReadOnlyNote />);
    expect(screen.getByText("Chỉ Siêu quản trị chỉnh sửa phân quyền Photo Retouch.")).toBeTruthy();
  });

  it("shows “Cấu hình Photo Retouch” as view-only for ADMIN (PD-050)", () => {
    renderMatrix();
    expect(
      screen.getByRole("button", { name: "Cấu hình Photo Retouch — Quản trị: một phần — Chỉ xem" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Cấu hình Photo Retouch — Account: một phần — Xem Khách hàng, Trạng thái & luồng chuyển"
      })
    ).toBeTruthy();
  });
});
