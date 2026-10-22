// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionValueContext } from "@/features/auth/session-context";
import type { SessionContext } from "@/lib/api/schemas";

import { todayIn } from "../../format";
import { productionKeys } from "../../keys";
import { WorkEntryDialog } from "./work-entry-dialog";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() })
}));

// PD-080b "Nhập Task": only the processes priced for the project on the entry's Ngày nhận. Fake ids and names only.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Asia/Ho_Chi_Minh";
const today = todayIn(TZ);
const ME = { id: id(1), displayName: "Leader Test", email: null, avatarUrl: null };
const PROJECT = id(40);
const RETOUCH = id(80);
const BLEND = id(81);

beforeAll(() => {
  // Base UI / cmdk need these in jsdom.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  if (!("scrollIntoView" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined });
  }
});
afterEach(cleanup);

const rule = (processId: string, projectId = PROJECT) => ({
  id: `${processId.slice(0, 30)}99`,
  projectId,
  processId,
  creditPerImage: 2,
  moneyPerImage: null,
  effectiveFrom: today,
  effectiveTo: null
});

const renderEntry = (rules: ReturnType<typeof rule>[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(productionKeys.me(), {
    roles: ["LEADER"],
    isAdmin: false,
    teamId: null,
    jobPermissions: { view: "all", create: "all", update: "all", delete: "all" },
    taskCreate: "all",
    settings: { timezone: TZ }
  });
  client.setQueryData(productionKeys.members(), { items: [] });
  client.setQueryData(productionKeys.projects(), {
    items: [{ id: PROJECT, code: "AXP", name: "Project", active: true, clientName: null }]
  });
  client.setQueryData(productionKeys.processes(), {
    items: [
      { id: RETOUCH, name: "Retouch", isQc: false, sortOrder: 1, active: true },
      { id: BLEND, name: "Blend", isQc: false, sortOrder: 2, active: true }
    ]
  });
  client.setQueryData(productionKeys.shifts(), { items: [] });
  client.setQueryData(productionKeys.customFields(), { items: [] });
  client.setQueryData(productionKeys.creditMatrix(today), { at: today, projects: [], processes: [], rules });
  const session = { user: { id: ME.id, displayName: ME.displayName, email: "leader@example.test", avatarUrl: null } } as unknown as SessionContext;
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <SessionValueContext value={session}>
          <TooltipProvider>
            <WorkEntryDialog open onClose={() => undefined} initial={{ projectId: PROJECT }} />
          </TooltipProvider>
        </SessionValueContext>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return client;
};

const processPicker = () => screen.getByRole("combobox", { name: "Quy trình" });

describe("WorkEntryDialog — only priced processes (PD-080b)", () => {
  it("offers only the processes priced for the project on the entry's Ngày nhận", async () => {
    renderEntry([rule(RETOUCH), rule(BLEND, id(41))]);
    await act(async () => {
      fireEvent.click(processPicker());
      await Promise.resolve();
    });
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent ?? "");
    expect(options.some((text) => text.includes("Retouch"))).toBe(true);
    expect(options.some((text) => text.includes("Blend"))).toBe(false);
  });

  it("a project without any price that day: disabled, with “Project chưa có đơn giá — liên hệ Quản trị”", () => {
    renderEntry([rule(BLEND, id(41))]);
    expect(screen.getByText("Project chưa có đơn giá — liên hệ Quản trị")).toBeTruthy();
    expect(processPicker()).toHaveProperty("disabled", true);
  });

  it("a chosen process that loses its price is cleared, with a hint", async () => {
    const client = renderEntry([rule(RETOUCH), rule(BLEND)]);
    await act(async () => {
      fireEvent.click(processPicker());
      await Promise.resolve();
    });
    await act(async () => {
      const option = await screen.findByRole("option", { name: /Retouch/ });
      fireEvent.pointerDown(option);
      fireEvent.click(option);
      await Promise.resolve();
    });
    expect(processPicker().textContent).toContain("Retouch");
    await act(async () => {
      client.setQueryData(productionKeys.creditMatrix(today), { at: today, projects: [], processes: [], rules: [rule(BLEND)] });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText(/“Retouch” chưa có đơn giá ngày .* — chọn lại quy trình\./)).toBeTruthy());
    expect(within(processPicker()).queryByText("Retouch")).toBeNull();
  });
});
