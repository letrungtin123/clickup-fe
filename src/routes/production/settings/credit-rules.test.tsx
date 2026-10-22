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
import { CreditImportDialog } from "@/features/production/components/credit/credit-import-dialog";
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
  // FormAlert scrolls itself into view (jsdom has no scrollIntoView).
  if (!("scrollIntoView" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined });
  }
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

describe("Bảng đơn giá — Giờ/tấm, phiên bản và nguồn (PD-080)", () => {
  const editor = (cellRule: CreditRule | null, canEdit = true) =>
    wrap(
      <CreditCellEditor
        project={project}
        process={process}
        rule={cellRule}
        at="2026-02-01"
        today="2026-02-01"
        canEdit={canEdit}
        onDone={() => undefined}
      />,
      canEdit
    );
  const hoursField = () => screen.getByRole<HTMLInputElement>("textbox", { name: /^Giờ \/ tấm/ });
  const mockSave = () =>
    vi.spyOn(productionApi, "setCreditRule").mockResolvedValue({ items: [rule] });

  it("the cell editor shows the derived hours as a placeholder and saves an empty field as null", async () => {
    const save = mockSave();
    editor(rule);
    // 1,50 credit ÷ 11 ≈ 0,1364 h — derived, so the field itself is empty.
    expect(hoursField().value).toBe("");
    expect(hoursField().placeholder).toBe("≈ 0,1364 (credit ÷ 11)");
    expect(screen.getByText("≈ 0,1364 h")).toBeTruthy();
    // The placeholder follows the credit being typed.
    fireEvent.change(screen.getByRole("textbox", { name: "Điểm / tấm" }), {
      target: { value: "2,2" }
    });
    expect(hoursField().placeholder).toBe("≈ 0,2 (credit ÷ 11)");
    fireEvent.click(screen.getByRole("button", { name: "Lưu đơn giá" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toEqual({
      projectId: project.id,
      processId: process.id,
      creditPerImage: 2.2,
      moneyPerImage: 2000,
      hoursPerImage: null,
      effectiveFrom: "2026-02-01"
    });
  });

  it("the cell editor saves typed hours (comma decimals) and refuses invalid ones", async () => {
    const save = mockSave();
    editor(rule);
    fireEvent.change(hoursField(), { target: { value: "0,12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu đơn giá" }));
    expect(await screen.findByText("Tối đa 4 chữ số thập phân.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(hoursField(), { target: { value: "0,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu đơn giá" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toMatchObject({ creditPerImage: 1.5, hoursPerImage: 0.5 });
  });

  it("a price with its own hours starts with them in the field (no ≈)", () => {
    mockSave();
    editor({ ...rule, hoursPerImage: 0.25 });
    expect(hoursField().value).toBe("0,25");
    expect(screen.getByText("0,25 h")).toBeTruthy();
  });

  it("the version history shows each version's hours (≈ when derived) and its source file", async () => {
    vi.spyOn(productionApi, "creditHistory").mockResolvedValue({
      items: [
        {
          ...rule,
          id: id(4),
          creditPerImage: 2.2,
          hoursPerImage: 0.2,
          source: "VD_Don_Gia_202602",
          effectiveFrom: "2026-02-01"
        },
        { ...rule, effectiveTo: "2026-02-01" }
      ]
    });
    editor(rule, false);
    const list = await screen.findByRole("list", { name: "Các phiên bản đơn giá" });
    const rows = Array.from(list.querySelectorAll("li")).map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("0,2 h");
    expect(rows[0]).toContain("Nguồn: VD_Don_Gia_202602");
    expect(rows[1]).toContain("≈ 0,1364 h");
    expect(rows[1]).not.toContain("Nguồn:");
  });

  it("shows the named version in force above the grid", async () => {
    vi.spyOn(productionApi, "creditMatrix").mockImplementation((day: string) =>
      Promise.resolve({
        at: day,
        projects: [project],
        processes: [process],
        rules: [rule],
        version: {
          effectiveFrom: "2026-01-01",
          name: "Đơn giá 01/2026",
          source: "VD_Don_Gia_202601"
        }
      } satisfies CreditMatrix)
    );
    wrap(<ProductionCreditRulesRoute />, false);
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent ===
            "Phiên bản từ 01/01/2026 · Đơn giá 01/2026 · Nguồn: VD_Don_Gia_202601"
      )
    ).toBeTruthy();
  });

  it("no version label without a named version", async () => {
    wrap(<ProductionCreditRulesRoute />, false);
    await screen.findByText("1/1 ô có giá");
    expect(screen.queryByText(/^Phiên bản từ/)).toBeNull();
  });

  it("“Hiện giờ/tấm” adds the hours line to every cell (≈ when derived); the cell names them always", async () => {
    // The grid is virtualized: give its scroll box a size so jsdom renders the rows.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1000);
    wrap(<ProductionCreditRulesRoute />, true);
    await screen.findByText("1/1 ô có giá");
    const cell = screen.getByRole("button", { name: /^ABC × Retouch thường:/ });
    expect(cell.getAttribute("aria-label")).toContain("khoảng 0,1364 giờ/tấm (credit ÷ 11)");
    expect(cell.textContent).not.toContain("h");
    fireEvent.click(screen.getByRole("switch", { name: "Hiện giờ/tấm" }));
    await waitFor(() => expect(cell.textContent).toContain("≈ 0,1364 h"));
    expect(screen.getByText(/dòng 3: giờ\/tấm/)).toBeTruthy();
  });

  it("the import sends the file name (no extension) as the source and the optional version name", async () => {
    const importCredits = vi.spyOn(productionApi, "importCredits").mockResolvedValue({
      ok: true,
      imported: 1,
      createdProjects: [],
      createdProcesses: [],
      errors: []
    });
    wrap(
      <CreditImportDialog
        open
        onOpenChange={() => undefined}
        today="2026-02-01"
        onImported={() => undefined}
      />,
      true
    );
    // The help text documents the optional hours column.
    expect(screen.getByText(/hours_per_image, gio_tam/)).toBeTruthy();
    const csv = "project_code,process_name,credit,money,hours\nABC,Retouch thường,1.10,5000,0.1\n";
    // jsdom's File cannot be read with text(): give it one.
    const file = Object.assign(new File([csv], "VD_Don_Gia_202602.csv", { type: "text/csv" }), {
      text: () => Promise.resolve(csv)
    });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(await screen.findByText("1 dòng dữ liệu · Nguồn: VD_Don_Gia_202602")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: /^Tên phiên bản/ }), {
      target: { value: "  Đơn giá 02/2026 " }
    });
    fireEvent.click(screen.getByRole("button", { name: "Nhập 1 dòng" }));
    await waitFor(() => expect(importCredits).toHaveBeenCalledTimes(1));
    // The CSV goes as it is: the server reads the hours column.
    expect(importCredits.mock.calls[0]?.[0]).toEqual({
      csv,
      effectiveFrom: "2026-02-01",
      createMissing: false,
      source: "VD_Don_Gia_202602",
      versionName: "Đơn giá 02/2026"
    });
    expect(
      await screen.findByText(
        /Phiên bản “Đơn giá 02\/2026” — có hiệu lực từ 01\/02\/2026\. Nguồn: VD_Don_Gia_202602\./
      )
    ).toBeTruthy();
  });

  it("pasted content has no source, and an empty version name is not sent", async () => {
    const importCredits = vi.spyOn(productionApi, "importCredits").mockResolvedValue({
      ok: true,
      imported: 1,
      createdProjects: [],
      createdProcesses: [],
      errors: []
    });
    wrap(
      <CreditImportDialog
        open
        onOpenChange={() => undefined}
        today="2026-02-01"
        onImported={() => undefined}
      />,
      true
    );
    fireEvent.click(screen.getByRole("radio", { name: /Dán nội dung/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: /Nội dung CSV/ }), {
      target: { value: "project_code,process_name,credit,money\nABC,Retouch thường,1.00,\n" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Nhập 1 dòng" }));
    await waitFor(() => expect(importCredits).toHaveBeenCalledTimes(1));
    expect(importCredits.mock.calls[0]?.[0]).toEqual({
      csv: "project_code,process_name,credit,money\nABC,Retouch thường,1.00,\n",
      effectiveFrom: "2026-02-01",
      createMissing: false
    });
  });
});
