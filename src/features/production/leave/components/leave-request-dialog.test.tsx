// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LeaveRequest } from "@/contracts/production-leave";

import { leaveApi } from "../api";
import { LeaveRequestDialog } from "./leave-request-dialog";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// PD-065 — the reason is optional (when given it goes on the payroll attendance export). Fake data only.
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

describe("Xin nghỉ — optional reason (PD-065)", () => {
  it("labels the reason as optional, keeps the placeholder and says who approves", () => {
    renderDialog();
    const reason = screen.getByLabelText("Lý do nghỉ (tùy chọn)");
    expect(reason.getAttribute("placeholder")).toBe("Ví dụ: Việc gia đình, khám bệnh…");
    expect(reason.hasAttribute("required")).toBe(false);
    expect(reason.getAttribute("maxlength")).toBe("1000");
    expect(screen.getByText(/người có quyền Duyệt lịch nghỉ duyệt/)).toBeTruthy();
  });

  it("sends without a reason (no note in the request)", async () => {
    const create = vi.spyOn(leaveApi, "create").mockResolvedValue({ ...created, note: null });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Gửi đơn" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ fromDate: today, toDate: today, part: "FULL_DAY" })
    );
    expect(screen.queryByText(/Nhập lý do nghỉ/)).toBeNull();
  });

  it("a blank reason is left out, never flagged", async () => {
    const create = vi.spyOn(leaveApi, "create").mockResolvedValue(created);
    renderDialog();
    const reason = screen.getByLabelText("Lý do nghỉ (tùy chọn)");
    fireEvent.change(reason, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi đơn" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ fromDate: today, toDate: today, part: "FULL_DAY" })
    );
    expect(reason.getAttribute("aria-invalid")).toBeNull();
  });

  it("sends a given reason trimmed, even a short one", async () => {
    const create = vi.spyOn(leaveApi, "create").mockResolvedValue(created);
    renderDialog();
    fireEvent.change(screen.getByLabelText("Lý do nghỉ (tùy chọn)"), {
      target: { value: "  Ốm  " }
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi đơn" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        fromDate: today,
        toDate: today,
        part: "FULL_DAY",
        note: "Ốm"
      })
    );
  });
});
