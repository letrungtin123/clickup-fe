// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ChannelCapabilities, ChatChannelDetail } from "@/contracts/chat";
import { SessionValueContext } from "@/features/auth/session-context";
import type { SessionContext } from "@/lib/api/schemas";

import { chatApi } from "../api";
import { makeChannel, me } from "../model/test-fixtures";
import { ChannelSettingsDialog } from "./channel-settings-dialog";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
}));

const session = {
  user: { id: me.id, displayName: me.displayName, email: me.email },
  organization: { id: "org", name: "Org" },
  role: { permissions: [] },
  hasFullOrganizationAuthority: false,
  mustChangePassword: false,
  productionRoles: [],
  departments: ["PHOTO_RETOUCH"],
  canSwitchDepartment: false,
  currentDepartment: "PHOTO_RETOUCH"
} as unknown as SessionContext;

const adminCapabilities: ChannelCapabilities = {
  canRead: true,
  canPost: true,
  canUpdate: true,
  canChangeKind: true,
  canArchive: true,
  canDelete: true,
  canManageMembers: true,
  canManageAdmins: true,
  canModerate: true,
  canJoin: false,
  canLeave: true
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

const renderMembers = (channel: ChatChannelDetail, tab: "members" | "about" = "members") => {
  vi.spyOn(chatApi, "members").mockResolvedValue({
    items: [],
    pageInfo: { hasMore: false, nextCursor: null }
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <SessionValueContext value={session}>
          <TooltipProvider>
            <ChannelSettingsDialog
              channel={channel}
              open
              tab={tab}
              onTabChange={() => undefined}
              onOpenChange={() => undefined}
            />
          </TooltipProvider>
        </SessionValueContext>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

describe("ChannelSettingsDialog — department channels (PD-053)", () => {
  it("shows the department of a public channel and no manual 'Thêm' (the whole department is in)", () => {
    renderMembers({
      ...makeChannel({ kind: "public", department: "PRODUCTION", myRole: "admin" }),
      capabilities: adminCapabilities
    });
    expect(screen.getAllByTitle("Phòng ban Production").length).toBeGreaterThan(0);
    expect(screen.getByText(/tự động ở trong kênh — không cần thêm từng người/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thêm" })).toBeNull();
  });

  it("keeps 'Thêm' for private channels", () => {
    renderMembers({
      ...makeChannel({ kind: "private", department: null, myRole: "admin" }),
      capabilities: adminCapabilities
    });
    expect(screen.getByRole("button", { name: "Thêm" })).toBeTruthy();
    expect(screen.queryByText(/không cần thêm từng người/)).toBeNull();
    expect(screen.queryByTitle(/^Phòng ban /)).toBeNull();
  });
});

describe("ChannelSettingsDialog — channels follow the selected department (PD-054)", () => {
  it("turns a channel without department public in the selected department, with a note", async () => {
    const update = vi.spyOn(chatApi, "update").mockReturnValue(new Promise(() => undefined));
    renderMembers(
      {
        ...makeChannel({ kind: "private", department: null, myRole: "admin" }),
        capabilities: adminCapabilities
      },
      "about"
    );
    fireEvent.click(screen.getByRole("radio", { name: "Công khai" }));
    expect((await screen.findByText(/^Kênh thuộc phòng ban/)).textContent).toBe(
      "Kênh thuộc phòng ban Photo Retouch."
    );
    expect(screen.queryByRole("radiogroup", { name: "Phòng ban" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
      await Promise.resolve();
    });
    expect(update).toHaveBeenCalledWith(makeChannel().id, { kind: "public", department: "PHOTO_RETOUCH" });
  });

  it("invites people from the private channel's department", async () => {
    const directory = vi.spyOn(chatApi, "directory").mockResolvedValue({ items: [] });
    renderMembers({
      ...makeChannel({
        kind: "private",
        department: "PRODUCTION",
        audienceDepartments: ["PRODUCTION"],
        myRole: "admin"
      }),
      capabilities: adminCapabilities
    });
    // A private channel shows its department too.
    expect(screen.getAllByTitle("Phòng ban Production").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    await waitFor(() =>
      expect(directory).toHaveBeenCalledWith(
        expect.objectContaining({ department: "PRODUCTION" }),
        expect.anything()
      )
    );
  });
});
