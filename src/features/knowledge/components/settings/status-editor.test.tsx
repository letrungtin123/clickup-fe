// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { KnowledgeSpaceDetail, KnowledgeStatus } from "@/contracts/knowledge";

import { knowledgeApi } from "../../api";
import { SpaceStatusesSection } from "./status-editor";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

const defaults: KnowledgeStatus[] = [
  { id: id(1), name: "Nháp", color: "slate", group: "draft", position: 0 },
  { id: id(2), name: "Chờ duyệt", color: "amber", group: "draft", position: 1 },
  { id: id(3), name: "Đã ban hành", color: "green", group: "active", position: 2 },
  { id: id(4), name: "Cần cập nhật", color: "orange", group: "active", position: 3 },
  { id: id(5), name: "Hết hiệu lực", color: "gray", group: "retired", position: 4 }
];

const makeSpace = (statuses: KnowledgeStatus[] = defaults): KnowledgeSpaceDetail => ({
  id: id(100),
  name: "Quy trình Sản xuất",
  description: null,
  visibility: "private",
  color: "teal",
  icon: null,
  rank: "a",
  approvalRequired: false,
  myAccess: "manage",
  isMember: true,
  memberCount: 1,
  itemCount: 0,
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
  statuses,
  categories: [],
  tags: []
});

const setup = (space: KnowledgeSpaceDetail, editable = true) => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const ui = (next: KnowledgeSpaceDetail) => (
    <QueryClientProvider client={client}>
      <SpaceStatusesSection space={next} editable={editable} />
    </QueryClientProvider>
  );
  const view = render(ui(space));
  return { rerenderWith: (next: KnowledgeSpaceDetail) => view.rerender(ui(next)) };
};

const nameInputs = () =>
  screen.queryAllByRole<HTMLInputElement>("textbox", { name: /Tên trạng thái thứ/ });
const button = (name: string | RegExp) => screen.getByRole<HTMLButtonElement>("button", { name });
const isDisabled = (element: HTMLElement) =>
  element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SpaceStatusesSection", () => {
  it("shows the statuses by group, read-only, to non-managers", () => {
    setup(makeSpace(), false);
    expect(screen.getByRole("list", { name: "Trạng thái nhóm Bản nháp" }).textContent).toContain(
      "Chờ duyệt"
    );
    expect(
      screen.getByRole("list", { name: "Trạng thái nhóm Hết hiệu lực" }).textContent
    ).toContain("Hết hiệu lực");
    expect(nameInputs()).toHaveLength(0);
  });

  it("tracks unsaved changes and reverts them", () => {
    setup(makeSpace());
    expect(nameInputs()).toHaveLength(5);
    expect(isDisabled(button("Lưu trạng thái"))).toBe(true);

    fireEvent.change(nameInputs()[0] as HTMLInputElement, { target: { value: "Bản thảo" } });
    expect(screen.getByText("Có thay đổi chưa lưu")).toBeTruthy();
    expect(isDisabled(button("Lưu trạng thái"))).toBe(false);

    fireEvent.click(button("Hoàn tác"));
    expect(nameInputs()[0]?.value).toBe("Nháp");
    expect(screen.queryByText("Có thay đổi chưa lưu")).toBeNull();
  });

  it("validates before saving and marks the offending rows", () => {
    const replace = vi.spyOn(knowledgeApi, "replaceStatuses").mockResolvedValue({});
    setup(makeSpace());
    fireEvent.click(button("Thêm trạng thái"));
    expect(nameInputs()).toHaveLength(6);
    // A new row lands at the end of its group (Bản nháp) and takes focus.
    const fresh = nameInputs()[2] as HTMLInputElement;
    expect(fresh.value).toBe("");
    expect(document.activeElement).toBe(fresh);

    fireEvent.click(button("Lưu trạng thái"));
    expect(screen.getByRole("alert").textContent).toContain("Đặt tên cho mọi trạng thái.");
    expect(fresh.getAttribute("aria-invalid")).toBe("true");
    expect(replace).not.toHaveBeenCalled();
  });

  it("asks where the items of a removed status go, saves, then adopts the saved list", async () => {
    const replace = vi.spyOn(knowledgeApi, "replaceStatuses").mockResolvedValue({});
    const { rerenderWith } = setup(makeSpace());

    fireEvent.click(button("Xoá “Chờ duyệt”"));
    expect(nameInputs()).toHaveLength(4);
    fireEvent.click(button("Lưu trạng thái"));

    expect(
      screen.getByRole("heading", { name: "Chuyển các mục của trạng thái bị xoá sang…" })
    ).toBeTruthy();
    // Default destination: the first kept status of the same group.
    expect(
      screen.getByRole("combobox", { name: "Chuyển các mục của “Chờ duyệt” sang" }).textContent
    ).toContain("Nháp");

    fireEvent.click(button("Chuyển mục & lưu"));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith(id(100), {
      statuses: [
        { id: id(1), name: "Nháp", color: "slate", group: "draft" },
        { id: id(3), name: "Đã ban hành", color: "green", group: "active" },
        { id: id(4), name: "Cần cập nhật", color: "orange", group: "active" },
        { id: id(5), name: "Hết hiệu lực", color: "gray", group: "retired" }
      ],
      reassign: { [id(2)]: id(1) }
    });

    // The refetched space arrives after the save settled: it is our own result, not a conflict.
    await waitFor(() => expect(screen.queryByRole("heading", { name: /bị xoá sang/ })).toBeNull());
    const saved = defaults
      .filter((status) => status.id !== id(2))
      .map((status, position) => ({ ...status, position }));
    rerenderWith(makeSpace(saved));
    expect(nameInputs()).toHaveLength(4);
    expect(screen.queryByText("Có thay đổi chưa lưu")).toBeNull();
    expect(screen.queryByText(/vừa được thay đổi ở nơi khác/)).toBeNull();
  });

  it("keeps unsaved drafts when another manager changes the list, and can load theirs", () => {
    const { rerenderWith } = setup(makeSpace());
    fireEvent.change(nameInputs()[1] as HTMLInputElement, { target: { value: "Đang duyệt" } });

    const theirs = defaults.map((status) =>
      status.id === id(5) ? { ...status, name: "Ngừng áp dụng" } : status
    );
    rerenderWith(makeSpace(theirs));
    expect(screen.getByText(/vừa được thay đổi ở nơi khác/)).toBeTruthy();
    expect(nameInputs()[1]?.value).toBe("Đang duyệt");

    fireEvent.click(button("Tải bản mới"));
    expect(nameInputs().map((input) => input.value)).toEqual([
      "Nháp",
      "Chờ duyệt",
      "Đã ban hành",
      "Cần cập nhật",
      "Ngừng áp dụng"
    ]);
  });

  it("follows a server change silently while nothing is edited", () => {
    const { rerenderWith } = setup(makeSpace());
    rerenderWith(
      makeSpace(
        defaults.map((status) => (status.id === id(1) ? { ...status, name: "Bản thảo" } : status))
      )
    );
    expect(nameInputs()[0]?.value).toBe("Bản thảo");
    expect(screen.queryByText(/vừa được thay đổi ở nơi khác/)).toBeNull();
  });

  it("moves a row with Alt + arrow keys", () => {
    setup(makeSpace());
    const second = nameInputs()[1] as HTMLInputElement;
    fireEvent.keyDown(second, { key: "ArrowUp", altKey: true });
    expect(
      nameInputs()
        .map((input) => input.value)
        .slice(0, 2)
    ).toEqual(["Chờ duyệt", "Nháp"]);
    expect(screen.getByText(/Đã chuyển “Chờ duyệt” tới vị trí 1 trên 5/)).toBeTruthy();
  });
});
