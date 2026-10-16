// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductionMe } from "@/contracts/production-catalog";
import type { LeaveRequest } from "@/contracts/production-leave";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { leaveApi } from "@/features/production/leave/api";
import { downloadLeaveExport } from "@/features/production/leave/export";
import type * as LeaveExportModule from "@/features/production/leave/export";
import { ApiError } from "@/lib/api/errors";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionLeaveRoute } from "./leave";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/features/production/leave/export", async (importOriginal) => ({
  ...(await importOriginal<typeof LeaveExportModule>()),
  downloadLeaveExport: vi.fn()
}));

// PD-057 — Lịch nghỉ: time filter, Excel export for Quản trị, only Quản trị decides. Obviously fake
// ids and people (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const teamId = id(77);

const session = {
  user: { id: id(900), displayName: "Người Xem", email: "viewer@example.test", avatarUrl: null },
  role: { permissions: [] },
  hasFullOrganizationAuthority: false,
  productionRoles: ["LEADER"],
  departments: ["PHOTO_RETOUCH"]
} as unknown as SessionContext;

const meAs = (roles: string[], isAdmin: boolean) =>
  ({
    roles,
    isAdmin,
    teamId: null,
    jobPermissions: { view: "all", create: "none", update: "own", delete: "none" },
    settings: {
      timezone: "Asia/Ho_Chi_Minh",
      kpiCloseDay: 25,
      kpiCloseDays: [{ fromPeriod: null, closeDay: 25 }],
      khoanPayPolicy: "ALWAYS",
      scoresPublic: true,
      moneyPublic: false,
      chatAttachmentsEnabled: true
    }
  }) as unknown as ProductionMe;

const userRef = (n: number, displayName: string) => ({
  id: id(n),
  displayName,
  email: null,
  avatarUrl: null
});

const leave = (overrides: Partial<LeaveRequest>): LeaveRequest => ({
  id: id(1),
  user: userRef(901, "Nhân Viên Thử"),
  team: { id: teamId, name: "Team Thử" },
  fromDate: "2026-10-12",
  toDate: "2026-10-12",
  part: "MORNING",
  days: 0.5,
  note: "Khám bệnh",
  status: "APPROVED",
  decidedBy: userRef(902, "Quản Trị Thử"),
  decidedAt: "2026-10-05T03:00:00.000Z",
  decisionNote: null,
  cancelledAt: null,
  createdAt: "2026-10-01T03:00:00.000Z",
  updatedAt: "2026-10-05T03:00:00.000Z",
  canCancel: false,
  canDecide: false,
  ...overrides
});

const approved = leave({});
const pendingLeave = (canDecide: boolean) =>
  leave({
    id: id(2),
    user: userRef(903, "Đồng Nghiệp Thử"),
    fromDate: "2026-10-20",
    toDate: "2026-10-21",
    part: "FULL_DAY",
    days: 2,
    note: "Việc gia đình",
    status: "PENDING",
    decidedBy: null,
    decidedAt: null,
    canDecide
  });

const renderPage = (search: string) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
        })
      }
    >
      <SessionValueContext value={session}>
        <MemoryRouter initialEntries={[`/production/leave${search}`]}>
          <ProductionLeaveRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );

const setup = ({ admin, canDecide = admin }: { admin: boolean; canDecide?: boolean }) => {
  vi.spyOn(productionApi, "me").mockResolvedValue(
    admin ? meAs(["ADMIN"], true) : meAs(["LEADER"], false)
  );
  vi.spyOn(productionApi, "teams").mockResolvedValue({ items: [] });
  vi.spyOn(leaveApi, "calendar").mockImplementation((from, to) =>
    Promise.resolve({
      from,
      to,
      today: "2026-10-16",
      items: [approved, pendingLeave(canDecide)]
    })
  );
  vi.spyOn(leaveApi, "pending").mockResolvedValue({ items: [pendingLeave(canDecide)] });
  vi.spyOn(leaveApi, "mine").mockResolvedValue({ items: [] });
};

beforeEach(() => {
  vi.mocked(downloadLeaveExport).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Xuất Excel (Quản trị only)", () => {
  it("is hidden for a Leader", async () => {
    setup({ admin: false });
    renderPage("?month=2026-10");
    await screen.findByRole("radiogroup", { name: "Lọc theo thời gian" });
    // /production/me has loaded once the Leader's queue tab is there.
    await screen.findByRole("tab", { name: /Chờ duyệt/ });
    await waitFor(() => expect(leaveApi.calendar).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Xuất Excel/ })).toBeNull();
  });

  it("exports the shown month, first to last day, with the team filter", async () => {
    setup({ admin: true });
    vi.mocked(downloadLeaveExport).mockResolvedValue("cham-cong.xlsx");
    renderPage(`?month=2026-02&team=${teamId}`);
    const button = await screen.findByRole("button", { name: /Xuất Excel/ });
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent
    ).toContain(
      "Bảng chấm công (chỉ đơn đã duyệt) + chi tiết từng đơn: buổi nghỉ, lý do, người duyệt."
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(downloadLeaveExport).toHaveBeenCalledWith(
        { from: "2026-02-01", to: "2026-02-28" },
        teamId
      )
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Đã xuất bảng chấm công nghỉ phép", {
        description: "cham-cong.xlsx"
      })
    );
  });

  it("exports the chosen range and words a 403 for Quản trị", async () => {
    setup({ admin: true });
    vi.mocked(downloadLeaveExport).mockRejectedValue(
      new ApiError({ status: 403, code: "FORBIDDEN", message: "Forbidden" })
    );
    renderPage("?from=2026-09-26&to=2026-10-25");
    fireEvent.click(await screen.findByRole("button", { name: /Xuất Excel/ }));
    await waitFor(() =>
      expect(downloadLeaveExport).toHaveBeenCalledWith(
        { from: "2026-09-26", to: "2026-10-25" },
        null
      )
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Chỉ Quản trị mới xuất được bảng chấm công nghỉ phép."
      )
    );
  });
});

describe("Khoảng ngày", () => {
  it("lists the requests overlapping the range from the URL in a table", async () => {
    setup({ admin: true });
    renderPage("?from=2026-10-01&to=2026-10-31");
    const table = await screen.findByRole("table");
    expect(leaveApi.calendar).toHaveBeenCalledWith(
      "2026-10-01",
      "2026-10-31",
      null,
      expect.anything()
    );
    const heads = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(heads.slice(0, 8)).toEqual([
      "Nhân viên",
      "Team",
      "Từ – đến",
      "Buổi",
      "Số ngày",
      "Lý do",
      "Trạng thái",
      "Người duyệt"
    ]);
    const first = within(table).getAllByRole("row")[1];
    expect(first?.textContent).toContain("Nhân Viên Thử");
    expect(first?.textContent).toContain("Buổi sáng");
    expect(first?.textContent).toContain("Khám bệnh");
    expect(first?.textContent).toContain("Quản Trị Thử");
    expect(screen.getByRole("radio", { name: "Khoảng ngày" }).getAttribute("aria-checked")).toBe(
      "true"
    );
  });

  it("shows an inline problem and fetches nothing for a reversed range", async () => {
    setup({ admin: true });
    renderPage("?from=2026-10-31&to=2026-10-01");
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Đến ngày phải sau hoặc trùng Từ ngày."
    );
    const button = await screen.findByRole("button", { name: /Xuất Excel/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(leaveApi.calendar).not.toHaveBeenCalled();
  });

  it("switching to Khoảng ngày starts from the shown month", async () => {
    setup({ admin: false });
    renderPage("?month=2026-09");
    fireEvent.click(await screen.findByRole("radio", { name: "Khoảng ngày" }));
    await waitFor(() =>
      expect(leaveApi.calendar).toHaveBeenCalledWith(
        "2026-09-01",
        "2026-09-30",
        null,
        expect.anything()
      )
    );
    // Nothing of the fixture overlaps September: the empty state, not a table.
    expect(await screen.findByText("Không ai nghỉ trong khoảng này")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("Chờ duyệt — only Quản trị decides", () => {
  it("a Leader reads the queue without Duyệt / Từ chối", async () => {
    setup({ admin: false, canDecide: false });
    renderPage("?tab=pending");
    expect(await screen.findByText("Chỉ Quản trị duyệt đơn nghỉ.")).toBeTruthy();
    expect(screen.getByText("Đồng Nghiệp Thử")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Duyệt" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Từ chối" })).toBeNull();
  });

  it("Quản trị gets the buttons when the request allows it", async () => {
    setup({ admin: true, canDecide: true });
    renderPage("?tab=pending");
    expect(await screen.findByRole("button", { name: "Duyệt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Từ chối" })).toBeTruthy();
    expect(screen.queryByText("Chỉ Quản trị duyệt đơn nghỉ.")).toBeNull();
  });
});
