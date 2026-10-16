// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LeaveRequest } from "@/contracts/production-leave";

import { leaveApi } from "../api";
import { LeaveRequestDialog } from "./leave-request-dialog";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// PD-057 — the reason is required (it goes on the payroll attendance export). Fake data only.
const today = "2026-10-16";

const created: LeaveRequest = {
  id: "00000000-0000-4000-8000-000000000001",
  user: {
    id: "00000000-0000-4000-8000-000000000900",
    displayName: "Người Xin",
    email: null,
    avatarUrl: null
  },
  team: null,
  fromDate: today,
  toDate: today,
  part: "FULL_DAY",
  days: 1,
  note: "Khám bệnh",
  status: "PENDING",
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  cancelledAt: null,
  createdAt: "2026-10-16T03:00:00.000Z",
  updatedAt: "2026-10-16T03:00:00.000Z",
  canCancel: true,
  canDecide: false
};

const renderDialog = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
        })
      }
    >
      <LeaveRequestDialog open onOpenChange={() => undefined} today={today} initialDay={null} />
    </QueryClientProvider>
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Xin nghỉ — required reason", () => {
  it("labels the reason as required and says Quản trị approves", () => {
    renderDialog();
    const reason = screen.getByLabelText("Lý do nghỉ");
    expect(reason.getAttribute("placeholder")).toBe("Ví dụ: Việc gia đình, khám bệnh…");
    expect(reason.hasAttribute("required")).toBe(true);
    expect(screen.queryByText(/tùy chọn|không bắt buộc/)).toBeNull();
    expect(screen.getByText(/Quản trị duyệt đơn/)).toBeTruthy();
    expect(screen.queryByText(/Leader hoặc Quản trị duyệt/)).toBeNull();
  });

  it("refuses to send without at least 3 characters, inline under the field", async () => {
    const create = vi.spyOn(leaveApi, "create").mockResolvedValue(created);
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Gửi đơn" }));
    const reason = screen.getByLabelText("Lý do nghỉ");
    expect(await screen.findByText("Nhập lý do nghỉ (ít nhất 3 ký tự).")).toBeTruthy();
    expect(reason.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(reason, { target: { value: "  ab  " } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi đơn" }));
    expect(screen.getByText("Nhập lý do nghỉ (ít nhất 3 ký tự).")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: "  Khám bệnh  " } });
    expect(screen.queryByText("Nhập lý do nghỉ (ít nhất 3 ký tự).")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Gửi đơn" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        fromDate: today,
        toDate: today,
        part: "FULL_DAY",
        note: "Khám bệnh"
      })
    );
  });

  it("shows the message once the field is left empty", async () => {
    renderDialog();
    const reason = screen.getByLabelText("Lý do nghỉ");
    expect(screen.queryByText("Nhập lý do nghỉ (ít nhất 3 ký tự).")).toBeNull();
    fireEvent.blur(reason);
    expect(await screen.findByText("Nhập lý do nghỉ (ít nhất 3 ký tự).")).toBeTruthy();
  });
});
