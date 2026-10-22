// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { JobDetail, ProductionTask } from "@/contracts/production-jobs";
import type { TeamLoad, TeamMemberLoad } from "@/contracts/production-overview";
import { SessionValueContext } from "@/features/auth/session-context";
import type { SessionContext } from "@/lib/api/schemas";

import { todayIn } from "../../format";
import { jobsApi } from "../../jobs-api";
import { productionKeys } from "../../keys";
import { teamLoadApi } from "../../team-load";
import { SplitTasksDialog } from "./split-tasks-dialog";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() })
}));

beforeAll(() => {
  // cmdk (the searchable "Nhân viên thực hiện", PD-080) measures its list and scrolls the active option; jsdom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  if (!("scrollIntoView" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined });
  }
});

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
  code: "7",
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

type RenderOptions = {
  /** PD-080 GET /production/team-load answer (none: not loaded). */
  teamLoad?: TeamLoad;
  roles?: string[];
  ownOnly?: boolean;
  header?: ReactNode;
  extraMembers?: ReturnType<typeof member>[];
  /** PD-080b: more processes, the rules in force today (default: Retouch priced), and access to the cache. */
  extraProcesses?: { id: string; name: string; isQc: boolean; sortOrder: number; active: boolean }[];
  rules?: Record<string, unknown>[];
  onClient?: (client: QueryClient) => void;
};

const renderDialog = (options: RenderOptions = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } }
  });
  if (options.teamLoad) client.setQueryData(productionKeys.teamLoad(), options.teamLoad);
  // Not seeded: the load never arrives (no request leaves the test).
  else vi.spyOn(teamLoadApi, "get").mockReturnValue(new Promise(() => undefined));
  client.setQueryData(productionKeys.me(), {
    roles: options.roles ?? ["LEADER"],
    isAdmin: false,
    teamId: null,
    jobPermissions: { view: "all", create: "all", update: "all", delete: "all" },
    settings: { timezone: TZ }
  });
  client.setQueryData(productionKeys.members(), {
    items: [
      member(ME, ["LEADER"]),
      member(WORKER, ["STAFF"]),
      member(CHECKER, ["QC"]),
      ...(options.extraMembers ?? [])
    ]
  });
  client.setQueryData(productionKeys.processes(), {
    items: [{ id: RETOUCH, name: "Retouch", isQc: false, sortOrder: 1, active: true }, ...(options.extraProcesses ?? [])]
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
    rules: options.rules ?? [
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
  options.onClient?.(client);
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <TooltipProvider>
          <SplitTasksDialog
            open
            job={
              options.ownOnly
                ? ({ ...job, capabilities: { splitOwnOnly: true } } as unknown as JobDetail)
                : job
            }
            onClose={() => undefined}
            header={options.header}
          />
        </TooltipProvider>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

const cards = () => within(screen.getByRole("list", { name: "Các task" })).getAllByRole("listitem");

afterEach(cleanup);

describe("SplitTasksDialog — line cards", () => {
  it("a new line shows the main fields; the optional details are collapsed with a hint", () => {
    renderDialog();
    const [card] = cards();
    const scope = within(card!);
    expect(scope.getByText("Task 1")).toBeTruthy();
    for (const label of [
      "Nhân viên thực hiện",
      "Quy trình",
      "Ca",
      "Số lượng",
      "QC",
      "Ngày nhận",
      "Ngày giao"
    ]) {
      expect(scope.getByText(label)).toBeTruthy();
    }
    const toggle = scope.getByRole("button", { name: /Chi tiết thêm/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Tùy chọn");
    // PD-047: QC is a main (required) field, no longer an optional detail.
    expect(toggle.textContent).toContain("Hình lỗi, giờ OT, link chia việc, ghi chú");
    expect(toggle.textContent).not.toContain("QC");
    expect(scope.queryByPlaceholderText("Dán link hoặc đường dẫn thư mục")).toBeNull();
    // PD-058: only Số lượng says "(tùy chọn)" (the other optional fields sit behind "Chi tiết thêm").
    expect(document.body.textContent?.split("(tùy chọn)")).toHaveLength(2);
    const qty = scope.getByLabelText<HTMLInputElement>("Số lượng (tùy chọn)");
    expect(document.getElementById(qty.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Để trống nếu chưa biết — người làm điền khi chuyển Done."
    );
    expect(scope.getByRole("button", { name: "Xóa task 1" })).toHaveProperty("disabled", true);
  });

  it("opening the details shows Hình lỗi, Giờ OT, Link chia việc and Ghi chú; filled, it summarises them", async () => {
    renderDialog();
    const scope = within(cards()[0]!);
    await act(async () => {
      fireEvent.click(scope.getByRole("button", { name: /Chi tiết thêm/ }));
      await Promise.resolve();
    });
    for (const label of ["Hình lỗi", "Giờ OT", "Link chia việc", "Ghi chú"]) {
      expect(scope.getByText(label)).toBeTruthy();
    }
    fireEvent.change(scope.getByPlaceholderText("Dán link hoặc đường dẫn thư mục"), {
      target: { value: FOLDER }
    });
    fireEvent.change(scope.getByPlaceholderText("Ghi chú cho task này"), {
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

  it("is plain “Chia task”: no feedback / “Giao lại” mode any more (PD-045)", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Chia task · Batch A" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Giao lại|feedback|task gốc/i);
    expect(screen.getByRole("button", { name: "Thêm 1 task" })).toBeTruthy();
  });

  it("Thêm task copies everything from task 1 except the person (quantity included) and focuses its person", async () => {
    renderDialog();
    // Let the dialog place its initial focus first (as a person would, before clicking).
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const first = within(cards()[0]!);
    await act(async () => {
      fireEvent.click(first.getByRole("combobox", { name: "Quy trình" }));
      await Promise.resolve();
    });
    await act(async () => {
      // A real mouse click starts on the item (Base UI ignores a bare click there).
      const option = await screen.findByRole("option", { name: /Retouch/ });
      fireEvent.pointerDown(option);
      fireEvent.click(option);
      await Promise.resolve();
    });
    fireEvent.change(first.getByPlaceholderText("Số tấm"), { target: { value: "20" } });
    await waitFor(() => expect(first.getByText("5,5 điểm/tấm")).toBeTruthy());
    expect(first.getByText(/≈ 110,00 điểm/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Thêm task/ }));
      await Promise.resolve();
    });
    const [, second] = cards();
    const scope = within(second!);
    expect(scope.getByText("Task 2")).toBeTruthy();
    // Same process (its price shows) and the same quantity (owner, 2026-10-16); no person yet.
    expect(scope.getByText("5,5 điểm/tấm")).toBeTruthy();
    expect(scope.getByPlaceholderText("Số tấm")).toHaveProperty("value", "20");
    expect(scope.getByText(/≈ 110,00 điểm/)).toBeTruthy();
    expect(scope.getByRole("button", { name: /Chi tiết thêm/ }).textContent).not.toContain("Link");
    expect(document.activeElement?.id).toMatch(/-assignee$/);
    expect(second!.contains(document.activeElement)).toBe(true);
  });

  it("submitting an incomplete line shows the errors under the fields and focuses the first one", async () => {
    renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Thêm 1 task" }));
      await Promise.resolve();
    });
    const scope = within(cards()[0]!);
    expect(scope.getByText("Chọn nhân viên thực hiện.")).toBeTruthy();
    expect(scope.getByText("Chọn quy trình.")).toBeTruthy();
    // PD-058: an empty quantity is fine.
    expect(scope.queryByText("Số lượng nguyên ≥ 1.")).toBeNull();
    expect(scope.getByText("Chọn QC.")).toBeTruthy();
    expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement?.id).toMatch(/-assignee$/);
  });

  it("QC is required on a work task: no “Chưa gán QC” choice, picking one clears the error (PD-047)", async () => {
    renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Thêm 1 task" }));
      await Promise.resolve();
    });
    const scope = within(cards()[0]!);
    expect(scope.getByText("Chọn QC.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(scope.getByRole("combobox", { name: "QC" }));
      await Promise.resolve();
    });
    const options = await screen.findAllByRole("option");
    // Only the QC people (avatar initials + name), no "none" choice.
    expect(options).toHaveLength(1);
    expect(options[0]!.textContent).toContain("Checker Two");
    await act(async () => {
      fireEvent.pointerDown(options[0]!);
      fireEvent.click(options[0]!);
      await Promise.resolve();
    });
    expect(scope.queryByText("Chọn QC.")).toBeNull();
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
      fireEvent.click(screen.getByRole("button", { name: "Thêm 1 task" }));
      await Promise.resolve();
    });
    expect(scope.getByRole("button", { name: /Chi tiết thêm/ }).getAttribute("aria-expanded")).toBe(
      "true"
    );
    expect(scope.getByText("Từ 0,1 đến 24 giờ.")).toBeTruthy();
  });
});

/** Picks `option` in the card's `label` select (a real click starts on the item: Base UI ignores a bare click). */
const pick = async (card: HTMLElement, label: string, option: RegExp) => {
  await act(async () => {
    fireEvent.click(within(card).getByRole("combobox", { name: label }));
    await Promise.resolve();
  });
  await act(async () => {
    const item = await screen.findByRole("option", { name: option });
    fireEvent.pointerDown(item);
    fireEvent.click(item);
    await Promise.resolve();
  });
};

const fillRequired = async (card: HTMLElement) => {
  await pick(card, "Nhân viên thực hiện", /Worker One/);
  await pick(card, "Quy trình", /Retouch/);
  await pick(card, "Ca", /Day/);
  await pick(card, "QC", /Checker Two/);
};

describe("SplitTasksDialog — optional quantity (PD-058)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("an empty Số lượng is left out of the request; the footer counts it as a task without a quantity", async () => {
    const createTasks = vi
      .spyOn(jobsApi, "createTasks")
      .mockResolvedValue({ tasks: [], warnings: [] });
    renderDialog();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const card = cards()[0]!;
    await fillRequired(card);
    expect(within(card).getByLabelText<HTMLInputElement>("Số lượng (tùy chọn)").value).toBe("");
    expect(screen.getByText(/1 task chưa có số lượng/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Thêm 1 task" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(createTasks).toHaveBeenCalledTimes(1));
    const [jobId, lines] = createTasks.mock.calls[0]!;
    expect(jobId).toBe(job.id);
    expect(lines[0]).toMatchObject({
      assigneeId: WORKER.id,
      processId: RETOUCH,
      shiftId: DAY_SHIFT,
      qcId: CHECKER.id
    });
    expect(lines[0]).not.toHaveProperty("qtyAssigned");
  });

  it("a typed quantity is still a whole number ≥ 1, and is sent", async () => {
    const createTasks = vi
      .spyOn(jobsApi, "createTasks")
      .mockResolvedValue({ tasks: [], warnings: [] });
    renderDialog();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const card = cards()[0]!;
    const scope = within(card);
    await fillRequired(card);
    const qty = scope.getByLabelText("Số lượng (tùy chọn)");
    fireEvent.change(qty, { target: { value: "0" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Thêm 1 task" }));
      await Promise.resolve();
    });
    expect(scope.getByText("Số lượng nguyên ≥ 1.")).toBeTruthy();
    expect(createTasks).not.toHaveBeenCalled();
    fireEvent.change(qty, { target: { value: "12" } });
    expect(screen.queryByText(/task chưa có số lượng/)).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Thêm 1 task" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(createTasks).toHaveBeenCalledTimes(1));
    expect(createTasks.mock.calls[0]![1][0]).toMatchObject({ qtyAssigned: 12 });
  });
});

// PD-080 — team load in "Chia task": suggestions, the whole team, load and leave in the picker.
const WORKER_BUSY = user(4, "Worker Three");
const WORKER_AWAY = user(5, "Worker Away");
const OTHER = { id: id(41), code: "BRX" };

const load = (
  person: ReturnType<typeof user>,
  byProject: { project: { id: string; code: string }; images: number }[],
  extra: Partial<TeamMemberLoad> = {}
): TeamMemberLoad => ({
  user: person,
  roles: ["STAFF"],
  leave: null,
  openTasks: byProject.length,
  images: byProject.reduce((sum, entry) => sum + entry.images, 0),
  tasksWithoutQty: 0,
  byProject: byProject.map((entry) => ({ ...entry, tasks: 1 })),
  ...extra
});

const TEAM: TeamLoad = {
  today,
  generatedAt: new Date().toISOString(),
  members: [
    load(ME, [{ project: OTHER, images: 4 }], { roles: ["LEADER"] }),
    load(WORKER, []),
    load(WORKER_BUSY, [{ project: PROJECT, images: 10 }]),
    load(WORKER_AWAY, [], { leave: { part: "FULL_DAY", now: true } }),
    load(CHECKER, [], { roles: ["QC"] })
  ]
};
const teamMembers = [member(WORKER_BUSY, ["STAFF"]), member(WORKER_AWAY, ["STAFF"])];

const renderWithTeam = (options: RenderOptions = {}) =>
  renderDialog({ teamLoad: TEAM, extraMembers: teamMembers, ...options });

const suggestionTiles = () =>
  within(screen.getByRole("list", { name: "Người được gợi ý" })).getAllByRole("button");

describe("SplitTasksDialog — team load (PD-080)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("suggests Rảnh first, then people on the project, then the lightest; not the QC-only nor the one on leave", () => {
    renderWithTeam();
    expect(screen.getByRole("heading", { name: "Gợi ý cho P-T" })).toBeTruthy();
    expect(suggestionTiles().map((tile) => tile.getAttribute("aria-label"))).toEqual([
      "Worker One · Rảnh",
      "Worker Three · 10 P-T · Đang làm P-T",
      "Leader Test · 4 BRX"
    ]);
  });

  it("a tile fills the first task without a person, then adds a task for the next one (copying task 1) and focuses its Quy trình", async () => {
    renderWithTeam();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    await act(async () => {
      fireEvent.click(suggestionTiles()[0]!);
      await Promise.resolve();
    });
    expect(cards()).toHaveLength(1);
    expect(within(cards()[0]!).getByRole("combobox", { name: "Nhân viên thực hiện" }).textContent).toContain(
      "Worker One"
    );
    fireEvent.change(within(cards()[0]!).getByPlaceholderText("Số tấm"), { target: { value: "12" } });
    await act(async () => {
      fireEvent.click(suggestionTiles()[1]!);
      await Promise.resolve();
    });
    const [, second] = cards();
    expect(cards()).toHaveLength(2);
    expect(within(second!).getByRole("combobox", { name: "Nhân viên thực hiện" }).textContent).toContain(
      "Worker Three"
    );
    // Same copy rules as "Thêm task": the quantity of task 1 comes along.
    expect(within(second!).getByPlaceholderText("Số tấm")).toHaveProperty("value", "12");
    expect(document.activeElement?.id).toMatch(/-process$/);
    expect(second!.contains(document.activeElement)).toBe(true);
  });

  it("the picker shows each person's load; someone on leave is greyed with the leave and cannot be picked", async () => {
    renderWithTeam();
    const card = cards()[0]!;
    await act(async () => {
      fireEvent.click(within(card).getByRole("combobox", { name: "Nhân viên thực hiện" }));
      await Promise.resolve();
    });
    const free = await screen.findByRole("option", { name: /Worker One/ });
    expect(free.textContent).toContain("Worker One · Rảnh");
    expect(screen.getByRole("option", { name: /Worker Three/ }).textContent).toContain("· 10 P-T");
    const away = screen.getByRole("option", { name: /Worker Away/ });
    expect(away.textContent).toContain("Nghỉ cả ngày");
    expect(away.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.pointerDown(away);
      fireEvent.click(away);
      await Promise.resolve();
    });
    expect(within(card).getByRole("combobox", { name: "Nhân viên thực hiện" }).textContent).not.toContain(
      "Worker Away"
    );
    // Typing narrows the list (accents and case ignored).
    fireEvent.change(screen.getByLabelText("Tìm nhân viên"), { target: { value: "three" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      expect.stringContaining("Worker Three")
    ]);
    await act(async () => {
      const option = screen.getByRole("option", { name: /Worker Three/ });
      fireEvent.pointerDown(option);
      fireEvent.click(option);
      await Promise.resolve();
    });
    expect(within(card).getByRole("combobox", { name: "Nhân viên thực hiện" }).textContent).toContain(
      "Worker Three"
    );
  });

  it("“Xem cả team” shows everyone as tiles grouped Rảnh · Đang làm <code> · Khác · Đang nghỉ; the one on leave is not clickable", async () => {
    renderWithTeam();
    const toggle = screen.getByRole("button", { name: "Xem cả team (1 rảnh · 1 đang nghỉ)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
    });
    const group = (name: string) =>
      within(screen.getByRole("list", { name })).getAllByRole("button").map((tile) => tile.getAttribute("aria-label"));
    expect(group("Rảnh")).toEqual(["Worker One · Rảnh"]);
    expect(group("Đang làm P-T")).toEqual(["Worker Three · 10 P-T · Đang làm P-T"]);
    expect(group("Khác")).toEqual(["Leader Test · 4 BRX"]);
    expect(group("Đang nghỉ")).toEqual(["Worker Away · Nghỉ cả ngày"]);
    expect(within(screen.getByRole("list", { name: "Đang nghỉ" })).getByRole("button")).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("button", { name: "Ẩn cả team" })).toBeTruthy();
  });

  it("renders the header above the tasks (the Overview's Job Code picker)", () => {
    renderWithTeam({ header: <p>Chọn Job Code chưa chia</p> });
    expect(screen.getByText("Chọn Job Code chưa chia")).toBeTruthy();
  });

  it("no suggestions when the tasks are fixed to me (create: own) or for a caller without LEADER / ADMIN", () => {
    renderWithTeam({ ownOnly: true });
    expect(screen.queryByText(/Gợi ý cho/)).toBeNull();
    cleanup();
    renderWithTeam({ roles: ["STAFF"] });
    expect(screen.queryByText(/Gợi ý cho/)).toBeNull();
  });

  it("without team load the dialog still works (names only, no suggestions)", async () => {
    renderDialog();
    expect(screen.queryByText(/Gợi ý cho/)).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const card = cards()[0]!;
    await pick(card, "Nhân viên thực hiện", /Worker One/);
    expect(within(card).getByRole("combobox", { name: "Nhân viên thực hiện" }).textContent).toContain(
      "Worker One"
    );
  });
});

// PD-080b — only priced processes --------------------------------------------------------------------------------------

describe("SplitTasksDialog — only priced processes (PD-080b)", () => {
  const BLEND = id(81);
  const blend = { id: BLEND, name: "Blend", isQc: false, sortOrder: 2, active: true };
  const rule = (processId: string, projectId = PROJECT.id) => ({
    id: `${processId.slice(0, 30)}99`,
    projectId,
    processId,
    creditPerImage: 2,
    moneyPerImage: null,
    effectiveFrom: today,
    effectiveTo: null
  });
  const openProcesses = async (card: HTMLElement) => {
    await act(async () => {
      fireEvent.click(within(card).getByRole("combobox", { name: "Quy trình" }));
      await Promise.resolve();
    });
    return (await screen.findAllByRole("option")).map((option) => option.textContent ?? "");
  };

  it("the card's list offers only the processes priced for the job's project on its Ngày nhận", async () => {
    renderDialog({ extraProcesses: [blend], rules: [rule(RETOUCH), rule(BLEND, id(42))] });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const names = await openProcesses(cards()[0]!);
    expect(names.some((name) => name.includes("Retouch"))).toBe(true);
    // Blend is priced for another project only.
    expect(names.some((name) => name.includes("Blend"))).toBe(false);
  });

  it("a project without any price that day: the picker is disabled with “Project chưa có đơn giá — liên hệ Quản trị”", () => {
    renderDialog({ extraProcesses: [blend], rules: [rule(BLEND, id(42))] });
    const card = within(cards()[0]!);
    expect(card.getByText("Project chưa có đơn giá — liên hệ Quản trị")).toBeTruthy();
    expect(card.getByRole("combobox", { name: "Quy trình" })).toHaveProperty("disabled", true);
  });

  it("a chosen process that loses its price on the card's day is cleared, with a hint", async () => {
    let cache: QueryClient | null = null;
    renderDialog({
      extraProcesses: [blend],
      rules: [rule(RETOUCH), rule(BLEND)],
      onClient: (client) => {
        cache = client;
      }
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const card = cards()[0]!;
    await pick(card, "Quy trình", /Retouch/);
    expect(within(card).getByRole("combobox", { name: "Quy trình" }).textContent).toContain("Retouch");
    await act(async () => {
      cache!.setQueryData(productionKeys.creditMatrix(today), { at: today, projects: [], processes: [], rules: [rule(BLEND)] });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(within(cards()[0]!).getByText(/“Retouch” chưa có đơn giá ngày .* — chọn lại quy trình\./)).toBeTruthy()
    );
    expect(within(cards()[0]!).getByRole("combobox", { name: "Quy trình" }).textContent).toContain("Chọn quy trình");
  });
});
