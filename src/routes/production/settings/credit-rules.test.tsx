// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CreditMatrix,
  CreditRule,
  Process,
  ProductionMe,
  ProductionProject
} from "@/contracts/production-catalog";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { projectFixture } from "@/features/production/test-fixtures";
import { CreditCellEditor } from "@/features/production/components/credit/credit-cell-editor";
import { configReadOnlyMessage } from "@/features/production/config-access";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionCreditRulesRoute } from "./credit-rules";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Obviously fake ids (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const session = (superadmin: boolean) =>
  ({
    user: { id: id(900), displayName: "Người Thử", email: "viewer@example.test", avatarUrl: null },
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

const project: ProductionProject = projectFixture({ id: id(1), code: "ABC", name: "Dự án Thử" });
const process: Process = {
  id: id(2),
  name: "Retouch thường",
  isQc: false,
  sortOrder: 0,
  active: true
};
const rule: CreditRule = {
  id: id(3),
  projectId: project.id,
  processId: process.id,
  creditPerImage: 1.5,
  moneyPerImage: 2000,
  effectiveFrom: "2026-01-01",
  effectiveTo: null
};

const wrap = (node: ReactNode, superadmin: boolean) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session(superadmin)}>
        <MemoryRouter>{node}</MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.spyOn(productionApi, "me").mockResolvedValue(me);
  vi.spyOn(productionApi, "creditMatrix").mockImplementation((day: string) =>
    Promise.resolve({
      at: day,
      projects: [project],
      processes: [process],
      rules: [rule]
    } satisfies CreditMatrix)
  );
  vi.spyOn(productionApi, "creditHistory").mockResolvedValue({ items: [rule] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cấu hình → Bảng đơn giá (PD-050)", () => {
  it("is read-only for everyone but the superadmin: export only, no import / new version", async () => {
    wrap(<ProductionCreditRulesRoute />, false);
    expect(await screen.findByText("1/1 ô có giá")).toBeTruthy();
    expect(screen.getByText(configReadOnlyMessage)).toBeTruthy();
    const exportButton = screen.getByRole("button", { name: "Xuất CSV" });
    expect((exportButton as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: /Nhập CSV/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Phiên bản mới|Tạo phiên bản mới/ })).toBeNull();
    expect(screen.getByText("Phím mũi tên để di chuyển, Enter để xem lịch sử.")).toBeTruthy();
  });

  it("stays editable for the superadmin", async () => {
    wrap(<ProductionCreditRulesRoute />, true);
    expect(await screen.findByText("1/1 ô có giá")).toBeTruthy();
    expect(screen.queryByText(configReadOnlyMessage)).toBeNull();
    expect(screen.getByRole("button", { name: /Nhập CSV/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tạo phiên bản mới từ ngày/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeTruthy();
    expect(screen.getByText("Phím mũi tên để di chuyển, Enter để sửa.")).toBeTruthy();
  });

  it("with nothing to price, links to the Project page on its own route (PD-078)", async () => {
    vi.spyOn(productionApi, "creditMatrix").mockResolvedValue({
      at: "2026-02-01",
      projects: [],
      processes: [process],
      rules: []
    } satisfies CreditMatrix);
    wrap(<ProductionCreditRulesRoute />, true);
    expect(await screen.findByText("Chưa có Project hoặc quy trình")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Tìm Project" })).toBeTruthy();
    expect(screen.getByText("Project").closest("a")?.getAttribute("data-to")).toBe(
      "/production/projects"
    );
  });

  it("a cell opens its history only for read-only viewers (no price form, edit or delete)", async () => {
    wrap(
      <CreditCellEditor
        project={project}
        process={process}
        rule={rule}
        at="2026-02-01"
        today="2026-02-01"
        canEdit={false}
        onDone={() => undefined}
      />,
      false
    );
    expect(await screen.findByRole("list", { name: "Các phiên bản đơn giá" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Điểm / tấm" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lưu đơn giá" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sửa phiên bản từ/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Xóa phiên bản từ/ })).toBeNull();
  });

  it("the superadmin's cell editor sets prices and edits or deletes versions", async () => {
    wrap(
      <CreditCellEditor
        project={project}
        process={process}
        rule={rule}
        at="2026-02-01"
        today="2026-02-01"
        canEdit
        onDone={() => undefined}
      />,
      true
    );
    expect(screen.getByRole("textbox", { name: "Điểm / tấm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lưu đơn giá" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Lịch sử/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Xóa phiên bản từ/ })).toBeTruthy()
    );
    expect(screen.getByRole("button", { name: /^Sửa phiên bản từ/ })).toBeTruthy();
  });
});
