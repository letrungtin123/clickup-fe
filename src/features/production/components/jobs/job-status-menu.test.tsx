// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobStatus } from "@/contracts/production-catalog";
import type { JobDetail } from "@/contracts/production-jobs";
import { productionApi } from "@/features/production/api";
import { jobsApi } from "@/features/production/jobs-api";

import { JobStatusMenu } from "./job-status-menu";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Obviously fake ids (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const jobId = id(99);

const status = (n: number, name: string, isClosed = false): JobStatus => ({
  id: id(n),
  name,
  color: isClosed ? "green" : "blue",
  position: n,
  isClosed,
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
const ref = ({ id: statusId, name, color, isClosed }: JobStatus) => ({
  id: statusId,
  name,
  color,
  isClosed
});

const renderMenu = (editable: boolean) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <JobStatusMenu jobId={jobId} status={ref(catalog[1]!)} editable={editable} />
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

describe("JobStatusMenu (PD-038)", () => {
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
