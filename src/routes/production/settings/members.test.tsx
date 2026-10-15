// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomField, ProductionMe, ProductionMember } from "@/contracts/production-catalog";
import { adminApi } from "@/features/admin/api";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { configReadOnlyMessage } from "@/features/production/config-access";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionMembersRoute } from "./members";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() })
}));

// Obviously fake ids, people and addresses (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const session = (superadmin: boolean) =>
  ({
    user: { id: id(900), displayName: "Người Xem", email: "viewer@example.test", avatarUrl: null },
    role: { permissions: [] },
    hasFullOrganizationAuthority: superadmin,
    productionRoles: ["ADMIN"],
    departments: ["PHOTO_RETOUCH"]
  }) as unknown as SessionContext;

const me = {
  roles: ["ADMIN"],
  isAdmin: true,
  teamId: null,
  jobPermissions: { view: "all", create: "all", update: "all", delete: "all" },
  settings: { timezone: "Asia/Ho_Chi_Minh" }
} as unknown as ProductionMe;

const skill: CustomField = {
  id: id(50),
  entity: "USER",
  key: "nang_luc",
  label: "Năng lực",
  type: "TEXT",
  options: [],
  required: false,
  showInTable: false,
  sortOrder: 0,
  active: true
};

const member = (n: number, name: string, overrides: Partial<ProductionMember> = {}) =>
  ({
    userId: id(n),
    displayName: name,
    email: `nguoi${n}@example.test`,
    avatarUrl: null,
    roles: [],
    departments: ["PHOTO_RETOUCH"],
    teamId: null,
    active: true,
    customValues: {},
    tagIds: [],
    ...overrides
  }) satisfies ProductionMember;

const members = [
  member(1, "Nhân Viên Một", {
    roles: ["LEADER"],
    teamId: id(10),
    tagIds: [id(20)],
    customValues: { nang_luc: "Cắt nền giỏi" }
  }),
  member(2, "Nhân Viên Hai", { active: false })
];

const renderPage = (superadmin: boolean) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session(superadmin)}>
        <MemoryRouter>
          <ProductionMembersRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

const openMenu = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: `Tùy chọn tài khoản của ${name}` }));
    await Promise.resolve();
  });
  return screen.findByRole("menu");
};

const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

beforeEach(() => {
  vi.spyOn(productionApi, "me").mockResolvedValue(me);
  vi.spyOn(productionApi, "members").mockResolvedValue({ items: members });
  vi.spyOn(productionApi, "teams").mockResolvedValue({
    items: [{ id: id(10), name: "Team Sáng", active: true, memberCount: 1 }]
  });
  vi.spyOn(productionApi, "customFields").mockResolvedValue({ items: [skill] });
  vi.spyOn(productionApi, "tags").mockResolvedValue({
    items: [{ id: id(20), name: "Tag Thử", color: "blue", active: true }]
  });
  vi.spyOn(adminApi, "members").mockResolvedValue({ items: [] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cấu hình → Thành viên & vai trò (PD-050)", () => {
  it("is read-only for everyone but the superadmin: roles, team and tags as text, no account actions", async () => {
    renderPage(false);
    expect(await screen.findByText("Nhân Viên Một")).toBeTruthy();
    expect(screen.getByText(configReadOnlyMessage)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Thêm thành viên/ })).toBeNull();

    const first = row("Nhân Viên Một");
    expect(
      screen.queryByRole("group", { name: "Vai trò Photo Retouch của Nhân Viên Một" })
    ).toBeNull();
    expect(within(first).getByText("Leader")).toBeTruthy();
    expect(within(first).getByText("Team Sáng")).toBeTruthy();
    expect(within(first).getByText("Tag Thử")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Team của Nhân Viên Một" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tag của Nhân Viên Một" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Đổi phòng ban/ })).toBeNull();
    // A disabled account cannot be re-enabled from here.
    expect(screen.queryByRole("button", { name: /Kích hoạt lại/ })).toBeNull();

    // Filters keep working.
    fireEvent.click(screen.getByRole("radio", { name: /^Leader/ }));
    expect(screen.queryByText("Nhân Viên Hai")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /^Tất cả/ }));

    // The menu only lists the led jobs.
    const menu = await openMenu("Nhân Viên Một");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(["Xem job đang dẫn"]);
    await act(async () => {
      fireEvent.keyDown(menu, { key: "Escape" });
      await Promise.resolve();
    });
  });

  it("opens the Photo Retouch profile read-only for everyone but the superadmin", async () => {
    renderPage(false);
    fireEvent.click(
      await screen.findByRole("button", { name: "Hồ sơ Photo Retouch của Nhân Viên Một" })
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Năng lực")).toBeTruthy();
    expect(within(dialog).getByText("Cắt nền giỏi")).toBeTruthy();
    expect(within(dialog).getByText("Tag Thử")).toBeTruthy();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Lưu hồ sơ" })).toBeNull();
    // The footer "Đóng" next to the dialog's own close button.
    expect(within(dialog).getAllByRole("button", { name: "Đóng" })).toHaveLength(2);
  });

  it("stays editable for the superadmin", async () => {
    renderPage(true);
    expect(await screen.findByText("Nhân Viên Một")).toBeTruthy();
    expect(screen.queryByText(configReadOnlyMessage)).toBeNull();
    expect(screen.getByRole("button", { name: /Thêm thành viên/ })).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Vai trò Photo Retouch của Nhân Viên Một" })
    ).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Team của Nhân Viên Một" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tag của Nhân Viên Một" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Kích hoạt lại/ }).length).toBeGreaterThan(0);

    const menu = await openMenu("Nhân Viên Một");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(["Xem job đang dẫn", "Đổi phòng ban", "Đặt lại mật khẩu", "Vô hiệu hóa tài khoản"]);
    await act(async () => {
      fireEvent.keyDown(menu, { key: "Escape" });
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Hồ sơ Photo Retouch của Nhân Viên Một" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Lưu hồ sơ" })).toBeTruthy();
  });
});
