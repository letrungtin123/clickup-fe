// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultFeaturePermissions, defaultJobPermissions } from "@/contracts/production-catalog";

import { RetouchMatrix, RetouchReadOnlyNote } from "./retouch-matrix";
import { retouchFeatureRows, retouchFixedRules } from "./retouch-rules";

afterEach(cleanup);

const renderMatrix = (props: Partial<Parameters<typeof RetouchMatrix>[0]> = {}) =>
  render(
    <RetouchMatrix
      value={defaultJobPermissions}
      saved={defaultJobPermissions}
      features={defaultFeaturePermissions}
      featuresSaved={defaultFeaturePermissions}
      loading={false}
      editable
      disabled={false}
      unreadableNote="Chỉ Quản trị xem được."
      onScope={vi.fn()}
      onFeature={vi.fn()}
      featureRows={retouchFeatureRows({ moneyPublic: false })}
      rules={retouchFixedRules()}
      {...props}
    />
  );

const checkbox = (name: string) => screen.getByRole("checkbox", { name });

describe("RetouchMatrix (PD-042) — job & task", () => {
  it("edits the job scopes per role, Director included; ADMIN is fixed at “Tất cả”", () => {
    renderMatrix();
    expect(screen.getByRole("combobox", { name: "Xem job — Leader" }).textContent).toContain(
      "Tất cả"
    );
    // PD-051: QC no longer deletes tasks by default.
    expect(screen.getByRole("combobox", { name: "Xoá — QC" }).textContent).toContain("Không");
    expect(screen.getByRole("combobox", { name: "Sửa — QC" }).textContent).toContain("Của mình");
    // PD-065: a Director sees every job and changes nothing by default.
    expect(screen.getByRole("combobox", { name: "Xem job — Director" }).textContent).toContain(
      "Tất cả"
    );
    for (const action of ["Tạo job / task", "Sửa", "Xoá"]) {
      expect(
        screen.getByRole("combobox", { name: `${action} — Director` }).textContent,
        action
      ).toContain("Không");
    }
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
      "Không",
      "Không"
    ]);
  });
});

describe("RetouchMatrix (PD-065) — Quyền theo tính năng", () => {
  it("shows the eight features × six roles as checkboxes, with the owner's defaults", () => {
    renderMatrix();
    expect(screen.getByText("Quyền theo tính năng")).toBeTruthy();
    expect(screen.queryByText("Cố định theo vai trò")).toBeNull();
    expect(screen.queryByText(/Chưa chỉnh được ở đây/)).toBeNull();
    // Bất thường and Quản trị số liệu: Director only — not even Quản trị.
    for (const feature of ["Bất thường", "Quản trị số liệu"]) {
      expect(checkbox(`${feature} — Director`).getAttribute("aria-checked")).toBe("true");
      expect(checkbox(`${feature} — Quản trị`).getAttribute("aria-checked")).toBe("false");
      expect(checkbox(`${feature} — Leader`).getAttribute("aria-checked")).toBe("false");
    }
    expect(checkbox("Hàng chờ QC — QC").getAttribute("aria-checked")).toBe("true");
    expect(checkbox("Hàng chờ QC — Nhân viên").getAttribute("aria-checked")).toBe("false");
    expect(checkbox("Duyệt lịch nghỉ — Quản trị").getAttribute("aria-checked")).toBe("true");
    expect(checkbox("Xem tiền Khoán người khác — Leader").getAttribute("aria-checked")).toBe(
      "false"
    );
    // Editable for the superadmin: no cell is disabled.
    const featureBoxes = screen
      .getAllByRole("checkbox")
      .filter((box) => !box.hasAttribute("data-disabled"));
    expect(featureBoxes).toHaveLength(8 * 6);
  });

  it("toggles a cell through onFeature", () => {
    const onFeature = vi.fn();
    renderMatrix({ onFeature });
    fireEvent.click(checkbox("Bất thường — Quản trị"));
    expect(onFeature).toHaveBeenCalledWith("anomalies", "ADMIN", true);
    fireEvent.click(checkbox("Khách hàng — Account"));
    expect(onFeature).toHaveBeenCalledWith("clients", "ACCOUNT", false);
  });

  it("tints the cells that differ from the saved matrix", () => {
    renderMatrix({
      features: { ...defaultFeaturePermissions, anomalies: ["LEADER", "DIRECTOR"] }
    });
    const changed = checkbox("Bất thường — Leader").closest("label");
    expect(changed?.getAttribute("data-changed")).toBe("true");
    expect(checkbox("Bất thường — Director").closest("label")?.hasAttribute("data-changed")).toBe(
      false
    );
  });

  it("describes the configurable meaning of each feature", async () => {
    renderMatrix();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bất thường" }));
      await Promise.resolve();
    });
    expect(
      await screen.findByText(
        "Xem và xử lý mục bất thường (trễ, lệch số lượng…); người không phải Quản trị/Director chỉ thấy job mình lead."
      )
    ).toBeTruthy();
  });

  it("keeps “Cấu hình Photo Retouch” locked, view-only for ADMIN (PD-050) and the workflow for Director", () => {
    renderMatrix();
    expect(
      screen.getByRole("button", { name: "Cấu hình Photo Retouch — Quản trị: một phần — Chỉ xem" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Cấu hình Photo Retouch — Account: một phần — Xem Khách hàng, Trạng thái & luồng chuyển"
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Cấu hình Photo Retouch — Director: một phần — Chỉ xem Trạng thái & luồng chuyển"
      })
    ).toBeTruthy();
  });
});

describe("RetouchMatrix — who edits (PD-050)", () => {
  it("is read-only without edit rights, and explains when the matrix is not readable", () => {
    const onFeature = vi.fn();
    const { unmount } = renderMatrix({ editable: false, onFeature });
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    // Only the superadmin edits: 4 job rows × 5 roles (ADMIN is fixed) + 8 features × 6 roles.
    expect(screen.getAllByTitle("Chỉ Siêu quản trị sửa được")).toHaveLength(4 * 5 + 8 * 6);
    const anomalies = checkbox("Bất thường — Director");
    expect(anomalies.hasAttribute("data-disabled")).toBe(true);
    fireEvent.click(anomalies);
    expect(onFeature).not.toHaveBeenCalled();
    unmount();
    renderMatrix({
      value: null,
      saved: null,
      features: null,
      featuresSaved: null,
      editable: false
    });
    // One note for the job rows, one for the features.
    expect(screen.getAllByText("Chỉ Quản trị xem được.")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Đổi trạng thái job/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Bất thường/ })).toBeNull();
  });

  it("the read-only note names the superadmin", () => {
    render(<RetouchReadOnlyNote />);
    expect(screen.getByText("Chỉ Siêu quản trị chỉnh sửa phân quyền Photo Retouch.")).toBeTruthy();
  });
});
