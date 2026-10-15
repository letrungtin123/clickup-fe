// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { Department } from "@/contracts/departments";
import { SessionValueContext } from "@/features/auth/session-context";
import { writeStoredDepartment } from "@/features/departments/store";
import type { SessionContext } from "@/lib/api/schemas";
import { notifySessionEnd } from "@/lib/session-cleanup";

import { chatApi } from "../api";
import { BrowseChannelsDialog } from "./browse-channels-dialog";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// PD-054: "Duyệt kênh" lists the public channels of the department selected in the switcher. Obviously fake ids and
// names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = id(1);

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

afterEach(() => {
  cleanup();
  notifySessionEnd("ended");
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const renderBrowse = (departments: Department[], current: Department) => {
  const browse = vi
    .spyOn(chatApi, "browse")
    .mockResolvedValue({ items: [], pageInfo: { hasMore: false, nextCursor: null } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SessionValueContext value={sessionWith(departments, current)}>
          <TooltipProvider>
            <BrowseChannelsDialog open onOpenChange={() => undefined} />
          </TooltipProvider>
        </SessionValueContext>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { browse };
};

describe("BrowseChannelsDialog — department of the switcher (PD-054)", () => {
  it("asks for the selected department's channels and names it", async () => {
    const { browse } = renderBrowse(["PHOTO_RETOUCH", "PRODUCTION"], "PRODUCTION");
    await waitFor(() =>
      expect(browse).toHaveBeenCalledWith(
        expect.objectContaining({ department: "PRODUCTION" }),
        expect.anything()
      )
    );
    expect(screen.getByText(/Kênh công khai thuộc phòng ban/).textContent).toContain("Production");
  });

  it("follows a switch of department", async () => {
    const { browse } = renderBrowse(["PHOTO_RETOUCH", "PRODUCTION"], "PRODUCTION");
    await waitFor(() => expect(browse).toHaveBeenCalledTimes(1));
    act(() => writeStoredDepartment(ME, "PHOTO_RETOUCH"));
    await waitFor(() =>
      expect(browse).toHaveBeenLastCalledWith(
        expect.objectContaining({ department: "PHOTO_RETOUCH" }),
        expect.anything()
      )
    );
  });

  it("sends the only department of a single-department user", async () => {
    const { browse } = renderBrowse(["PHOTO_RETOUCH"], "PHOTO_RETOUCH");
    await waitFor(() =>
      expect(browse).toHaveBeenCalledWith(
        expect.objectContaining({ department: "PHOTO_RETOUCH" }),
        expect.anything()
      )
    );
  });
});
