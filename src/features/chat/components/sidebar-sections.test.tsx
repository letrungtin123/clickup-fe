// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ChatChannelCollection } from "@/contracts/chat";
import type { Department } from "@/contracts/departments";
import { SessionValueContext } from "@/features/auth/session-context";
import { writeStoredDepartment } from "@/features/departments/store";
import type { SessionContext } from "@/lib/api/schemas";
import { notifySessionEnd } from "@/lib/session-cleanup";

import { chatApi } from "../api";
import { chatKeys } from "../keys";
import { makeChannel, userA, userB } from "../model/test-fixtures";
import { useChannelSettingsStore } from "../model/ui-state";
import { ChatNavBadge } from "./chat-nav-badge";
import { ChannelsSection, DirectMessagesSection } from "./sidebar-sections";

// PD-054: the sidebar shows the conversations of the department selected in the switcher. Obviously fake ids and
// names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = id(1);
const both: Department[] = ["PHOTO_RETOUCH", "PRODUCTION"];

const sessionWith = (departments: Department[], currentDepartment: Department) =>
  ({
    user: { id: ME, displayName: "Tôi Test", email: null },
    organization: { id: id(90), slug: "test-org", name: "Test org" },
    role: { id: id(91), organizationId: id(90), key: "member", name: "Nhân viên", permissions: [] },
    hasFullOrganizationAuthority: false,
    mustChangePassword: false,
    productionRoles: [],
    departments,
    canSwitchDepartment: departments.length > 1,
    currentDepartment
  }) as unknown as SessionContext;

const collection: ChatChannelCollection = {
  items: [
    makeChannel({ id: id(11), name: "retouch-chung", audienceDepartments: ["PHOTO_RETOUCH"] }),
    makeChannel({
      id: id(12),
      kind: "private",
      name: "production-kín",
      department: "PRODUCTION",
      audienceDepartments: ["PRODUCTION"],
      mentionCount: 2,
      unreadCount: 2
    }),
    makeChannel({ id: id(13), name: "toàn-công-ty", department: null, audienceDepartments: both }),
    makeChannel({
      id: id(14),
      kind: "dm",
      name: null,
      department: null,
      participants: [userA],
      audienceDepartments: ["PRODUCTION"],
      unreadCount: 1
    }),
    makeChannel({
      id: id(15),
      kind: "dm",
      name: null,
      department: null,
      participants: [userB],
      audienceDepartments: both
    })
  ]
};

afterEach(() => {
  cleanup();
  notifySessionEnd("ended");
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const renderSidebar = (departments: Department[], current: Department) => {
  vi.spyOn(chatApi, "channels").mockResolvedValue(collection);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(chatKeys.channels(), collection);
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <SessionValueContext value={sessionWith(departments, current)}>
          <TooltipProvider>
            <section aria-label="Kênh">
              <ChannelsSection />
            </section>
            <section aria-label="Tin nhắn trực tiếp">
              <DirectMessagesSection />
            </section>
            <span data-testid="chat-badge" className="relative">
              <ChatNavBadge />
            </span>
          </TooltipProvider>
        </SessionValueContext>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

const titles = (section: string) =>
  within(screen.getByRole("region", { name: section }))
    .queryAllByRole("link")
    // Row names start with the conversation title ("production-kín, kênh riêng tư, 2 lượt nhắc tên…").
    .map((link) => link.getAttribute("aria-label")?.split(",")[0]);

describe("sidebar chat sections follow the department switcher (PD-054)", () => {
  it("lists the selected department's conversations, org-wide ones everywhere", () => {
    renderSidebar(both, "PHOTO_RETOUCH");
    expect(titles("Kênh")).toEqual(["retouch-chung", "toàn-công-ty"]);
    expect(titles("Tin nhắn trực tiếp")).toEqual([userB.displayName]);
    // Production's mention + DM wait elsewhere: the chat badge counts the selected department only.
    expect(screen.getByTestId("chat-badge").textContent).toBe("");
  });

  it("follows a switch of department", () => {
    renderSidebar(both, "PHOTO_RETOUCH");
    act(() => writeStoredDepartment(ME, "PRODUCTION"));
    expect(titles("Kênh")).toEqual(["production-kín", "toàn-công-ty"]);
    expect(titles("Tin nhắn trực tiếp")).toEqual([userA.displayName, userB.displayName]);
    expect(screen.getByTestId("chat-badge").textContent).toBe("3");
  });

  it("never hides a conversation completely: one department shows everything it shares nothing with", () => {
    renderSidebar(["PHOTO_RETOUCH"], "PHOTO_RETOUCH");
    expect(titles("Kênh")).toEqual(["retouch-chung", "production-kín", "toàn-công-ty"]);
    expect(titles("Tin nhắn trực tiếp")).toEqual([userA.displayName, userB.displayName]);
  });
});

describe("row \"…\" menu (owner, 2026-10-16)", () => {
  it("opens the conversation settings at the chosen tab, without opening the conversation", async () => {
    renderSidebar(both, "PHOTO_RETOUCH");
    const trigger = screen.getByRole("button", { name: "Tùy chọn cho retouch-chung" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cài đặt & thông báo" }));
    expect(useChannelSettingsStore.getState().target).toEqual({ channelId: id(11), tab: "settings" });
    act(() => useChannelSettingsStore.getState().close());
  });

  it("offers Thành viên for channels and group DMs, not for a 1:1 DM", async () => {
    renderSidebar(both, "PHOTO_RETOUCH");
    fireEvent.click(screen.getByRole("button", { name: `Tùy chọn cho ${userB.displayName}` }));
    expect(await screen.findByRole("menuitem", { name: "Thông tin cuộc trò chuyện" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Thành viên" })).toBeNull();
  });
});
