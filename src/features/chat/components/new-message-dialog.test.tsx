// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionValueContext } from "@/features/auth/session-context";
import type { SessionContext } from "@/lib/api/schemas";

import { chatApi } from "../api";
import { dmPickLimit } from "../model/channels";
import { NewMessageDialog } from "./new-message-dialog";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
}));

// "Tin nhắn mới" for staff (1:1 with a colleague) and for people who may create groups. Obviously fake
// ids, names and addresses (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const person = (n: number, name: string) => ({ id: id(n), displayName: name, email: null, avatarUrl: null });
const AN = person(2, "An Test");
const BINH = person(3, "Bình Test");

const sessionWith = (permissions: string[]) =>
  ({
    user: { id: id(1), displayName: "Tôi Test", email: null },
    organization: { id: id(90), slug: "test-org", name: "Test org" },
    role: { id: id(91), organizationId: id(90), key: "member", name: "Nhân viên", permissions },
    hasFullOrganizationAuthority: false,
    mustChangePassword: false,
    productionRoles: [],
    departments: ["PHOTO_RETOUCH"],
    canSwitchDepartment: false,
    currentDepartment: "PHOTO_RETOUCH"
  }) as unknown as SessionContext;

beforeAll(() => {
  // cmdk measures its list and scrolls the active option into view; jsdom has neither.
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

const setup = async (permissions: string[]) => {
  const directory = vi.spyOn(chatApi, "directory").mockResolvedValue({ items: [AN, BINH] });
  const openDm = vi.spyOn(chatApi, "openDm").mockReturnValue(new Promise(() => undefined));
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <SessionValueContext value={sessionWith(permissions)}>
          <TooltipProvider>
            <NewMessageDialog open onOpenChange={() => undefined} />
          </TooltipProvider>
        </SessionValueContext>
      </QueryClientProvider>
    </MemoryRouter>
  );
  await screen.findByRole("option", { name: /An Test/ });
  return { directory, openDm };
};

const pick = async (name: RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("option", { name }));
    await Promise.resolve();
  });
};

const chips = () =>
  screen.queryAllByRole("button", { name: /^Bỏ chọn / }).map((button) => button.getAttribute("aria-label"));

describe("dmPickLimit", () => {
  it("allows groups only with the right to create channels", () => {
    expect(dmPickLimit(false)).toBe(1);
    expect(dmPickLimit(true)).toBeGreaterThan(1);
  });
});

describe("NewMessageDialog — staff DM 1:1", () => {
  it("searches colleagues for a DM and keeps exactly one person (a new pick replaces the old one)", async () => {
    const { directory, openDm } = await setup([]);
    expect(directory).toHaveBeenCalledWith(expect.objectContaining({ purpose: "dm" }), expect.anything());
    expect(screen.getByText(/Bạn nhắn được 1:1 với đồng nghiệp/)).toBeTruthy();
    // No e-mail search without member.view.
    expect(screen.getByPlaceholderText("Tìm theo tên…")).toBeTruthy();

    await pick(/An Test/);
    expect(chips()).toEqual(["Bỏ chọn An Test"]);
    await pick(/Bình Test/);
    expect(chips()).toEqual(["Bỏ chọn Bình Test"]);
    // The other person stays pickable (it replaces the choice), never a second chip.
    expect(screen.getByRole("option", { name: /An Test/ }).getAttribute("aria-disabled")).not.toBe("true");

    const start = screen.getByRole("button", { name: "Bắt đầu trò chuyện" });
    await act(async () => {
      fireEvent.click(start);
      await Promise.resolve();
    });
    await waitFor(() => expect(openDm).toHaveBeenCalledWith([BINH.id]));
  });

  it("keeps group conversations for people who may create channels", async () => {
    await setup(["channel.create"]);
    expect(screen.queryByText(/Bạn nhắn được 1:1 với đồng nghiệp/)).toBeNull();
    await pick(/An Test/);
    await pick(/Bình Test/);
    expect(chips()).toEqual(["Bỏ chọn An Test", "Bỏ chọn Bình Test"]);
    expect(screen.getByRole("button", { name: "Tạo nhóm trò chuyện" })).toBeTruthy();
  });
});
