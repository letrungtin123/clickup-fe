// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { Feedback, JobDetail, ProductionTask } from "@/contracts/production-jobs";
import { SessionValueContext } from "@/features/auth/session-context";
import type { SessionContext } from "@/lib/api/schemas";

import { todayIn } from "../../format";
import { productionKeys } from "../../keys";
import { SplitTasksDialog } from "./split-tasks-dialog";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() })
}));

// "Chia task" line cards (PD-035 / PD-040). Obviously fake ids, names and links (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Asia/Ho_Chi_Minh";
const today = todayIn(TZ);
const user = (n: number, name: string) => ({
  id: id(n),
  displayName: name,
  email: null,
  avatarUrl: null
});
const ME = user(1, "Leader Test");
const WORKER = user(2, "Worker One");
const CHECKER = user(3, "Checker Two");
const PROJECT = { id: id(40), code: "P-T", name: "Project" };
const RETOUCH = id(80);
const DAY_SHIFT = id(70);
const FOLDER = "Y:\\Client\\2026\\Batch 1";

const member = (person: ReturnType<typeof user>, roles: string[]) => ({
  userId: person.id,
  displayName: person.displayName,
  email: null,
  avatarUrl: null,
  roles,
  teamId: null,
  active: true,
  customValues: {},
  tagIds: []
});

const sourceTask = {
  id: id(100),
  number: 7,
  jobId: id(50),
  jobCode: "Batch A",
  project: PROJECT,
  assignee: WORKER,
  qc: CHECKER,
  process: { id: RETOUCH, name: "Retouch", isQc: false },
  shift: { id: DAY_SHIFT, name: "Day", payMode: "POINTS", requiresOtHours: false },
  qtyAssigned: 20,
  customValues: {},
  tagIds: [],
  workLink: FOLDER
} as unknown as ProductionTask;

const job = {
  id: id(50),
  code: "Batch A",
  project: PROJECT,
  leader: ME,
  receivedAt: `${today}T00:00:00+07:00`,
  deadline: `${today}T23:59:00+07:00`,
  totalImages: 0,
  totalImagesManual: false,
  tasks: [sourceTask],
  capabilities: { splitOwnOnly: false }
} as unknown as JobDetail;

const session = {
  user: { id: ME.id, displayName: ME.displayName, email: "leader@example.test", avatarUrl: null },
  productionRoles: ["LEADER"]
} as unknown as SessionContext;

const renderDialog = (feedback: Feedback | null = null) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } }
  });
  client.setQueryData(productionKeys.me(), {
    roles: ["LEADER"],
    isAdmin: false,
    teamId: null,
    jobPermissions: { view: "all", create: "all", update: "all", delete: "all" },
    settings: { timezone: TZ }
  });
  client.setQueryData(productionKeys.members(), {
    items: [member(ME, ["LEADER"]), member(WORKER, ["STAFF"]), member(CHECKER, ["QC"])]
  });
  client.setQueryData(productionKeys.processes(), {
    items: [{ id: RETOUCH, name: "Retouch", isQc: false, sortOrder: 1, active: true }]
  });
  client.setQueryData(productionKeys.shifts(), {
    items: [
      {
        id: DAY_SHIFT,
        name: "Day",
        payMode: "POINTS",
        requiresOtHours: false,
        sortOrder: 1,
        active: true
      }
    ]
  });
  client.setQueryData(productionKeys.tags(), { items: [] });
  client.setQueryData(productionKeys.customFields(), { items: [] });
  client.setQueryData(productionKeys.creditMatrix(today), {
    at: today,
    projects: [],
    processes: [],
    rules: [
      {
        id: id(90),
        projectId: PROJECT.id,
        processId: RETOUCH,
        creditPerImage: 5.5,
        moneyPerImage: null,
        effectiveFrom: today,
        effectiveTo: null
      }
    ]
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <TooltipProvider>
          <SplitTasksDialog open job={job} feedback={feedback} onClose={() => undefined} />
        </TooltipProvider>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

const cards = () =>
  within(screen.getByRole("list", { name: "Các dòng công việc" })).getAllByRole("listitem");

afterEach(cleanup);

describe("SplitTasksDialog — line cards", () => {
  it("a new line shows the main fields; the optional details are collapsed with a hint", () => {
    renderDialog();
    const [card] = cards();
    const scope = within(card!);
    expect(scope.getByText("Dòng 1")).toBeTruthy();
    for (const label of [
      "Nhân viên thực hiện",
      "Quy trình",
      "Ca",
      "Số lượng",
      "Ngày nhận",
      "Ngày giao"
    ]) {
      expect(scope.getByText(label)).toBeTruthy();
    }
    const toggle = scope.getByRole("button", { name: /Chi tiết thêm/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Tùy chọn");
    expect(toggle.textContent).toContain("QC, hình lỗi, giờ OT, link chia việc, ghi chú");
    expect(scope.queryByPlaceholderText("Dán link hoặc đường dẫn thư mục")).toBeNull();
    // No "(tùy chọn)" label suffix anywhere.
    expect(document.body.textContent).not.toContain("(tùy chọn)");
    expect(scope.getByRole("button", { name: "Xóa dòng 1" })).toHaveProperty("disabled", true);
  });

  it("opening the details shows QC, Hình lỗi, Giờ OT, Link chia việc and Ghi chú; filled, it summarises them", async () => {
    renderDialog();
    const scope = within(cards()[0]!);
    await act(async () => {
      fireEvent.click(scope.getByRole("button", { name: /Chi tiết thêm/ }));
      await Promise.resolve();
    });
    for (const label of ["QC", "Hình lỗi", "Giờ OT", "Link chia việc", "Ghi chú"]) {
      expect(scope.getByText(label)).toBeTruthy();
    }
    fireEvent.change(scope.getByPlaceholderText("Dán link hoặc đường dẫn thư mục"), {
      target: { value: FOLDER }
    });
    fireEvent.change(scope.getByPlaceholderText("Ghi chú cho dòng này"), {
      target: { value: "x" }
    });
    await act(async () => {
      fireEvent.click(scope.getByRole("button", { name: /Chi tiết thêm/ }));
      await Promise.resolve();
    });
    const toggle = scope.getByRole("button", { name: /Chi tiết thêm/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Link · Ghi chú");
  });

  it("Giao lại starts from the source line: price badge, details open with its QC and link", () => {
    renderDialog({
      id: id(60),
      jobId: job.id,
      sourceTaskId: sourceTask.id,
      type: "EXTRA",
      note: "Thêm ảnh",
      status: "OPEN"
    } as unknown as Feedback);
    const scope = within(cards()[0]!);
    expect(scope.getByText("5,5 điểm/tấm")).toBeTruthy();
    expect(scope.getByText(/≈ 110,00 điểm/)).toBeTruthy();
    expect(scope.getByRole("button", { name: /Chi tiết thêm/ }).getAttribute("aria-expanded")).toBe(
      "true"
    );
    expect(
      scope.getByPlaceholderText<HTMLInputElement>("Dán link hoặc đường dẫn thư mục").value
    ).toBe(FOLDER);
  });

  it("Thêm dòng copies process, shift, dates and QC from the previous line and focuses its person", async () => {
    renderDialog({
      id: id(60),
      jobId: job.id,
      sourceTaskId: sourceTask.id,
      type: "EXTRA",
      note: "Thêm ảnh",
      status: "OPEN"
    } as unknown as Feedback);
    // Let the dialog place its initial focus first (as a person would, before clicking).
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Thêm dòng/ }));
      await Promise.resolve();
    });
    const [, second] = cards();
    const scope = within(second!);
    expect(scope.getByText("Dòng 2")).toBeTruthy();
    // Same process (its price shows), same QC (details open), no link: each line is its own batch.
    expect(scope.getByText("5,5 điểm/tấm")).toBeTruthy();
    expect(scope.getByText("Checker Two")).toBeTruthy();
    expect(
      scope.getByPlaceholderText<HTMLInputElement>("Dán link hoặc đường dẫn thư mục").value
    ).toBe("");
    expect(document.activeElement?.id).toMatch(/-assignee$/);
    expect(second!.contains(document.activeElement)).toBe(true);
  });

  it("submitting an incomplete line shows the errors under the fields and focuses the first one", async () => {
    renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Thêm 1 dòng" }));
      await Promise.resolve();
    });
    const scope = within(cards()[0]!);
    expect(scope.getByText("Chọn nhân viên thực hiện.")).toBeTruthy();
    expect(scope.getByText("Chọn quy trình.")).toBeTruthy();
    expect(scope.getByText("Số lượng nguyên ≥ 1.")).toBeTruthy();
    expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement?.id).toMatch(/-assignee$/);
  });

  it("an invalid optional detail opens the section by itself", async () => {
    renderDialog();
    const scope = within(cards()[0]!);
    await act(async () => {
      fireEvent.click(scope.getByRole("button", { name: /Chi tiết thêm/ }));
      await Promise.resolve();
    });
    fireEvent.change(scope.getByPlaceholderText("Ví dụ: 1,5"), { target: { value: "99" } });
    // Collapse it, then submit: the error re-opens it.
    await act(async () => {
      fireEvent.click(scope.getByRole("button", { name: /Chi tiết thêm/ }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Thêm 1 dòng" }));
      await Promise.resolve();
    });
    expect(scope.getByRole("button", { name: /Chi tiết thêm/ }).getAttribute("aria-expanded")).toBe(
      "true"
    );
    expect(scope.getByText("Từ 0,1 đến 24 giờ.")).toBeTruthy();
  });
});
