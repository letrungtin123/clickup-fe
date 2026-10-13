// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { JobStatus } from "@/contracts/production-catalog";
import type { JobOption } from "@/contracts/production-jobs";
import { productionApi } from "@/features/production/api";
import { jobsApi } from "@/features/production/jobs-api";
import { ApiError } from "@/lib/api/errors";

import { JobOptionPicker } from "./job-option-picker";

// Obviously fake ids and packages (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VN = "Asia/Ho_Chi_Minh";
const PROJECT = id(2);

const status = (n: number, name: string, isClosed = false): JobStatus => ({
  id: id(50 + n),
  name,
  color: isClosed ? "green" : "blue",
  position: n,
  isClosed,
  jobCount: null,
  updatedAt: "2026-10-01T00:00:00.000Z",
  updatedBy: null
});
const STATUSES = [status(1, "Đang làm"), status(2, "Đã giao khách", true)];

const option = (n: number, code: string, closed = false): JobOption => ({
  id: id(100 + n),
  code,
  projectId: PROJECT,
  deadline: "2026-10-20T16:59:00.000Z",
  jobStatus: {
    id: closed ? id(52) : id(51),
    name: closed ? "Đã giao khách" : "Đang làm",
    color: closed ? "green" : "blue",
    isClosed: closed
  }
});

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

const renderPicker = (props: Partial<Parameters<typeof JobOptionPicker>[0]> = {}) => {
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <JobOptionPicker
        projectId={PROJECT}
        value={null}
        onChange={onChange}
        timeZone={VN}
        {...props}
      />
    </QueryClientProvider>
  );
  return { onChange };
};

const openPicker = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Gói công việc/ }));
    await Promise.resolve();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("JobOptionPicker (Nhập công việc → Gói công việc, PD-038)", () => {
  it("is disabled until a project is chosen", () => {
    const options = vi.spyOn(jobsApi, "jobOptions");
    renderPicker({ projectId: null });
    const trigger = screen.getByRole("button", { name: "Gói công việc" });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    expect(trigger.textContent).toContain("Chọn dự án trước");
    expect(options).not.toHaveBeenCalled();
  });

  it("lists the project's jobs with status and Ngày giao, filters by status and picks one", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: STATUSES });
    const options = vi.spyOn(jobsApi, "jobOptions").mockResolvedValue({
      items: [option(1, "Batch A/Folder 01"), option(2, "Batch B/Folder 02", true)],
      truncated: true
    });
    const { onChange } = renderPicker();
    await openPicker();

    const first = await screen.findByRole("option", { name: /Batch A\/Folder 01/ });
    expect(first.textContent).toContain("Đang làm");
    expect(first.textContent).toContain("Giao 20/10");
    expect(screen.getByText("Còn nhiều gói khác — gõ để tìm thêm.")).toBeTruthy();
    expect(options.mock.calls[0]?.[0]).toMatchObject({ projectId: PROJECT, statusIds: [] });

    // Status chips: "Tất cả" is on by default; picking a status asks the server for it only.
    const group = await screen.findByRole("group", { name: "Lọc theo trạng thái" });
    const all = screen.getByRole("button", { name: "Tất cả" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(group.textContent).toContain("Đã giao khách");
    fireEvent.click(screen.getByRole("button", { name: /Đang làm/ }));
    await waitFor(() =>
      expect(options).toHaveBeenLastCalledWith(
        expect.objectContaining({ statusIds: [id(51)] }),
        expect.anything()
      )
    );
    expect(all.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(await screen.findByRole("option", { name: /Batch B\/Folder 02/ }));
    expect(onChange).toHaveBeenCalledWith(option(2, "Batch B/Folder 02", true));
  });

  it("searches on the server after a short pause", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: STATUSES });
    const options = vi
      .spyOn(jobsApi, "jobOptions")
      .mockResolvedValue({ items: [option(1, "Batch A/Folder 01")], truncated: false });
    renderPicker();
    await openPicker();
    fireEvent.change(await screen.findByRole("combobox", { name: "Tìm gói công việc" }), {
      target: { value: "folder 01" }
    });
    await waitFor(() =>
      expect(options).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "folder 01" }),
        expect.anything()
      )
    );
  });

  it("shows the picked job on the trigger", () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: STATUSES });
    vi.spyOn(jobsApi, "jobOptions").mockResolvedValue({ items: [], truncated: false });
    renderPicker({ value: option(1, "Batch A/Folder 01") });
    const trigger = screen.getByRole("button", { name: "Gói công việc: Batch A/Folder 01" });
    expect(trigger.textContent).toContain("Batch A/Folder 01");
    expect(trigger.textContent).toContain("Đang làm");
  });

  it("says when nothing matches, and offers a retry when the list fails", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: STATUSES });
    const options = vi
      .spyOn(jobsApi, "jobOptions")
      .mockRejectedValueOnce(new ApiError({ status: 403, code: "FORBIDDEN", message: "Forbidden" }))
      .mockResolvedValue({ items: [], truncated: false });
    renderPicker();
    await openPicker();
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Không có job phù hợp")).toBeTruthy();
    expect(options).toHaveBeenCalledTimes(2);
  });
});
