// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatChannel } from "@/contracts/chat";
import type { Department } from "@/contracts/departments";
import { SessionValueContext } from "@/features/auth/session-context";
import { departmentsApi } from "@/features/departments/api";
import { readStoredDepartment, writeStoredDepartment } from "@/features/departments/store";
import type { SessionContext } from "@/lib/api/schemas";
import { notifySessionEnd } from "@/lib/session-cleanup";

import { makeChannel } from "../model/test-fixtures";
import { useEnsureConversationDepartment } from "./use-department-channels";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// PD-054: a conversation opened by link / notification switches to a department that shows it. Obviously fake ids
// (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = id(1);

const sessionWith = (departments: Department[]) =>
  ({
    user: { id: ME, displayName: "Tôi Test", email: null },
    organization: { id: id(90), slug: "test-org", name: "Test org" },
    role: { id: id(91), organizationId: id(90), key: "member", name: "Nhân viên", permissions: [] },
    hasFullOrganizationAuthority: false,
    mustChangePassword: false,
    productionRoles: [],
    departments,
    canSwitchDepartment: departments.length > 1,
    currentDepartment: "PHOTO_RETOUCH"
  }) as unknown as SessionContext;

const production = makeChannel({ id: id(11), department: "PRODUCTION", audienceDepartments: ["PRODUCTION"] });
const retouch = makeChannel({ id: id(12), audienceDepartments: ["PHOTO_RETOUCH"] });

afterEach(() => {
  cleanup();
  notifySessionEnd("ended");
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const renderEnsure = (departments: Department[], initial: ChatChannel | undefined) => {
  const setCurrent = vi
    .spyOn(departmentsApi, "setCurrent")
    .mockImplementation((department) => Promise.resolve({ currentDepartment: department }));
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <SessionValueContext value={sessionWith(departments)}>{children}</SessionValueContext>
      </QueryClientProvider>
    </MemoryRouter>
  );
  const view = renderHook(
    ({ channel }: { channel: ChatChannel | undefined }) => useEnsureConversationDepartment(channel),
    { wrapper, initialProps: { channel: initial } }
  );
  return { ...view, setCurrent };
};

describe("useEnsureConversationDepartment", () => {
  it("switches to a department that shows the conversation once it is loaded", () => {
    const { rerender, setCurrent } = renderEnsure(["PHOTO_RETOUCH", "PRODUCTION"], undefined);
    expect(setCurrent).not.toHaveBeenCalled();
    rerender({ channel: production });
    expect(readStoredDepartment(ME)).toBe("PRODUCTION");
    expect(setCurrent).toHaveBeenCalledWith("PRODUCTION");
  });

  it("checks once per conversation: switching back by hand is respected", () => {
    const { rerender, setCurrent } = renderEnsure(["PHOTO_RETOUCH", "PRODUCTION"], production);
    expect(readStoredDepartment(ME)).toBe("PRODUCTION");
    act(() => writeStoredDepartment(ME, "PHOTO_RETOUCH"));
    rerender({ channel: { ...production, unreadCount: 1 } });
    expect(readStoredDepartment(ME)).toBe("PHOTO_RETOUCH");
    expect(setCurrent).toHaveBeenCalledTimes(1);
  });

  it("leaves the department alone when it already shows the conversation", () => {
    const { setCurrent } = renderEnsure(["PHOTO_RETOUCH", "PRODUCTION"], retouch);
    expect(setCurrent).not.toHaveBeenCalled();
    expect(readStoredDepartment(ME)).toBeNull();
  });

  it("never switches for people in one department (the conversation shows everywhere)", () => {
    const { setCurrent } = renderEnsure(["PHOTO_RETOUCH"], production);
    expect(setCurrent).not.toHaveBeenCalled();
  });
});
