// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ProductionMe } from "@/contracts/production-catalog";
import type { MyOverview } from "@/contracts/production-my-overview";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { jobsApi } from "@/features/production/jobs-api";
import { myOverviewApi } from "@/features/production/my-overview/queries";
import {
  ME,
  NOW,
  TZ,
  overviewOf,
  sampleLines,
  sampleQcLines,
  statuses,
  taskOf,
  withMoves,
  workflowFixture
} from "@/features/production/my-overview/test-fixtures";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionMyOverviewRoute } from "./my-overview";

// PD-081 — "Tổng quan của tôi". Obviously fake ids, codes and names (public repository).
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() })
}));

const meWith = (roles: string[], taskCreate: "none" | "own" | "all" = "own") =>
  ({
    roles,
    isAdmin: false,
    teamId: null,
    jobPermissions: { view: "own", create: taskCreate, update: "own", delete: "none" },
    taskCreate,
    features: [],
    settings: { timezone: TZ, kpiCloseDay: 25, kpiCloseDays: [{ fromPeriod: null, closeDay: 25 }] }
  }) as unknown as ProductionMe;

const session = {
  user: { ...ME, email: "viewer@example.test" },
  role: { permissions: [] },
  hasFullOrganizationAuthority: false,
  productionRoles: ["STAFF"],
  departments: ["PHOTO_RETOUCH"]
} as unknown as SessionContext;

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
};
const search = () => new URLSearchParams(screen.getByTestId("location").textContent ?? "");

const renderRoute = (entry = "/production/my-overview") => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[entry]}>
            <ProductionMyOverviewRoute />
            <LocationProbe />
          </MemoryRouter>
        </TooltipProvider>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

let get: MockInstance<typeof myOverviewApi.get>;
let transition: MockInstance<typeof jobsApi.transitionTask>;
let me: MockInstance<typeof productionApi.me>;
let answer: MyOverview;

/** The page once the overview has loaded (the header shows before it). */
const ready = () => screen.findByRole("group", { name: "Tổng quan task" });
const list = () => screen.getByRole("region", { name: /Việc của tôi|Đang làm|Xong|Trễ/ });
const rowOf = (code: string) =>
  screen.getByRole("button", { name: `Mở task #${code}` }).closest("li")!;
const codesInList = () =>
  screen
    .queryAllByRole("button", { name: /^Mở task #/ })
    .map((button) => button.getAttribute("aria-label")!.replace("Mở task #", ""));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  answer = overviewOf(Object.values(sampleLines()));
  me = vi.spyOn(productionApi, "me").mockResolvedValue(meWith(["STAFF"]));
  vi.spyOn(productionApi, "workflow").mockResolvedValue(workflowFixture);
  get = vi.spyOn(myOverviewApi, "get").mockImplementation(() => Promise.resolve(answer));
  transition = vi.spyOn(jobsApi, "transitionTask");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Tổng quan của tôi (PD-081)", () => {
  it("greets me, says what is shown, my points and KPI, the 4 tags of a Staff member, what needs me and my list in order", async () => {
    renderRoute();
    expect(await screen.findByRole("heading", { level: 1, name: "Chào Người Thử" })).toBeTruthy();
    await ready();
    expect(
      screen.getByText("Hôm nay, 22/10 · đến hạn hôm nay + task trễ và bị trả sửa từ trước")
    ).toBeTruthy();
    expect(get).toHaveBeenCalledWith({ from: "2026-10-22", to: "2026-10-22" }, expect.anything());
    const points = screen.getByRole("region", { name: "Điểm của tôi" });
    expect(within(points).getByText("26,4")).toBeTruthy();
    expect(within(points).getByText("Kỳ 10/2026")).toBeTruthy();
    expect(within(points).getByText(/1\.284 \/ 2\.600 điểm/)).toBeTruthy();
    expect(
      within(points).getByText("Còn 3 ngày làm việc · cần khoảng 439 điểm/ngày để đạt KPI")
    ).toBeTruthy();
    expect(
      within(points)
        .getByRole("link", { name: /Mở Bảng điểm/ })
        .getAttribute("href")
    ).toBe("/production/scores?period=2026-10");
    // No money anywhere on the page.
    expect(document.body.textContent).not.toMatch(/₫|VND|tiền/i);
    const tags = within(screen.getByRole("group", { name: "Tổng quan task" })).getAllByRole(
      "button"
    );
    expect(tags.map((tag) => tag.textContent)).toEqual([
      expect.stringContaining("Việc của tôi6"),
      expect.stringContaining("Đang làm5"),
      expect.stringContaining("Xong1"),
      expect.stringContaining("Trễ2")
    ]);
    const needs = screen.getByRole("region", { name: "Cần bạn xử lý" });
    expect(
      within(needs)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["1 task bị QC trả sửa", "2 task trễ", "2 task đến hạn trong 3h"]);
    expect(codesInList()).toEqual(["1303", "1302", "1361", "1362", "1312", "1355"]);
    // A line sent back: the QC's note under it; the late one in red; due soon with its core time left.
    expect(
      within(rowOf("1303")).getByText("“Viền nền ảnh 3, 7, 12 chưa sạch — cắt lại.”")
    ).toBeTruthy();
    expect(within(rowOf("1302")).getByText("Trễ · 1 ngày")).toBeTruthy();
    expect(within(rowOf("1361")).getByText("còn 30m")).toBeTruthy();
    expect(within(rowOf("1312")).getByText("Done 11:05 · đang chờ QC 3h")).toBeTruthy();
    expect(within(rowOf("1355")).getByText("Xong · đã qua QC")).toBeTruthy();
    // Staff: no QC tag, no QC queue.
    expect(screen.queryByText("Chờ tôi QC")).toBeNull();
  });

  it("a tag filters the list (again → back to Việc của tôi); a 'Cần bạn xử lý' item picks its filter; all kept in the URL", async () => {
    renderRoute();
    await ready();
    const tagButton = (name: string) =>
      within(screen.getByRole("group", { name: "Tổng quan task" })).getByRole("button", {
        name: new RegExp(`^${name}`)
      });
    fireEvent.click(tagButton("Trễ"));
    expect(search().get("tag")).toBe("late");
    expect(codesInList()).toEqual(["1303", "1302"]);
    expect(tagButton("Trễ").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(tagButton("Trễ"));
    expect(search().get("tag")).toBeNull();
    expect(codesInList()).toHaveLength(6);
    fireEvent.click(
      within(screen.getByRole("region", { name: "Cần bạn xử lý" })).getByRole("button", {
        name: "1 task bị QC trả sửa"
      })
    );
    expect(search().get("tag")).toBe("inProgress");
    expect(search().get("status")).toBe(statuses.REWORK.id);
    expect(codesInList()).toEqual(["1303"]);
    fireEvent.click(within(list()).getByRole("button", { name: "Bỏ lọc" }));
    expect(codesInList()).toHaveLength(6);
  });

  it("a status in the URL narrows the chosen tag", async () => {
    renderRoute(`/production/my-overview?tag=inProgress&status=${statuses.ASSIGNED.id}`);
    await ready();
    expect(codesInList()).toEqual(["1302", "1362"]);
  });

  it("the time filter reloads the range and keeps it in the URL", async () => {
    renderRoute();
    await ready();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Khoảng thời gian" })).getByRole("button", {
        name: "Tuần này"
      })
    );
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith({ from: "2026-10-19", to: "2026-10-25" }, expect.anything())
    );
    expect(search().get("range")).toBe("week");
    expect(screen.getByText(/^Tuần này, 19\/10 – 25\/10/)).toBeTruthy();
  });

  it("Bắt đầu moves Mới giao → Đang làm through the task's own move", async () => {
    transition.mockResolvedValue(taskOf(2, "PROCESSING"));
    renderRoute();
    await ready();
    fireEvent.click(await within(rowOf("1302")).findByRole("button", { name: "Bắt đầu" }));
    await waitFor(() =>
      expect(transition).toHaveBeenCalledWith(taskOf(2, "ASSIGNED").id, {
        toStatusId: statuses.PROCESSING.id
      })
    );
  });

  it("Done asks 'Số ảnh xong' under the row (pre-filled, required), then moves with that number", async () => {
    transition.mockResolvedValue(taskOf(61, "WAITING_QC"));
    renderRoute();
    await ready();
    fireEvent.click(await within(rowOf("1361")).findByRole("button", { name: "Done" }));
    const field = within(rowOf("1361")).getByLabelText<HTMLInputElement>("Số ảnh xong");
    expect(field.value).toBe("25");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(within(rowOf("1361")).getByRole("button", { name: "Xác nhận Done" }));
    expect(within(rowOf("1361")).getByText("Nhập số ảnh xong.")).toBeTruthy();
    expect(transition).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "24" } });
    fireEvent.click(within(rowOf("1361")).getByRole("button", { name: "Xác nhận Done" }));
    await waitFor(() =>
      expect(transition).toHaveBeenCalledWith(taskOf(61, "PROCESSING").id, {
        toStatusId: statuses.DONE.id,
        qtyDone: 24
      })
    );
    await waitFor(() => expect(within(rowOf("1361")).queryByLabelText("Số ảnh xong")).toBeNull());
  });

  it("Done on a line sent back goes through Đang làm first (the workflow's own moves), then Done with the number", async () => {
    const reworkId = taskOf(3, "REWORK").id;
    transition.mockImplementation((taskId, input) =>
      Promise.resolve(
        input.toStatusId === statuses.PROCESSING.id
          ? withMoves(taskOf(3, "PROCESSING", { qtyAssigned: 4 }), "DONE")
          : taskOf(3, "WAITING_QC")
      )
    );
    renderRoute();
    await ready();
    fireEvent.click(await within(rowOf("1303")).findByRole("button", { name: "Done" }));
    fireEvent.click(within(rowOf("1303")).getByRole("button", { name: "Xác nhận Done" }));
    await waitFor(() => expect(transition).toHaveBeenCalledTimes(2));
    expect(transition.mock.calls).toEqual([
      [reworkId, { toStatusId: statuses.PROCESSING.id }],
      [reworkId, { toStatusId: statuses.DONE.id, qtyDone: 4 }]
    ]);
  });

  it("the task name opens the task sheet (?ptask=)", async () => {
    renderRoute();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Mở task #1302" }));
    expect(search().get("ptask")).toBe(taskOf(2, "ASSIGNED").id);
  });

  it("'+ Nhập Task' only for whoever may create tasks (PD-079)", async () => {
    renderRoute();
    expect(await screen.findByRole("button", { name: "Nhập Task" })).toBeTruthy();
    cleanup();
    me.mockResolvedValue(meWith(["ACCOUNT"], "none"));
    renderRoute();
    await ready();
    expect(screen.queryByRole("button", { name: "Nhập Task" })).toBeNull();
  });
});

describe("Tổng quan của tôi — QC (PD-081)", () => {
  beforeEach(() => {
    answer = overviewOf(Object.values(sampleLines()), { qc: sampleQcLines() });
    me.mockResolvedValue(meWith(["STAFF", "QC"]));
  });

  it("the QC tag (3rd) and its 'Cần bạn xử lý' item open the queue, longest wait first; 'Quay lại việc của tôi'", async () => {
    renderRoute();
    await ready();
    const tags = within(screen.getByRole("group", { name: "Tổng quan task" })).getAllByRole(
      "button"
    );
    expect(tags[2]!.textContent).toContain("Chờ tôi QC3");
    fireEvent.click(
      within(screen.getByRole("region", { name: "Cần bạn xử lý" })).getByRole("button", {
        name: "3 task chờ bạn QC (1 quá 2h)"
      })
    );
    expect(search().get("tag")).toBe("qc");
    const queue = screen.getByRole("region", { name: /Chờ tôi QC/ });
    expect(
      within(queue)
        .getAllByRole("button", { name: /^Mở task #/ })
        .map((button) => button.textContent)
    ).toEqual([
      expect.stringContaining("#1370"),
      expect.stringContaining("#1371"),
      expect.stringContaining("#1372")
    ]);
    expect(within(rowOf("1370")).getByText("Chờ 2h 15m")).toBeTruthy();
    expect(within(rowOf("1370")).getByText("Nhân viên Một · Normal Retouch · 20 tấm")).toBeTruthy();
    expect(within(rowOf("1372")).getByText("Bạn bắt đầu check 10 phút trước")).toBeTruthy();
    fireEvent.click(within(queue).getByRole("button", { name: "Quay lại việc của tôi" }));
    expect(search().get("tag")).toBeNull();
    expect(codesInList()).toHaveLength(6);
  });

  it("Chờ QC → Bắt đầu check; Đang check → Đạt, or Trả sửa with the required 'Cần sửa gì'", async () => {
    transition.mockResolvedValue(taskOf(72, "REWORK"));
    renderRoute("/production/my-overview?tag=qc");
    await ready();
    expect(
      await within(rowOf("1370")).findByRole("button", { name: "Bắt đầu check" })
    ).toBeTruthy();
    expect(within(rowOf("1370")).queryByRole("button", { name: "Đạt" })).toBeNull();
    fireEvent.click(within(rowOf("1372")).getByRole("button", { name: "Trả sửa" }));
    fireEvent.click(within(rowOf("1372")).getByRole("button", { name: "Trả cho Nhân viên Một" }));
    expect(within(rowOf("1372")).getByText("Ghi rõ cần sửa gì.")).toBeTruthy();
    expect(transition).not.toHaveBeenCalled();
    fireEvent.change(within(rowOf("1372")).getByLabelText("Cần sửa gì"), {
      target: { value: "Viền ảnh 2 chưa sạch" }
    });
    fireEvent.click(within(rowOf("1372")).getByRole("button", { name: "Trả cho Nhân viên Một" }));
    await waitFor(() =>
      expect(transition).toHaveBeenCalledWith(taskOf(72, "QC_CHECKING").id, {
        toStatusId: statuses.REWORK.id,
        note: "Viền ảnh 2 chưa sạch"
      })
    );
    fireEvent.click(within(rowOf("1372")).getByRole("button", { name: "Đạt" }));
    await waitFor(() =>
      expect(transition).toHaveBeenLastCalledWith(taskOf(72, "QC_CHECKING").id, {
        toStatusId: statuses.CHECKED.id
      })
    );
  });
});
