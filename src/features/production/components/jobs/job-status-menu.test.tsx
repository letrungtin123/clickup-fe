// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobStatus } from "@/contracts/production-catalog";
import type { JobDetail } from "@/contracts/production-jobs";
import { productionApi } from "@/features/production/api";
import { jobsApi } from "@/features/production/jobs-api";
import { ApiError } from "@/lib/api/errors";

import { JobStatusMenu } from "./job-status-menu";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Obviously fake ids (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const jobId = id(99);

const status = (
  n: number,
  name: string,
  isClosed = false,
  requiresAllChecked = false
): JobStatus => ({
  id: id(n),
  name,
  color: isClosed ? "green" : "blue",
  position: n,
  isClosed,
  requiresAllChecked,
  jobCount: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: null
});

const catalog = [
  status(1, "Mới nhận"),
  status(2, "Đang làm"),
  status(3, "Chờ QC"),
  status(4, "Đã giao khách", true)
];
// PD-045: "Đã xong" needs every line checked.
const withDone = [...catalog.slice(0, 3), status(5, "Đã xong", false, true), catalog[3]!];
const ref = ({ id: statusId, name, color, isClosed, requiresAllChecked }: JobStatus) => ({
  id: statusId,
  name,
  color,
  isClosed,
  requiresAllChecked
});

const renderMenu = (
  editable: boolean,
  readiness: { taskCount: number; uncheckedTaskCount: number } = {
    taskCount: 4,
    uncheckedTaskCount: 0
  }
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <JobStatusMenu
        jobId={jobId}
        status={ref(catalog[1]!)}
        readiness={readiness}
        editable={editable}
      />
    </QueryClientProvider>
  );
};

const openMenu = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Trạng thái job: Đang làm/ }));
    await Promise.resolve();
  });
  return screen.findByRole("menu");
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("JobStatusMenu (PD-038 / PD-045)", () => {
  it("read-only: just the chip with its tooltip, no catalog request", () => {
    const list = vi.spyOn(productionApi, "jobStatuses");
    renderMenu(false);
    expect(screen.getByText("Đang làm").closest("[title]")?.getAttribute("title")).toBe("Đang làm");
    expect(screen.queryByRole("button")).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it("editable: lists every status, the current one checked, closed ones under “Đã đóng”", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: catalog });
    renderMenu(true);
    await openMenu();
    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "Mới nhận",
      "Đang làm",
      "Chờ QC",
      "Đã giao khách"
    ]);
    expect(items[1]?.getAttribute("aria-checked")).toBe("true");
    expect(items[0]?.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Đã đóng")).toBeTruthy();
  });

  it("picking a status saves it and confirms", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: catalog });
    const change = vi
      .spyOn(jobsApi, "changeStatus")
      .mockResolvedValue({ id: jobId, jobStatus: ref(catalog[2]!) } as unknown as JobDetail);
    renderMenu(true);
    await openMenu();
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitemradio", { name: "Chờ QC" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(change).toHaveBeenCalledWith(jobId, id(3)));
    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Đã chuyển job sang Chờ QC")
    );
  });

  it("“Đã xong” is disabled with “Còn N task chưa check” while lines are not checked (PD-045)", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: withDone });
    const change = vi.spyOn(jobsApi, "changeStatus");
    renderMenu(true, { taskCount: 5, uncheckedTaskCount: 3 });
    await openMenu();
    const done = await screen.findByRole("menuitemradio", { name: /Đã xong/ });
    expect(done.textContent).toContain("Còn 3 task chưa check");
    expect(done.hasAttribute("data-disabled")).toBe(true);
    // Other statuses stay available.
    const working = screen.getByRole("menuitemradio", { name: "Chờ QC" });
    expect(working.hasAttribute("data-disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(done);
      await Promise.resolve();
    });
    expect(change).not.toHaveBeenCalled();
  });

  it("a job without lines cannot be “Đã xong” either; once every line is checked it can", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: withDone });
    renderMenu(true, { taskCount: 0, uncheckedTaskCount: 0 });
    await openMenu();
    expect((await screen.findByRole("menuitemradio", { name: /Đã xong/ })).textContent).toContain(
      "Chưa có task"
    );
    cleanup();

    const change = vi
      .spyOn(jobsApi, "changeStatus")
      .mockResolvedValue({ id: jobId, jobStatus: ref(withDone[3]!) } as unknown as JobDetail);
    renderMenu(true, { taskCount: 5, uncheckedTaskCount: 0 });
    await openMenu();
    const done = await screen.findByRole("menuitemradio", { name: "Đã xong" });
    expect(done.hasAttribute("data-disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(done);
      await Promise.resolve();
    });
    await waitFor(() => expect(change).toHaveBeenCalledWith(jobId, id(5)));
  });

  it("the API still refusing (409 JOB_NOT_READY) shows its message", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: withDone });
    vi.spyOn(jobsApi, "changeStatus").mockRejectedValue(
      new ApiError({ status: 409, code: "JOB_NOT_READY", message: "Còn 1 task chưa check: #1216a" })
    );
    renderMenu(true, { taskCount: 5, uncheckedTaskCount: 0 });
    await openMenu();
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitemradio", { name: "Đã xong" }));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Còn 1 task chưa check: #1216a")
    );
  });

  it("a refused change shows the error", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: catalog });
    vi.spyOn(jobsApi, "changeStatus").mockRejectedValue(new Error("Không đủ quyền"));
    renderMenu(true);
    await openMenu();
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitemradio", { name: "Mới nhận" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });
});
