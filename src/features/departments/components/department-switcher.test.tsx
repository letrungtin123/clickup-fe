// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ChatChannelCollection } from "@/contracts/chat";
import type { Department } from "@/contracts/departments";
import { SessionValueContext } from "@/features/auth/session-context";
import { chatApi } from "@/features/chat/api";
import { chatKeys } from "@/features/chat/keys";
import { makeChannel, userA } from "@/features/chat/model/test-fixtures";
import type { SessionContext } from "@/lib/api/schemas";
import { notifySessionEnd } from "@/lib/session-cleanup";

import { writeStoredDepartment } from "../store";
import { DepartmentSwitcher } from "./department-switcher";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// PD-054: the switcher counts the chat waiting in the other departments. Obviously fake ids and names (the repository
// is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = id(1);
const both: Department[] = ["PHOTO_RETOUCH", "PRODUCTION"];

const session = {
  user: { id: ME, displayName: "Tôi Test", email: null },
  organization: { id: id(90), slug: "test-org", name: "Test org" },
  role: { id: id(91), organizationId: id(90), key: "member", name: "Nhân viên", permissions: [] },
  hasFullOrganizationAuthority: false,
  mustChangePassword: false,
  productionRoles: [],
  departments: both,
  canSwitchDepartment: true,
  currentDepartment: "PHOTO_RETOUCH"
} as unknown as SessionContext;

const collection: ChatChannelCollection = {
  items: [
    // Production: 2 mentions + a 3-message DM; a plain unread channel only gets a dot (not counted).
    makeChannel({
      id: id(11),
      department: "PRODUCTION",
      audienceDepartments: ["PRODUCTION"],
      mentionCount: 2,
      unreadCount: 4
    }),
    makeChannel({ id: id(12), department: "PRODUCTION", audienceDepartments: ["PRODUCTION"], unreadCount: 6 }),
    makeChannel({
      id: id(13),
      kind: "dm",
      name: null,
      department: null,
      participants: [userA],
      audienceDepartments: ["PRODUCTION"],
      unreadCount: 3
    }),
    // Photo Retouch: 1 mention.
    makeChannel({ id: id(14), audienceDepartments: ["PHOTO_RETOUCH"], mentionCount: 1, unreadCount: 1 }),
    // Both departments: never "elsewhere".
    makeChannel({
      id: id(15),
      kind: "dm",
      name: null,
      department: null,
      participants: [userA],
      audienceDepartments: both,
      unreadCount: 8
    })
  ]
};

afterEach(() => {
  cleanup();
  notifySessionEnd("ended");
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const renderSwitcher = (variant: "sidebar" | "rail" | "topbar") => {
  vi.spyOn(chatApi, "channels").mockResolvedValue(collection);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(chatKeys.channels(), collection);
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <SessionValueContext value={session}>
          <TooltipProvider>
            <DepartmentSwitcher variant={variant} />
          </TooltipProvider>
        </SessionValueContext>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

const trigger = () => screen.getByRole("button", { name: /^Phòng ban: / });

describe("DepartmentSwitcher — other-department chat unread (PD-054)", () => {
  it("shows the total waiting elsewhere on the trigger, in words for screen readers", () => {
    renderSwitcher("sidebar");
    expect(trigger().getAttribute("aria-label")).toBe(
      "Phòng ban: Photo Retouch. Đổi phòng ban. 5 tin chưa đọc ở phòng ban khác"
    );
    expect(trigger().textContent).toContain("5");
  });

  it("counts per department in the menu (none on the selected one)", async () => {
    renderSwitcher("topbar");
    await act(async () => {
      fireEvent.click(trigger());
      await Promise.resolve();
    });
    expect((await screen.findByRole("menuitemradio", { name: /^Production/ })).textContent).toContain(
      "5 tin chưa đọc"
    );
    expect(screen.getByRole("menuitemradio", { name: /^Photo Retouch/ }).textContent).not.toContain(
      "chưa đọc"
    );
  });

  it("follows the selected department and hides the count when nothing waits elsewhere", () => {
    renderSwitcher("rail");
    act(() => writeStoredDepartment(ME, "PRODUCTION"));
    expect(trigger().getAttribute("aria-label")).toBe(
      "Phòng ban: Production. Đổi phòng ban. 1 tin chưa đọc ở phòng ban khác"
    );
    act(() => writeStoredDepartment(ME, "PHOTO_RETOUCH"));
    expect(trigger().textContent).toBe("5");
  });
});

describe("DepartmentSwitcher — nothing elsewhere", () => {
  it("shows no count", () => {
    vi.spyOn(chatApi, "channels").mockResolvedValue({ items: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(chatKeys.channels(), { items: [] });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <SessionValueContext value={session}>
            <TooltipProvider>
              <DepartmentSwitcher variant="sidebar" />
            </TooltipProvider>
          </SessionValueContext>
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(trigger().getAttribute("aria-label")).toBe("Phòng ban: Photo Retouch. Đổi phòng ban");
    expect(trigger().textContent).toBe("Photo Retouch");
  });
});
