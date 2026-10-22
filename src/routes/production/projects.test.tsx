// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import type {
  ProductionMe,
  ProjectCapabilities,
  ProjectOwnerPick
} from "@/contracts/production-catalog";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { projectFixture } from "@/features/production/test-fixtures";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionProjectsRoute } from "./projects";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// PD-078 / PD-079 — /production/projects. Made-up ids, codes and names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = { id: id(900), displayName: "Người Thử", email: null, avatarUrl: null };
const OTHER = { id: id(901), displayName: "Leader Hai", email: null, avatarUrl: null };
const ADMIN = { id: id(902), displayName: "Quản trị Ba", email: null, avatarUrl: null };
const can = (
  canEdit: boolean,
  canDelete: boolean,
  ownerEdit: ProjectCapabilities["ownerEdit"] = "none"
): ProjectCapabilities => ({ canEdit, canChangeOwner: ownerEdit !== "none", ownerEdit, canDelete });

const mine = projectFixture({
  id: id(1),
  code: "AXP",
  name: "Axon",
  owners: [ME],
  createdBy: ME,
  createdAt: "2026-10-21T03:00:00.000Z",
  jobCount: 0,
  hasJobs: false,
  capabilities: can(true, true)
});
/** Two owners: another Leader first, then me (a co-owner). */
const shared = projectFixture({
  id: id(2),
  code: "BRX",
  name: "Brix",
  description: "Khách mẫu",
  owners: [OTHER, ME],
  jobCount: 5,
  hasJobs: true,
  capabilities: can(true, false)
});
const old = projectFixture({
  id: id(3),
  code: "CAT",
  name: "Cát",
  jobCount: 2,
  hasJobs: true,
  capabilities: can(false, false)
});
const off = projectFixture({
  id: id(4),
  code: "DRX",
  name: "Drix",
  active: false,
  owners: [OTHER],
  capabilities: can(false, false)
});

const meWith = (roles: string[]) =>
  ({
    roles,
    isAdmin: roles.includes("ADMIN"),
    teamId: null,
    jobPermissions: { view: "all", create: "all", update: "all", delete: "none" },
    taskCreate: roles.includes("LEADER") || roles.includes("ADMIN") ? "all" : "none",
    features: [],
    settings: { timezone: "Asia/Ho_Chi_Minh" }
  }) as unknown as ProductionMe;

const member = (person: typeof ME, roles: string[]) => ({
  userId: person.id,
  displayName: person.displayName,
  email: null,
  avatarUrl: null,
  roles,
  departments: ["PHOTO_RETOUCH"],
  teamId: null,
  active: true,
  customValues: {},
  tagIds: []
});

const sessionFor = (superadmin: boolean) =>
  ({
    user: { id: ME.id, displayName: ME.displayName, email: "viewer@example.test", avatarUrl: null },
    role: { permissions: [] },
    hasFullOrganizationAuthority: superadmin,
    productionRoles: ["LEADER"],
    departments: ["PHOTO_RETOUCH"]
  }) as unknown as SessionContext;

const renderPage = (superadmin = false) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={sessionFor(superadmin)}>
        <MemoryRouter>
          <ProductionProjectsRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};
const click = async (element: Element) => {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
};
const pickOption = async (name: string) => {
  const option = await screen.findByRole("option", { name: new RegExp(name) });
  await act(async () => {
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    await Promise.resolve();
  });
};
const list = () => screen.getByRole("list", { name: "Danh sách Project" });
const rowOf = (code: string) =>
  within(list())
    .getAllByRole("listitem")
    .find((item) => item.textContent?.includes(code))!;
const fillNew = (dialog: HTMLElement, code: string) => {
  fireEvent.change(within(dialog).getByLabelText("Mã"), { target: { value: code } });
  fireEvent.change(within(dialog).getByLabelText("Tên Project"), { target: { value: "Mới" } });
};

let projects: MockInstance<typeof productionApi.projects>;
let me: MockInstance<typeof productionApi.me>;
const collection = (ownerPick: ProjectOwnerPick | null, items = [mine, shared, old, off]) => ({
  items,
  canCreate: ownerPick !== null,
  ownerPick
});

beforeEach(() => {
  // cmdk (the owners multi-select) measures its list.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  if (!("scrollIntoView" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined });
  }
  me = vi.spyOn(productionApi, "me").mockResolvedValue(meWith(["LEADER"]));
  vi.spyOn(productionApi, "members").mockResolvedValue({
    items: [member(ME, ["LEADER"]), member(OTHER, ["LEADER"]), member(ADMIN, ["ADMIN"])]
  } as never);
  projects = vi.spyOn(productionApi, "projects").mockResolvedValue(collection("self"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("/production/projects (PD-078, PD-079)", () => {
  it("lists the active Projects by code with every owner, job count, creator and state; inactive ones on request", async () => {
    renderPage();
    expect(await screen.findByText("Axon")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Project" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Cấp bậc" }).textContent).toBe(
      "ProjectJob CodeTaskSubtask"
    );
    const rows = within(list()).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent?.slice(0, 3))).toEqual(["AXP", "BRX", "CAT"]);
    // Owner and creator.
    expect(within(rowOf("AXP")).getAllByText(ME.displayName)).toHaveLength(2);
    expect(within(rowOf("AXP")).getByLabelText("Bạn phụ trách")).toBeTruthy();
    expect(within(rowOf("AXP")).getByText("21/10/2026")).toBeTruthy();
    // Several owners: the first named, "+1", every name in the tooltip; I am one of them.
    expect(within(rowOf("BRX")).getByText(OTHER.displayName)).toBeTruthy();
    expect(within(rowOf("BRX")).getByText("+1")).toBeTruthy();
    expect(within(rowOf("BRX")).getByTitle(`${OTHER.displayName}, ${ME.displayName}`)).toBeTruthy();
    expect(within(rowOf("BRX")).getByLabelText("Bạn phụ trách")).toBeTruthy();
    expect(within(rowOf("BRX")).getByRole("link", { name: "5 job của Project BRX" })).toBeTruthy();
    expect(within(rowOf("CAT")).getByText("Chưa có người phụ trách")).toBeTruthy();
    expect(screen.queryByText("Drix")).toBeNull();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("Drix")).toBeTruthy();
    expect(within(rowOf("DRX")).getByText("Ngừng hoạt động")).toBeTruthy();
  });

  it("search (owners' names too) and “Của tôi” — co-owned Projects count", async () => {
    renderPage();
    await screen.findByText("Axon");
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm Project" }), {
      target: { value: "khach" }
    });
    expect(within(list()).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm Project" }), {
      target: { value: "leader hai" }
    });
    expect(
      within(list())
        .getAllByRole("listitem")
        .map((row) => row.textContent?.slice(0, 3))
    ).toEqual(["BRX"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm Project" }), {
      target: { value: "" }
    });
    await click(screen.getByRole("button", { name: "Chỉ Project tôi phụ trách" }));
    expect(
      within(list())
        .getAllByRole("listitem")
        .map((row) => row.textContent?.slice(0, 3))
    ).toEqual(["AXP", "BRX"]);
  });

  it("a Leader creates a Project they own (owner locked) — the API call names no other owner", async () => {
    const create = vi
      .spyOn(productionApi, "createProject")
      .mockResolvedValue(collection("self", []));
    renderPage();
    await screen.findByText("Axon");
    await click(screen.getByRole("button", { name: /Tạo Project/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Project do bạn tạo luôn do bạn phụ trách.")).toBeTruthy();
    expect(within(dialog).queryByRole("combobox", { name: "Người phụ trách" })).toBeNull();
    fillNew(dialog, "AXP");
    await click(within(dialog).getByRole("button", { name: "Tạo Project" }));
    expect(within(dialog).getByText(/Mã Project đã tồn tại/)).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Mã"), { target: { value: "FAX" } });
    await click(within(dialog).getByRole("button", { name: "Tạo Project" }));
    expect(create).toHaveBeenCalledWith({ code: "FAX", name: "Mới", description: null });
  });

  it("an Account creates a Project with exactly one owner, and edits theirs without changing the owner", async () => {
    me.mockResolvedValue(meWith(["ACCOUNT"]));
    // The answer of a write is the refreshed list (kept the same here).
    const accountList = collection("one", [
      { ...off, active: true, createdBy: ME, capabilities: can(true, true) }
    ]);
    projects.mockResolvedValue(accountList);
    const create = vi.spyOn(productionApi, "createProject").mockResolvedValue(accountList);
    renderPage();
    await screen.findByText("Drix");
    await click(screen.getByRole("button", { name: /Tạo Project/ }));
    const dialog = await screen.findByRole("dialog");
    fillNew(dialog, "FAX");
    expect(
      within(dialog).getByText(
        "Chọn một Leader hoặc Quản trị — sau khi tạo, chỉ Quản trị đổi được."
      )
    ).toBeTruthy();
    await click(within(dialog).getByRole("button", { name: "Tạo Project" }));
    expect(within(dialog).getByText("Chọn người phụ trách cho Project.")).toBeTruthy();
    await click(within(dialog).getByRole("combobox", { name: "Người phụ trách" }));
    await pickOption(OTHER.displayName);
    await click(within(dialog).getByRole("button", { name: "Tạo Project" }));
    expect(create).toHaveBeenCalledWith({
      code: "FAX",
      name: "Mới",
      description: null,
      ownerIds: [OTHER.id]
    });
    // Saved: the dialog closes.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await click(screen.getByRole("button", { name: /Drix/ }));
    const edit = await screen.findByRole("dialog");
    expect(within(edit).getByText("Sửa Project DRX")).toBeTruthy();
    expect(within(edit).queryByRole("combobox", { name: "Người phụ trách" })).toBeNull();
    expect(within(edit).getByText("Chỉ Quản trị đổi được người phụ trách.")).toBeTruthy();
  });

  it("an Admin: a Project with several owners shows them read-only; one without owner asks for one", async () => {
    me.mockResolvedValue(meWith(["ADMIN"]));
    projects.mockResolvedValue(
      collection("one", [
        { ...shared, capabilities: can(true, false, "none") },
        { ...old, capabilities: can(true, false, "one") }
      ])
    );
    renderPage();
    await click(await screen.findByRole("button", { name: /Brix/ }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("combobox", { name: "Người phụ trách" })).toBeNull();
    expect(
      within(dialog).getByText(
        "Project có nhiều người phụ trách — chỉ Siêu quản trị đổi được danh sách này."
      )
    ).toBeTruthy();
    expect(within(dialog).getByText(OTHER.displayName)).toBeTruthy();
    await click(within(dialog).getByRole("button", { name: "Hủy" }));

    await click(screen.getByRole("button", { name: /Cát/ }));
    dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Project chưa có người phụ trách — chọn người phụ trách để lưu.")
    ).toBeTruthy();
    expect(within(dialog).getByRole("combobox", { name: "Người phụ trách" })).toBeTruthy();
  });

  it("the superadmin picks several owners (in order); editing sends the new list", async () => {
    me.mockResolvedValue(meWith(["ADMIN", "DIRECTOR", "LEADER"]));
    const superList = collection("many", [{ ...mine, capabilities: can(true, true, "many") }]);
    projects.mockResolvedValue(superList);
    const create = vi.spyOn(productionApi, "createProject").mockResolvedValue(superList);
    const update = vi
      .spyOn(productionApi, "updateProject")
      .mockResolvedValue(collection("many", []));
    renderPage(true);
    await screen.findByText("Axon");
    await click(screen.getByRole("button", { name: /Tạo Project/ }));
    let dialog = await screen.findByRole("dialog");
    fillNew(dialog, "FAX");
    await click(within(dialog).getByRole("button", { name: "Thêm người phụ trách" }));
    await pickOption(OTHER.displayName);
    await pickOption(ADMIN.displayName);
    expect(within(dialog).getByRole("button", { name: `Bỏ ${OTHER.displayName}` })).toBeTruthy();
    await click(within(dialog).getByRole("button", { name: "Tạo Project" }));
    expect(create).toHaveBeenCalledWith({
      code: "FAX",
      name: "Mới",
      description: null,
      ownerIds: [OTHER.id, ADMIN.id]
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await click(screen.getByRole("button", { name: /Axon/ }));
    dialog = await screen.findByRole("dialog");
    await click(within(dialog).getByRole("button", { name: "Thêm người phụ trách" }));
    await pickOption(OTHER.displayName);
    await click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));
    expect(update).toHaveBeenCalledWith(mine.id, { ownerIds: [ME.id, OTHER.id] });
  });

  it("delete is off (with the reason) once a Project has a job; a job-less own Project is deleted after confirming", async () => {
    const remove = vi
      .spyOn(productionApi, "deleteProject")
      .mockResolvedValue(collection("self", []));
    projects.mockResolvedValue(collection("self", [mine, shared]));
    renderPage();
    await screen.findByText("Axon");
    await click(within(rowOf("BRX")).getByRole("button", { name: "Tùy chọn cho Project BRX" }));
    const blocked = (await screen.findByText("Xoá Project")).closest("[role='menuitem']")!;
    expect(blocked.hasAttribute("data-disabled")).toBe(true);
    expect(
      within(blocked as HTMLElement).getByText(
        "Project đã có job — không xoá được (chỉ có thể ngừng hoạt động)."
      )
    ).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    cleanup();

    renderPage();
    await screen.findByText("Axon");
    await click(within(rowOf("AXP")).getByRole("button", { name: "Tùy chọn cho Project AXP" }));
    await click(await screen.findByText("Xoá Project"));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Xoá Project AXP?")).toBeTruthy();
    await click(within(confirm).getByRole("button", { name: "Xoá Project" }));
    expect(remove).toHaveBeenCalledWith(mine.id);
  });

  it("the Director reads: no create button, no edit, a read-only note", async () => {
    me.mockResolvedValue(meWith(["DIRECTOR"]));
    projects.mockResolvedValue(collection(null, [{ ...shared, capabilities: can(false, false) }]));
    renderPage();
    expect(await screen.findByText("Brix")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Tạo Project/ })).toBeNull();
    expect(screen.getByText(/Bạn đang xem danh sách Project/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Chỉ Project tôi phụ trách" })).toBeNull();
  });

  it("Staff / QC do not see the page", async () => {
    me.mockResolvedValue(meWith(["STAFF", "QC"]));
    renderPage();
    expect(await screen.findByText("Bạn không có quyền xem trang này")).toBeTruthy();
    expect(screen.queryByText("Brix")).toBeNull();
  });
});
