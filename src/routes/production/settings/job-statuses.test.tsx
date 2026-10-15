// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobStatus } from "@/contracts/production-catalog";
import { productionApi } from "@/features/production/api";
import { ApiError } from "@/lib/api/errors";

import { ProductionJobStatusesRoute } from "./job-statuses";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Obviously fake ids and people (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = { id: id(900), displayName: "Quản trị Thử", email: null, avatarUrl: null };

const status = (
  n: number,
  name: string,
  overrides: Partial<JobStatus> = {}
): JobStatus => ({
  id: id(n),
  name,
  color: "blue",
  position: n,
  isClosed: false,
  requiresAllChecked: false,
  jobCount: 0,
  updatedAt: "2026-01-02T03:00:00.000Z",
  updatedBy: null,
  ...overrides
});

const catalog: JobStatus[] = [
  status(1, "Mới nhận", { color: "slate", jobCount: 3 }),
  status(2, "Đang làm", { jobCount: 12, updatedBy: admin }),
  status(3, "Chờ QC", { color: "amber" }),
  status(4, "Đã giao khách", { color: "green", isClosed: true, jobCount: 40 })
];

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProductionJobStatusesRoute />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const openRowMenu = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: `Tùy chọn cho ${name}` }));
    await Promise.resolve();
  });
  return screen.findByRole("menu");
};

const clickMenuItem = async (name: string) => {
  await act(async () => {
    fireEvent.click(await screen.findByRole("menuitem", { name }));
    await Promise.resolve();
  });
};

beforeEach(() => {
  // The timezone comes from /production/me: the page falls back while it loads.
  vi.spyOn(productionApi, "me").mockReturnValue(new Promise<never>(() => undefined));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("Cấu hình → Trạng thái job (PD-038 / PD-045)", () => {
  it("lists the statuses in order with chips, job counts, the last change and the closed switch", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: catalog });
    renderPage();
    expect(await screen.findByRole("button", { name: /^Mới nhận/ })).toBeTruthy();
    const list = screen.getByRole("list", { name: "Trạng thái job" });
    expect(Array.from(list.querySelectorAll("li")).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Mới nhận"),
      expect.stringContaining("Đang làm"),
      expect.stringContaining("Chờ QC"),
      expect.stringContaining("Đã giao khách")
    ]);
    // Only the first status is where new jobs start.
    expect(screen.getAllByText("Job mới")).toHaveLength(1);
    expect(screen.getByText("12 job")).toBeTruthy();
    expect(screen.getByText(/^Sửa bởi Quản trị Thử · /)).toBeTruthy();
    expect(screen.getAllByText(/^Mặc định · /)).toHaveLength(3);
    // Long names truncate inside the chip; the chip carries the full name.
    expect(screen.getByText("Đã giao khách").closest("[title]")?.getAttribute("title")).toBe(
      "Đã giao khách (đã đóng)"
    );
    expect(
      screen
        .getByRole("switch", { name: "Trạng thái đóng: Đã giao khách" })
        .getAttribute("aria-checked")
    ).toBe("true");
    expect(
      screen.getByRole("switch", { name: "Trạng thái đóng: Mới nhận" }).getAttribute("aria-checked")
    ).toBe("false");
  });

  it("adds a status with the suggested colour and “Đóng”, refusing a duplicate name first", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: catalog });
    const create = vi
      .spyOn(productionApi, "createJobStatus")
      .mockResolvedValue({ items: [...catalog, status(5, "Chờ duyệt", { color: "violet" })] });
    renderPage();
    await screen.findByRole("button", { name: /^Mới nhận/ });
    const input = screen.getByRole("textbox", { name: "Tên trạng thái mới" });

    fireEvent.change(input, { target: { value: "  chờ qc " } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm trạng thái" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Đã có trạng thái job cùng tên (không phân biệt hoa thường)."
    );
    expect(create).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "Chờ duyệt" } });
    fireEvent.click(screen.getByRole("switch", { name: "Trạng thái mới là trạng thái đóng" }));
    fireEvent.click(screen.getByRole("button", { name: "Thêm trạng thái" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    // slate / blue / amber / green are taken: violet is the first free palette colour.
    expect(create).toHaveBeenCalledWith({
      name: "Chờ duyệt",
      color: "violet",
      isClosed: true,
      requiresAllChecked: false
    });
    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Đã thêm trạng thái Chờ duyệt")
    );
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
  });

  it("maps the API's duplicate-name 409 to Vietnamese copy", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: catalog });
    vi.spyOn(productionApi, "createJobStatus").mockRejectedValue(
      new ApiError({ status: 409, code: "JOB_STATUS_NAME_TAKEN", message: "Name taken" })
    );
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Tên trạng thái mới" }), {
      target: { value: "Trạng thái khác" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Thêm trạng thái" }));
    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Đã có trạng thái job cùng tên (không phân biệt hoa thường)."
      )
    );
  });

  it("renames in place and toggles “Đóng”", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: catalog });
    const update = vi
      .spyOn(productionApi, "updateJobStatus")
      .mockResolvedValue({ items: catalog });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Đang làm" }));
    const field = screen.getByRole("textbox", { name: "Tên mới cho trạng thái Đang làm" });
    fireEvent.change(field, { target: { value: "MỚI NHẬN" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toContain("Đã có trạng thái job cùng tên");
    expect(update).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "Đang xử lý" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(id(2), { name: "Đang xử lý" })
    );

    fireEvent.click(screen.getByRole("switch", { name: "Trạng thái đóng: Chờ QC" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(id(3), { isClosed: true }));
    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Chờ QC là trạng thái đóng")
    );
  });

  it("“Cần mọi task đã check” (PD-045): a badge on the row, a checkbox in the row menu, a switch when adding", async () => {
    const done = status(5, "Đã xong", { color: "green", requiresAllChecked: true });
    const items = [...catalog.slice(0, 3), done, catalog[3]!];
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items });
    const update = vi.spyOn(productionApi, "updateJobStatus").mockResolvedValue({ items });
    const create = vi.spyOn(productionApi, "createJobStatus").mockResolvedValue({ items });
    renderPage();
    const row = await screen.findByRole("button", { name: /^Đã xong/ });
    expect(row.textContent).toContain("Cần đã check");
    // Only that row carries the badge (the other match is the switch of the “add” form).
    const list = screen.getByRole("list", { name: "Trạng thái job" });
    expect(list.textContent?.match(/Cần đã check/g)).toHaveLength(1);

    await openRowMenu("Đã xong");
    const checkbox = await screen.findByRole("menuitemcheckbox", { name: "Cần mọi task đã check" });
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      fireEvent.click(checkbox);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(id(5), { requiresAllChecked: false })
    );
    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Đã xong: không cần mọi task đã check")
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Tên trạng thái mới" }), {
      target: { value: "Hoàn tất" }
    });
    fireEvent.click(screen.getByRole("switch", { name: "Trạng thái mới cần mọi task đã check" }));
    fireEvent.click(screen.getByRole("button", { name: "Thêm trạng thái" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Hoàn tất", isClosed: false, requiresAllChecked: true })
      )
    );
  });

  it("moves a status down from the row menu (all ids in the new order)", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: catalog });
    const reorder = vi
      .spyOn(productionApi, "reorderJobStatuses")
      .mockResolvedValue({ items: catalog });
    renderPage();
    await screen.findByRole("button", { name: /^Mới nhận/ });
    await openRowMenu("Mới nhận");
    expect(
      screen.getByRole("menuitem", { name: "Chuyển lên" }).getAttribute("aria-disabled")
    ).toBe("true");
    await clickMenuItem("Chuyển xuống");
    await waitFor(() => expect(reorder).toHaveBeenCalledWith([id(2), id(1), id(3), id(4)]));
  });

  it("deletes an unused status after a plain confirm", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: catalog });
    const remove = vi
      .spyOn(productionApi, "deleteJobStatus")
      .mockResolvedValue({ items: catalog.filter((item) => item.id !== id(3)), movedJobs: 0 });
    renderPage();
    await screen.findByRole("button", { name: /^Mới nhận/ });
    await openRowMenu("Chờ QC");
    await clickMenuItem("Xoá");
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Chưa có job nào ở trạng thái này.");
    expect(screen.queryByRole("combobox", { name: "Chuyển job sang trạng thái" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Xoá trạng thái" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(id(3), null));
    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Đã xoá trạng thái Chờ QC")
    );
  });

  it("deleting a used status requires a replacement and moves the jobs in the same request", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: catalog });
    const remove = vi
      .spyOn(productionApi, "deleteJobStatus")
      .mockResolvedValue({ items: catalog.filter((item) => item.id !== id(2)), movedJobs: 12 });
    renderPage();
    await screen.findByRole("button", { name: /^Mới nhận/ });
    await openRowMenu("Đang làm");
    await clickMenuItem("Xoá");
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(
      "12 job đang ở trạng thái Đang làm sẽ chuyển sang trạng thái được chọn."
    );

    fireEvent.click(screen.getByRole("button", { name: "Chuyển job và xoá" }));
    expect(screen.getByText("Chọn trạng thái thay thế.")).toBeTruthy();
    expect(remove).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Chuyển job sang trạng thái" }));
      await Promise.resolve();
    });
    const options = await screen.findAllByRole("option");
    // Every other status, with its job count.
    expect(options.map((option) => option.textContent)).toEqual([
      "Mới nhận3 job",
      "Chờ QC0 job",
      "Đã giao khách40 job"
    ]);
    await act(async () => {
      // A real mouse click starts on the item (Base UI ignores a bare click there).
      const option = screen.getByRole("option", { name: /Chờ QC/ });
      fireEvent.pointerDown(option);
      fireEvent.click(option);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Chuyển job sang trạng thái" }).textContent
      ).toContain("Chờ QC")
    );

    fireEvent.click(screen.getByRole("button", { name: "Chuyển job và xoá" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(id(2), id(3)));
    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
        "Đã xoá trạng thái Đang làm · 12 job chuyển sang Chờ QC"
      )
    );
  });

  it("a stale count (409 JOB_STATUS_IN_USE) turns the confirm into the replacement form", async () => {
    const list = vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: catalog });
    vi.spyOn(productionApi, "deleteJobStatus").mockRejectedValue(
      new ApiError({ status: 409, code: "JOB_STATUS_IN_USE", message: "In use" })
    );
    renderPage();
    await screen.findByRole("button", { name: /^Mới nhận/ });
    await openRowMenu("Chờ QC");
    await clickMenuItem("Xoá");
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Xoá trạng thái" }));
    expect(
      await screen.findByRole("combobox", { name: "Chuyển job sang trạng thái" })
    ).toBeTruthy();
    expect(screen.getByText(/Trạng thái này vẫn còn job/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chuyển job và xoá" })).toBeTruthy();
    // The counts are refreshed.
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("the last remaining status cannot be deleted", async () => {
    vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: [catalog[0]!] });
    renderPage();
    await screen.findByRole("button", { name: /^Mới nhận/ });
    await openRowMenu("Mới nhận");
    expect(screen.getByRole("menuitem", { name: "Xoá" }).getAttribute("aria-disabled")).toBe(
      "true"
    );
    expect(screen.getByText("Phải còn ít nhất một trạng thái.")).toBeTruthy();
  });
});
