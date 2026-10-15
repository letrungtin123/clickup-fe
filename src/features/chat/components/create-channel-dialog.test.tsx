// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ChatChannelDetail } from "@/contracts/chat";
import type { Department } from "@/contracts/departments";
import { SessionValueContext } from "@/features/auth/session-context";
import { ApiError } from "@/lib/api/errors";
import type { SessionContext } from "@/lib/api/schemas";

import { chatApi } from "../api";
import { CreateChannelDialog } from "./create-channel-dialog";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
}));

// PD-053: a public channel belongs to one department and holds all of it — no member picker. PD-054: every channel
// takes the department selected in the switcher. Obviously fake ids and names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const sessionWith = (departments: Department[], currentDepartment: Department) =>
  ({
    user: { id: id(1), displayName: "Tôi Test", email: null },
    organization: { id: id(90), slug: "test-org", name: "Test org" },
    role: {
      id: id(91),
      organizationId: id(90),
      key: "member",
      name: "Nhân viên",
      permissions: ["channel.create"]
    },
    hasFullOrganizationAuthority: false,
    mustChangePassword: false,
    productionRoles: [],
    departments,
    canSwitchDepartment: departments.length > 1,
    currentDepartment
  }) as unknown as SessionContext;

beforeAll(() => {
  // cmdk (people picker) measures its list and scrolls the active option into view; jsdom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  if (!("scrollIntoView" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const setup = (departments: Department[], currentDepartment: Department) => {
  const directory = vi.spyOn(chatApi, "directory").mockResolvedValue({ items: [] });
  const create = vi
    .spyOn(chatApi, "create")
    .mockReturnValue(new Promise<ChatChannelDetail>(() => undefined));
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <SessionValueContext value={sessionWith(departments, currentDepartment)}>
          <TooltipProvider>
            <CreateChannelDialog open onOpenChange={() => undefined} />
          </TooltipProvider>
        </SessionValueContext>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { create, directory };
};

const submit = async (name: string) => {
  fireEvent.change(screen.getByLabelText("Tên kênh"), { target: { value: name } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Tạo kênh" }));
    await Promise.resolve();
  });
};

const memberPicker = () => screen.queryByPlaceholderText("Tìm theo tên…");
const departmentPicker = () => screen.queryByRole("radiogroup", { name: "Phòng ban" });
const note = () => screen.getByText(/^Kênh thuộc phòng ban/);

describe("CreateChannelDialog — channels belong to the selected department (PD-053 / PD-054)", () => {
  it("hides the member picker for a public channel and names the user's only department", async () => {
    const { create } = setup(["PHOTO_RETOUCH"], "PHOTO_RETOUCH");
    expect(memberPicker()).toBeNull();
    expect(departmentPicker()).toBeNull();
    // One department: no switcher to point at.
    expect(note().textContent).toBe("Kênh thuộc phòng ban Photo Retouch.");
    expect(screen.getByText(/sẽ tự động vào kênh và thấy kênh này/)).toBeTruthy();

    await submit("thông-báo");
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    // The department is always sent (harmless with one department); no hand-picked members.
    expect(create).toHaveBeenCalledWith({
      kind: "public",
      name: "thông-báo",
      description: null,
      department: "PHOTO_RETOUCH"
    });
  });

  it("uses the department selected in the switcher, with a note instead of a choice", async () => {
    const { create } = setup(["PHOTO_RETOUCH", "PRODUCTION"], "PRODUCTION");
    expect(departmentPicker()).toBeNull();
    expect(screen.queryByRole("radio", { name: "Photo Retouch" })).toBeNull();
    expect(note().textContent).toBe(
      "Kênh thuộc phòng ban Production (theo phòng ban đang chọn trên thanh trên cùng)."
    );

    await submit("chung");
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        kind: "public",
        name: "chung",
        description: null,
        department: "PRODUCTION"
      })
    );
  });

  it("sends the selected department for private channels too and searches people in it", async () => {
    const { create, directory } = setup(["PHOTO_RETOUCH", "PRODUCTION"], "PHOTO_RETOUCH");
    fireEvent.click(screen.getByRole("radio", { name: "Riêng tư" }));
    expect(memberPicker()).not.toBeNull();
    expect(departmentPicker()).toBeNull();
    expect(screen.queryByText(/sẽ tự động vào kênh và thấy kênh này/)).toBeNull();
    expect(note().textContent).toContain("Kênh thuộc phòng ban Photo Retouch");
    await waitFor(() =>
      expect(directory).toHaveBeenCalledWith(
        expect.objectContaining({ department: "PHOTO_RETOUCH" }),
        expect.anything()
      )
    );

    await submit("bí-mật");
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        kind: "private",
        name: "bí-mật",
        description: null,
        department: "PHOTO_RETOUCH",
        memberIds: []
      })
    );
  });

  it("shows the Vietnamese message when the server asks for a department", async () => {
    const { create } = setup(["PHOTO_RETOUCH"], "PHOTO_RETOUCH");
    create.mockRejectedValueOnce(
      new ApiError({ status: 400, code: "CHANNEL_DEPARTMENT_REQUIRED", message: "x" })
    );
    await submit("thông-báo");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Kênh cần thuộc một phòng ban. Chọn phòng ban trên thanh trên cùng rồi thử lại."
    );
  });
});
