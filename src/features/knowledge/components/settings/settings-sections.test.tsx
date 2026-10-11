// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { KnowledgeMember, KnowledgeSpaceDetail } from "@/contracts/knowledge";
import { SessionValueContext } from "@/features/auth/session-context";
import type { SessionContext } from "@/lib/api/schemas";

import { knowledgeApi } from "../../api";
import { SpaceApprovalSection } from "./approval-section";
import { SpaceDangerSection } from "./danger-section";
import { SpaceGeneralSection } from "./general-section";
import { SpaceMembersSection } from "./members-section";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const me = { id: id(1), displayName: "Lê Tín", email: "tin@example.test", avatarUrl: null };

const space: KnowledgeSpaceDetail = {
  id: id(100),
  name: "Quy trình Sản xuất",
  description: "Các bước sản xuất.",
  visibility: "private",
  color: "teal",
  icon: null,
  rank: "a",
  approvalRequired: false,
  myAccess: "manage",
  isMember: true,
  memberCount: 2,
  itemCount: 4,
  capabilities: {
    canRead: true,
    canComment: true,
    canEdit: true,
    canManage: true,
    canViewAudit: true,
    canPurge: true,
    canUpdate: true,
    canManageMembers: true,
    canArchive: true
  },
  archivedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  statuses: [],
  categories: [],
  tags: []
};

const session = {
  user: me,
  organization: { id: "org", name: "Org" },
  role: { permissions: [] },
  hasFullOrganizationAuthority: false,
  mustChangePassword: false
} as unknown as SessionContext;

const renderWith = (children: ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <SessionValueContext.Provider value={session}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/k/${space.id}/settings`]}>
          <Routes>
            <Route path="/k/:spaceId/settings" element={children} />
            <Route path="/k" element={<p>Trang tri thức</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </SessionValueContext.Provider>
  );
};

const button = (name: string | RegExp) => screen.getByRole<HTMLButtonElement>("button", { name });
const isDisabled = (element: HTMLElement) =>
  element.hasAttribute("disabled") ||
  element.getAttribute("aria-disabled") === "true" ||
  element.hasAttribute("data-disabled");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Thông tin chung", () => {
  it("sends only the fields that changed", async () => {
    const update = vi.spyOn(knowledgeApi, "updateSpace").mockResolvedValue({});
    renderWith(<SpaceGeneralSection space={space} editable />);
    fireEvent.change(screen.getByLabelText(/Mô tả/), { target: { value: "  Quy trình in ấn.  " } });
    fireEvent.click(button("Lưu thay đổi"));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(space.id, { description: "Quy trình in ấn." })
    );
  });

  it("is a summary for people who cannot edit", () => {
    renderWith(
      <SpaceGeneralSection
        space={{
          ...space,
          myAccess: "view",
          capabilities: { ...space.capabilities, canManage: false }
        }}
        editable={false}
      />
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Chỉ xem")).toBeTruthy();
    expect(screen.getByText("Riêng tư")).toBeTruthy();
  });
});

describe("Bước duyệt", () => {
  it("saves the switch at once", async () => {
    const update = vi.spyOn(knowledgeApi, "updateSpace").mockResolvedValue({});
    renderWith(<SpaceApprovalSection space={space} />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(update).toHaveBeenCalledWith(space.id, { approvalRequired: true }));
  });
});

describe("Thành viên", () => {
  const members: KnowledgeMember[] = [
    {
      user: { id: id(2), displayName: "An", email: "an@example.test", avatarUrl: null },
      accessLevel: "submit",
      createdAt: space.createdAt
    },
    { user: me, accessLevel: "manage", createdAt: space.createdAt }
  ];

  it("lists managers first and protects the last manager", async () => {
    vi.spyOn(knowledgeApi, "members").mockResolvedValue({ items: members });
    renderWith(<SpaceMembersSection space={space} canManage />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows[0]?.textContent).toContain("Lê Tín (bạn)");
    expect(isDisabled(screen.getByRole("combobox", { name: "Mức quyền của Lê Tín" }))).toBe(true);
    expect(isDisabled(button("Rời khỏi kho"))).toBe(true);
    expect(isDisabled(button("Gỡ An khỏi kho"))).toBe(false);
    expect(screen.getByText(/Kho luôn cần ít nhất một Quản lý/)).toBeTruthy();
  });

  it("is read-only for non-managers", async () => {
    vi.spyOn(knowledgeApi, "members").mockResolvedValue({ items: members });
    renderWith(<SpaceMembersSection space={space} canManage={false} />);
    await screen.findAllByRole("listitem");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Gỡ|Rời/ })).toBeNull();
  });
});

describe("Xoá kho", () => {
  it("needs the space name typed before deleting, then leaves for /k", async () => {
    const remove = vi.spyOn(knowledgeApi, "deleteSpace").mockResolvedValue({});
    renderWith(<SpaceDangerSection space={space} />);
    fireEvent.click(button("Xoá kho"));
    const confirm = await screen.findByRole("button", { name: "Xoá vĩnh viễn" });
    const field = screen.getByLabelText(/để xác nhận/);

    fireEvent.change(field, { target: { value: "Quy trình" } });
    expect(isDisabled(confirm)).toBe(true);
    // Decomposed accents (macOS input) and stray spaces still match.
    fireEvent.change(field, { target: { value: ` ${space.name.normalize("NFD")} ` } });
    expect(isDisabled(confirm)).toBe(false);

    fireEvent.click(confirm);
    await waitFor(() => expect(remove).toHaveBeenCalledWith(space.id));
    expect(await screen.findByText("Trang tri thức")).toBeTruthy();
  });
});
