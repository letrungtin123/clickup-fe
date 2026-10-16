// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductionTask, TaskQtyRequest } from "@/contracts/production-jobs";
import { SessionValueContext } from "@/features/auth/session-context";
import { ApiError } from "@/lib/api/errors";
import type { SessionContext } from "@/lib/api/schemas";

import { jobsApi } from "../../jobs-api";
import { productionKeys } from "../../keys";
import { taskEditRights } from "../../task-edit-model";
import { InlineEditScope } from "./inline-field";
import { QtyRequestBanner } from "./qty-request";
import { TaskFacts } from "./task-fields";
import { TaskSubtasks } from "./task-subtasks";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// PD-044 / PD-047 task page: click-to-edit fields, quantity requests in place, subtasks. Obviously fake ids and names (public repository).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Asia/Ho_Chi_Minh";
const person = (n: number, name: string) => ({
  id: id(n),
  displayName: name,
  email: null,
  avatarUrl: null
});
const LEADER = person(1, "Leader A");
const WORKER = person(2, "Người B");
const RETOUCH = { id: id(20), name: "Retouch", isQc: false, sortOrder: 1, active: true };
const CUTOUT = { id: id(21), name: "Cắt nền", isQc: false, sortOrder: 2, active: true };
const CHECKING = { id: id(22), name: "Checking", isQc: true, sortOrder: 3, active: true };

const caps = (
  overrides: Partial<ProductionTask["capabilities"]> = {}
): ProductionTask["capabilities"] => ({
  transitions: [],
  canEdit: false,
  canAssign: false,
  canChangeAssignee: false,
  canEditQty: false,
  canEditQtyAssigned: false,
  canRequestQty: false,
  canDecideQtyRequest: false,
  canCreateSubtask: false,
  canDelete: false,
  ...overrides
});

const subtask = {
  id: id(104),
  number: 4,
  code: "3a",
  process: { id: CUTOUT.id, name: CUTOUT.name },
  qtyAssigned: 3,
  qtyDone: null,
  reason: "Phần nền cần cắt riêng",
  createdBy: WORKER,
  createdAt: "2026-10-02T09:00:00+07:00"
};

const line = (overrides: Partial<ProductionTask> = {}): ProductionTask => ({
  id: id(50),
  number: 3,
  code: "3",
  jobId: id(60),
  jobCode: "VD JOB-1",
  project: { id: id(70), code: "VD", name: "Dự án thử" },
  assignee: WORKER,
  qc: null,
  process: { id: RETOUCH.id, name: RETOUCH.name, isQc: false },
  shift: { id: id(30), name: "Ca ngày", payMode: "POINTS", requiresOtHours: false },
  qtyAssigned: 7,
  qtyDone: null,
  errorQty: null,
  otHours: null,
  assignedAt: "2026-10-01T00:00:00+07:00",
  deadline: "2099-10-05T23:59:00+07:00",
  doneAt: null,
  checkedAt: null,
  status: { id: id(80), code: "IN_PROGRESS", name: "Đang làm", color: "blue" },
  kind: "NORMAL",
  parentTaskId: null,
  isSubtask: false,
  splitReason: null,
  subtasks: [],
  allocatedQty: 7,
  pendingQtyRequest: null,
  feedbackId: null,
  note: null,
  workLink: null,
  isLate: false,
  jobArchived: false,
  qcFailCount: 0,
  customValues: {},
  tagIds: [],
  myCredits: [],
  lastQcFail: null,
  createdAt: "2026-10-01T08:00:00+07:00",
  updatedAt: "2026-10-01T08:00:00+07:00",
  capabilities: caps(),
  ...overrides
});

const request: TaskQtyRequest = {
  id: id(90),
  taskId: id(50),
  fromQty: 10,
  toQty: 12,
  reason: "Khách gửi thêm 2 tấm",
  status: "PENDING",
  requestedBy: WORKER,
  createdAt: "2026-10-02T10:00:00+07:00",
  decidedBy: null,
  decidedAt: null,
  decisionNote: null
};

const member = (user: ReturnType<typeof person>, roles: string[]) => ({
  userId: user.id,
  displayName: user.displayName,
  email: null,
  avatarUrl: null,
  roles,
  teamId: null,
  active: true,
  customValues: {},
  tagIds: []
});

const renderWith = (
  me: ReturnType<typeof person>,
  ui: ReactNode,
  extraMembers: ReturnType<typeof member>[] = []
) => {
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
    items: [member(LEADER, ["LEADER"]), member(WORKER, ["STAFF"]), ...extraMembers]
  });
  client.setQueryData(productionKeys.processes(), { items: [RETOUCH, CUTOUT, CHECKING] });
  client.setQueryData(productionKeys.shifts(), { items: [] });
  const session = {
    user: { id: me.id, displayName: me.displayName, email: "test@example.test", avatarUrl: null },
    productionRoles: ["LEADER"]
  } as unknown as SessionContext;
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <MemoryRouter>
          <InlineEditScope>{ui}</InlineEditScope>
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

const facts = (task: ProductionTask, me: ReturnType<typeof person>) =>
  renderWith(
    me,
    <TaskFacts
      task={task}
      rights={taskEditRights(task, { archived: false })}
      timeZone={TZ}
      myId={me.id}
    />
  );

/** The one element whose whole text is `text` (text split over child spans). */
const textOf = (text: string) =>
  screen.getByText((_, element) =>
    Boolean(
      element?.textContent === text &&
      Array.from(element.children).every((child) => child.textContent !== text)
    )
  );

/** The value an InlineField's edit button describes (its <dd>). */
const valueOf = (trigger: HTMLElement) =>
  document.getElementById(trigger.getAttribute("aria-describedby") ?? "")?.textContent?.trim();

const click = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("TaskFacts — Số lượng giao", () => {
  it("the Leader edits the total of a split task; the task's own part (total − subtasks) is sent (PD-048)", async () => {
    const task = line({
      capabilities: caps({ canEdit: true, canEditQtyAssigned: true }),
      subtasks: [subtask],
      allocatedQty: 10
    });
    const update = vi
      .spyOn(jobsApi, "updateTask")
      .mockResolvedValue({ ...task, qtyAssigned: 9, allocatedQty: 12 });
    facts(task, LEADER);
    const field = screen.getByRole("button", { name: "Sửa Số lượng giao" });
    // Only the total: no "task này" / "tổng".
    expect(valueOf(field)).toBe("10");
    await click(field);
    const input = screen.getByLabelText<HTMLInputElement>("Số lượng giao");
    expect(input.value).toBe("10");
    expect(screen.getByText("Tính cả 3 tấm của subtask.")).toBeTruthy();
    expect(screen.queryByText(/task này/)).toBeNull();

    fireEvent.change(input, { target: { value: "3" } });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Tổng phải lớn hơn số lượng các subtask (3)."
    );
    expect(update).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "12" } });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(update).toHaveBeenCalledWith(task.id, { qtyAssigned: 9 });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Đã sửa số lượng giao của #3: 10 → 12")
    );
  });

  it("without subtasks the total is the task's own quantity", async () => {
    const task = line({ capabilities: caps({ canEdit: true, canEditQtyAssigned: true }) });
    const update = vi.spyOn(jobsApi, "updateTask").mockResolvedValue({ ...task, qtyAssigned: 8 });
    facts(task, LEADER);
    const field = screen.getByRole("button", { name: "Sửa Số lượng giao" });
    expect(valueOf(field)).toBe("7");
    await click(field);
    fireEvent.change(screen.getByLabelText("Số lượng giao"), { target: { value: "8" } });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(update).toHaveBeenCalledWith(task.id, { qtyAssigned: 8 });
  });

  it("a worker without the direct right asks the Leader in place: the field opens the request form, no dialog (PD-047)", async () => {
    const task = line({
      capabilities: caps({ canEdit: true, canRequestQty: true }),
      subtasks: [subtask],
      allocatedQty: 10
    });
    const ask = vi.spyOn(jobsApi, "requestQty").mockResolvedValue(task);
    facts(task, WORKER);
    expect(screen.queryByRole("button", { name: "Sửa Số lượng giao" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sửa Nhân viên thực hiện" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sửa Ngày giao" })).toBeTruthy();

    const field = screen.getByRole("button", { name: "Đề nghị sửa Số lượng giao" });
    expect(valueOf(field)).toBe("10");
    await click(field);
    expect(screen.queryByRole("dialog")).toBeNull();
    const form = screen.getByRole("group", { name: "Đề nghị sửa Số lượng giao" });
    const total = within(form).getByLabelText<HTMLInputElement>("Số lượng mới");
    expect(total.value).toBe("10");
    expect(document.activeElement).toBe(total);
    expect(within(form).getByText(/Leader sẽ nhận thông báo và duyệt/)).toBeTruthy();
    expect(within(form).getByText(/Đang giao 10 tấm \(tính cả 3 tấm của subtask\)/)).toBeTruthy();
    expect(within(form).queryByText(/task này/)).toBeNull();

    fireEvent.change(total, { target: { value: "12" } });
    await click(within(form).getByRole("button", { name: "Gửi đề nghị" }));
    expect(within(form).getByRole("alert").textContent).toBe(
      "Nhập lý do để Leader biết vì sao cần sửa."
    );
    expect(within(form).getByLabelText("Lý do").getAttribute("aria-invalid")).toBe("true");
    expect(ask).not.toHaveBeenCalled();

    fireEvent.change(within(form).getByLabelText("Lý do"), { target: { value: "Khách gửi thêm" } });
    // Enter in the number sends the request (a one-line input).
    await act(async () => {
      fireEvent.keyDown(total, { key: "Enter" });
      await Promise.resolve();
    });
    expect(ask).toHaveBeenCalledWith(task.id, { qtyAssigned: 12, reason: "Khách gửi thêm" });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Đã gửi đề nghị sửa số tấm giao của #3: 10 → 12")
    );
    expect(screen.queryByRole("group", { name: "Đề nghị sửa Số lượng giao" })).toBeNull();
  });

  it("the request form's Hủy closes it without sending", async () => {
    const task = line({ capabilities: caps({ canRequestQty: true }) });
    const ask = vi.spyOn(jobsApi, "requestQty").mockResolvedValue(task);
    facts(task, WORKER);
    await click(screen.getByRole("button", { name: "Đề nghị sửa Số lượng giao" }));
    await click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.queryByLabelText("Số lượng mới")).toBeNull();
    expect(ask).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Đề nghị sửa Số lượng giao" })
    );
  });

  it("after Done, someone other than the worker must give a reason to correct the Done quantity", async () => {
    const task = line({
      capabilities: caps({ canEdit: true, canEditQty: true }),
      doneAt: "2026-10-03T10:00:00+07:00",
      qtyDone: 7
    });
    const setQty = vi.spyOn(jobsApi, "setQty").mockResolvedValue({ ...task, qtyDone: 5 });
    facts(task, LEADER);
    expect(screen.queryByRole("button", { name: "Sửa Ca" })).toBeNull();
    await click(screen.getByRole("button", { name: "Sửa Số tấm đã xong" }));
    fireEvent.change(screen.getByLabelText("Số tấm đã xong"), { target: { value: "5" } });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(screen.getByRole("alert").textContent).toBe("Ghi lý do sửa để người làm biết.");
    expect(setQty).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Lý do"), { target: { value: "Đếm lại còn 5" } });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(setQty).toHaveBeenCalledWith(task.id, { qtyDone: 5, note: "Đếm lại còn 5" });
  });

  it("Số tấm đã xong counts the subtasks over the total; its editor corrects the task's own part only (PD-048)", async () => {
    const task = line({
      capabilities: caps({ canEdit: true, canEditQty: true }),
      doneAt: "2026-10-03T10:00:00+07:00",
      qtyDone: 7,
      subtasks: [{ ...subtask, qtyDone: 3 }],
      allocatedQty: 10
    });
    const setQty = vi.spyOn(jobsApi, "setQty").mockResolvedValue({ ...task, qtyDone: 6 });
    facts(task, WORKER);
    const field = screen.getByRole("button", { name: "Sửa Số tấm đã xong" });
    expect(valueOf(field)?.replace(/\s+/g, " ")).toBe("10 / 10");
    expect(valueOf(field)).not.toMatch(/subtask/);
    await click(field);
    const input = screen.getByLabelText<HTMLInputElement>(
      "Số tấm xong của task #3, không gồm subtask"
    );
    expect(input.value).toBe("7");
    expect(screen.getByText(/Số xong của subtask sửa ở trang của subtask/)).toBeTruthy();
    fireEvent.change(input, { target: { value: "6" } });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(setQty).toHaveBeenCalledWith(task.id, { qtyDone: 6 });
  });
});

describe("Quantity requests", () => {
  it("the Leader approves, or rejects with a note", async () => {
    const decide = vi.spyOn(jobsApi, "decideQtyRequest").mockResolvedValue(line());
    const task = line({
      capabilities: caps({ canDecideQtyRequest: true }),
      pendingQtyRequest: request
    });
    renderWith(
      LEADER,
      <QtyRequestBanner
        task={task}
        request={request}
        myId={LEADER.id}
        archived={false}
        timeZone={TZ}
      />
    );
    const banner = screen.getByRole("region", { name: "Đề nghị sửa số tấm giao" });
    expect(banner.textContent).toContain("Người B đề nghị sửa số tấm giao 10 → 12");
    expect(banner.textContent).toContain("Khách gửi thêm 2 tấm");
    expect(within(banner).queryByRole("button", { name: "Huỷ đề nghị" })).toBeNull();
    await click(within(banner).getByRole("button", { name: "Duyệt" }));
    expect(decide).toHaveBeenLastCalledWith(request.id, { approve: true });

    await click(within(banner).getByRole("button", { name: "Từ chối" }));
    fireEvent.change(screen.getByLabelText(/Lý do từ chối/), { target: { value: "Chưa đúng số" } });
    await click(within(banner).getByRole("button", { name: "Xác nhận từ chối" }));
    expect(decide).toHaveBeenLastCalledWith(request.id, { approve: false, note: "Chưa đúng số" });
  });

  it("the worker who asked sees it pending and may cancel it", async () => {
    const cancel = vi.spyOn(jobsApi, "cancelQtyRequest").mockResolvedValue(line());
    const task = line({ pendingQtyRequest: request });
    renderWith(
      WORKER,
      <QtyRequestBanner
        task={task}
        request={request}
        myId={WORKER.id}
        archived={false}
        timeZone={TZ}
      />
    );
    const banner = screen.getByRole("region", { name: "Đề nghị sửa số tấm giao" });
    expect(banner.textContent).toContain("Đang chờ duyệt: 10 → 12");
    expect(within(banner).queryByRole("button", { name: "Duyệt" })).toBeNull();
    await click(within(banner).getByRole("button", { name: "Huỷ đề nghị" }));
    expect(cancel).toHaveBeenCalledWith(request.id);
  });

  it("a refused request keeps the inline form open with the API's message", async () => {
    const task = line({ capabilities: caps({ canRequestQty: true }) });
    vi.spyOn(jobsApi, "requestQty").mockRejectedValue(
      new ApiError({
        status: 409,
        code: "QTY_REQUEST_OPEN",
        message: "Task #3 đã có một đề nghị sửa số tấm đang chờ duyệt."
      })
    );
    facts(task, WORKER);
    await click(screen.getByRole("button", { name: "Đề nghị sửa Số lượng giao" }));
    fireEvent.change(screen.getByLabelText("Số lượng mới"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Lý do"), { target: { value: "Thiếu 2 tấm" } });
    await click(screen.getByRole("button", { name: "Gửi đề nghị" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Task #3 đã có một đề nghị sửa số tấm đang chờ duyệt."
      )
    );
    expect(screen.getByLabelText<HTMLInputElement>("Số lượng mới").value).toBe("9");
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("TaskFacts — QC (PD-047)", () => {
  it("the QC of a work task is changed, never removed: no “Chưa gán QC” choice", async () => {
    const CHECKER = person(3, "Người C");
    const OTHER_QC = person(4, "Người D");
    const task = line({ qc: CHECKER, capabilities: caps({ canEdit: true, canAssign: true }) });
    const assign = vi.spyOn(jobsApi, "assign").mockResolvedValue({ ...task, qc: OTHER_QC });
    renderWith(
      LEADER,
      <TaskFacts
        task={task}
        rights={taskEditRights(task, { archived: false })}
        timeZone={TZ}
        myId={LEADER.id}
      />,
      [member(CHECKER, ["QC"]), member(OTHER_QC, ["QC"])]
    );
    await click(screen.getByRole("button", { name: "Sửa QC" }));
    expect(screen.getByText(/chỉ đổi sang QC khác/)).toBeTruthy();
    await click(screen.getByRole("combobox", { name: "QC" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).not.toContain("Chưa gán QC");
    expect(options).toHaveLength(2);
    const other = options.find((option) => option.textContent?.includes("Người D"));
    await act(async () => {
      fireEvent.pointerDown(other!);
      fireEvent.click(other!);
      await Promise.resolve();
    });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(assign).toHaveBeenCalledWith(task.id, { qcId: OTHER_QC.id });
  });

  it("an older task without QC must get one: saving empty is refused", async () => {
    const task = line({ capabilities: caps({ canEdit: true, canAssign: true }) });
    const assign = vi.spyOn(jobsApi, "assign").mockResolvedValue(task);
    facts(task, LEADER);
    expect(screen.getByText("Chưa gán")).toBeTruthy();
    await click(screen.getByRole("button", { name: "Sửa QC" }));
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(screen.getByRole("alert").textContent).toBe("Chọn QC.");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("TaskSubtasks", () => {
  it("lists the subtasks by code and creates one: another non-QC process, the line keeps at least 1, an optional reason", async () => {
    const task = line({
      capabilities: caps({ canEdit: true, canCreateSubtask: true }),
      subtasks: [subtask],
      qtyAssigned: 7,
      allocatedQty: 10
    });
    const create = vi.spyOn(jobsApi, "createSubtask").mockResolvedValue(task);
    renderWith(WORKER, <TaskSubtasks task={task} archived={false} timeZone={TZ} />);
    const list = screen.getByRole("list", { name: "Subtask của task #3" });
    expect(list.textContent).toContain("#3a · Cắt nền");
    expect(list.textContent).toContain("Số lượng 3");
    expect(list.textContent).toContain("Phần nền cần cắt riêng");
    // PD-048: a subtask row shows only its quantity; the task (root) its own part, then the total.
    expect(list.textContent).not.toMatch(/xong/);
    expect(textOf("Số lượng 7")).toBeTruthy();
    expect(textOf("Tổng 10")).toBeTruthy();
    expect(
      screen.getByText("Tách một phần số tấm sang công đoạn khác; trạng thái đi theo task này.")
    ).toBeTruthy();

    await click(screen.getByRole("button", { name: "Thêm subtask" }));
    const form = screen.getByRole("form", { name: "Tạo subtask cho task #3" });
    const qty = within(form).getByLabelText("Số lượng (tùy chọn)");
    fireEvent.change(qty, { target: { value: "2" } });
    expect(within(form).getByText("Task gốc còn 5 tấm · Tổng Leader giao vẫn là 10")).toBeTruthy();
    fireEvent.change(qty, { target: { value: "7" } });
    await click(within(form).getByRole("button", { name: "Tạo subtask" }));
    expect(within(form).getByText("Tối đa 6 tấm (task gốc giữ ít nhất 1 tấm).")).toBeTruthy();
    expect(within(form).getByText("Chọn công đoạn.")).toBeTruthy();
    // PD-045: the reason is optional.
    expect(within(form).queryByText("Nhập lý do tách subtask.")).toBeNull();
    expect(create).not.toHaveBeenCalled();

    await click(within(form).getByRole("combobox", { name: "Công đoạn" }));
    const options = await screen.findAllByRole("option");
    // Not the line's own process, not the QC process.
    expect(options.map((option) => option.textContent)).toEqual(["Cắt nền"]);
    await act(async () => {
      fireEvent.pointerDown(options[0]!);
      fireEvent.click(options[0]!);
      await Promise.resolve();
    });
    fireEvent.change(qty, { target: { value: "2" } });
    fireEvent.change(within(form).getByLabelText("Lý do (tùy chọn)"), {
      target: { value: "Nền cần cắt" }
    });
    await click(within(form).getByRole("button", { name: "Tạo subtask" }));
    expect(create).toHaveBeenCalledWith(task.id, {
      processId: CUTOUT.id,
      qtyAssigned: 2,
      reason: "Nền cần cắt"
    });
  });

  it("creates a subtask without a reason: none is sent (PD-045)", async () => {
    const task = line({
      capabilities: caps({ canEdit: true, canCreateSubtask: true }),
      qtyAssigned: 7,
      allocatedQty: 7
    });
    const create = vi.spyOn(jobsApi, "createSubtask").mockResolvedValue(task);
    renderWith(WORKER, <TaskSubtasks task={task} archived={false} timeZone={TZ} />);
    await click(screen.getByRole("button", { name: "Thêm subtask" }));
    const form = screen.getByRole("form", { name: "Tạo subtask cho task #3" });
    await click(within(form).getByRole("combobox", { name: "Công đoạn" }));
    const [option] = await screen.findAllByRole("option");
    await act(async () => {
      fireEvent.pointerDown(option!);
      fireEvent.click(option!);
      await Promise.resolve();
    });
    fireEvent.change(within(form).getByLabelText("Số lượng (tùy chọn)"), { target: { value: "2" } });
    fireEvent.change(within(form).getByLabelText("Lý do (tùy chọn)"), { target: { value: "   " } });
    await click(within(form).getByRole("button", { name: "Tạo subtask" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1]).toEqual({ processId: CUTOUT.id, qtyAssigned: 2 });
    expect(create.mock.calls[0]?.[1]?.reason).toBeUndefined();
  });

  it("the worker deletes their own subtask after confirming, without the right to delete the task (PD-047)", async () => {
    const task = line({
      // Staff: "delete: none" — the task itself cannot be deleted, its subtasks can (before Done).
      capabilities: caps({ canEdit: true, canCreateSubtask: true, canDelete: false }),
      subtasks: [subtask],
      allocatedQty: 10
    });
    const remove = vi
      .spyOn(jobsApi, "removeTask")
      .mockResolvedValue({ taskId: subtask.id, jobId: task.jobId, reversedEntries: 0 });
    renderWith(WORKER, <TaskSubtasks task={task} archived={false} timeZone={TZ} />);
    await click(screen.getByRole("button", { name: "Xoá subtask #3a" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("3 tấm của subtask trả về task #3");
    await click(within(dialog).getByRole("button", { name: "Xoá subtask" }));
    expect(remove).toHaveBeenCalledWith(subtask.id);
  });

  it("shows the line as a collapsible tree folder with its subtasks as leaves", async () => {
    const task = line({
      capabilities: caps({ canEdit: true, canCreateSubtask: true }),
      subtasks: [subtask],
      qtyAssigned: 7,
      allocatedQty: 10
    });
    renderWith(WORKER, <TaskSubtasks task={task} archived={false} timeZone={TZ} />);
    const toggle = screen.getByRole("button", { name: "Thu gọn subtask của task #3" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: "Subtask của task #3" })).toBeTruthy();
    await click(toggle);
    expect(screen.queryByRole("list", { name: "Subtask của task #3" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thêm subtask" })).toBeNull();
    await click(screen.getByRole("button", { name: "Mở subtask của task #3" }));
    expect(screen.getByRole("list", { name: "Subtask của task #3" }).textContent).toContain(
      "#3a · Cắt nền"
    );
  });

  it("a subtask row: the name opens it, its pencil edits the process, the quantity is edited by clicking it", async () => {
    const onOpenTask = vi.fn();
    const task = line({
      capabilities: caps({ canEdit: true, canCreateSubtask: true }),
      subtasks: [subtask],
      qtyAssigned: 7,
      allocatedQty: 10
    });
    const update = vi.spyOn(jobsApi, "updateTask").mockResolvedValue(task);
    renderWith(
      WORKER,
      <TaskSubtasks task={task} archived={false} timeZone={TZ} onOpenTask={onOpenTask} />
    );
    await click(screen.getByRole("button", { name: "#3a · Cắt nền" }));
    expect(onOpenTask).toHaveBeenCalledWith(subtask.id);
    expect(screen.getByRole("button", { name: "Sửa Công đoạn subtask #3a" })).toBeTruthy();

    await click(screen.getByRole("button", { name: "Sửa Số lượng của subtask #3a" }));
    const qty = screen.getByLabelText<HTMLInputElement>("Số lượng của subtask");
    expect(qty.value).toBe("3");
    fireEvent.change(qty, { target: { value: "4" } });
    expect(screen.getByText("Task gốc còn 6 tấm · Tổng Leader giao vẫn là 10")).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(qty, { key: "Enter" });
      await Promise.resolve();
    });
    expect(update).toHaveBeenCalledWith(subtask.id, { qtyAssigned: 4 });
  });

  it("the task row: the name stays a label, its pencil edits the task's process in place (the title's list)", async () => {
    const task = line({
      capabilities: caps({ canEdit: true, canCreateSubtask: true }),
      subtasks: [subtask],
      qtyAssigned: 7,
      allocatedQty: 10
    });
    const update = vi.spyOn(jobsApi, "updateTask").mockRejectedValue(
      new ApiError({
        status: 400,
        code: "PROCESS_INVALID",
        message: "Task có subtask không chuyển sang Checking được."
      })
    );
    renderWith(WORKER, <TaskSubtasks task={task} archived={false} timeZone={TZ} />);
    // The name is plain text (not a button); the row keeps its columns until the editor opens.
    expect(screen.queryByRole("button", { name: "#3 · Retouch" })).toBeNull();
    expect(screen.getByText("#3 · Retouch")).toBeTruthy();
    expect(textOf("Số lượng 7")).toBeTruthy();
    expect(textOf("Tổng 10")).toBeTruthy();

    await click(screen.getByRole("button", { name: "Sửa công đoạn task #3" }));
    const editor = screen.getByRole("group", { name: "Sửa công đoạn task #3" });
    // The editor takes the row: no count, quantities or status dot beside it.
    expect(document.body.textContent).not.toContain("Tổng 10");
    expect(screen.queryByTitle("Trạng thái: Đang làm")).toBeNull();
    expect(
      within(editor).getByText(
        "Công đoạn phải hợp với người làm. Task có subtask không chuyển sang Checking hay công đoạn của subtask."
      )
    ).toBeTruthy();
    await click(within(editor).getByRole("combobox", { name: "Công đoạn task #3" }));
    const options = await screen.findAllByRole("option");
    // Same list as the page title: every active process, QC marked.
    expect(options.map((option) => option.textContent)).toEqual([
      "Retouch",
      "Cắt nền",
      "CheckingQC"
    ]);
    await act(async () => {
      fireEvent.pointerDown(options[2]!);
      fireEvent.click(options[2]!);
      await Promise.resolve();
    });
    await click(within(editor).getByRole("button", { name: "Lưu" }));
    expect(update).toHaveBeenCalledWith(task.id, { processId: CHECKING.id });
    // The API refuses (a task with subtasks stays a work task): its message under the editor, which stays open.
    await waitFor(() =>
      expect(within(editor).getByRole("alert").textContent).toBe(
        "Task có subtask không chuyển sang Checking được."
      )
    );
    expect(toast.success).not.toHaveBeenCalled();

    await click(within(editor).getByRole("button", { name: "Hủy" }));
    expect(screen.queryByRole("group", { name: "Sửa công đoạn task #3" })).toBeNull();
    expect(textOf("Tổng 10")).toBeTruthy();
  });

  it("the task row's process is saved with a toast", async () => {
    const task = line({ capabilities: caps({ canEdit: true, canCreateSubtask: true }) });
    const update = vi.spyOn(jobsApi, "updateTask").mockResolvedValue(task);
    renderWith(WORKER, <TaskSubtasks task={task} archived={false} timeZone={TZ} />);
    await click(screen.getByRole("button", { name: "Sửa công đoạn task #3" }));
    await click(screen.getByRole("combobox", { name: "Công đoạn task #3" }));
    const option = (await screen.findAllByRole("option")).find(
      (item) => item.textContent === "Cắt nền"
    );
    await act(async () => {
      fireEvent.pointerDown(option!);
      fireEvent.click(option!);
      await Promise.resolve();
    });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(update).toHaveBeenCalledWith(task.id, { processId: CUTOUT.id });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Đã đổi công đoạn của #3 sang Cắt nền")
    );
    expect(screen.queryByRole("group", { name: "Sửa công đoạn task #3" })).toBeNull();
  });

  it("no pencil on the task row without the right to edit the task, on an archived job, or after Done", () => {
    // The worker may split (subtask pencils), but not edit the task itself.
    const worker = line({ capabilities: caps({ canCreateSubtask: true }), subtasks: [subtask] });
    renderWith(WORKER, <TaskSubtasks task={worker} archived={false} timeZone={TZ} />);
    expect(screen.getByRole("button", { name: "Sửa Công đoạn subtask #3a" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sửa công đoạn task #3" })).toBeNull();
    cleanup();
    const editable = line({ capabilities: caps({ canEdit: true }), subtasks: [subtask] });
    renderWith(LEADER, <TaskSubtasks task={editable} archived timeZone={TZ} />);
    expect(screen.queryByRole("button", { name: "Sửa công đoạn task #3" })).toBeNull();
  });

  it("after Done (or without rights) nothing can be changed, and an empty section is hidden", () => {
    const done = line({
      capabilities: caps({ canEdit: true, canEditQty: true }),
      subtasks: [{ ...subtask, qtyDone: 3 }],
      doneAt: "2026-10-03T10:00:00+07:00"
    });
    renderWith(WORKER, <TaskSubtasks task={done} archived={false} timeZone={TZ} />);
    expect(screen.queryByRole("button", { name: "Thêm subtask" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Xoá subtask #3a" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sửa Số lượng của subtask/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sửa công đoạn task #3" })).toBeNull();
    // PD-048: no Done quantity (nor its editor) on a subtask row — it is corrected on the subtask's page.
    expect(screen.queryByRole("button", { name: /đã xong/ })).toBeNull();
    expect(screen.getByRole("list", { name: "Subtask của task #3" }).textContent).not.toMatch(
      /xong/
    );
    cleanup();
    renderWith(WORKER, <TaskSubtasks task={line()} archived={false} timeZone={TZ} />);
    expect(screen.queryByText(/Tách một phần số tấm/)).toBeNull();
  });

  it("a task without subtasks shows only its quantity on the root row", () => {
    const task = line({ capabilities: caps({ canEdit: true, canCreateSubtask: true }) });
    renderWith(WORKER, <TaskSubtasks task={task} archived={false} timeZone={TZ} />);
    expect(textOf("Số lượng 7")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Tổng d/);
  });
});

describe("PD-058 — a task without a quantity", () => {
  const empty = { qtyAssigned: null, allocatedQty: 0 };

  it("the worker fills Số lượng giao in directly — no request flow", async () => {
    const task = line({ ...empty, capabilities: caps({ canEdit: true, canRequestQty: true }) });
    const update = vi.spyOn(jobsApi, "updateTask").mockResolvedValue({ ...task, qtyAssigned: 12 });
    const ask = vi.spyOn(jobsApi, "requestQty").mockResolvedValue(task);
    facts(task, WORKER);
    expect(screen.queryByRole("button", { name: "Đề nghị sửa Số lượng giao" })).toBeNull();
    const field = screen.getByRole("button", { name: "Điền Số lượng giao" });
    expect(valueOf(field)).toContain("Chưa có SL");
    await click(field);
    const input = screen.getByLabelText<HTMLInputElement>("Số lượng giao");
    expect(input.value).toBe("");
    expect(screen.queryByLabelText("Lý do")).toBeNull();
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(screen.getByRole("alert").textContent).toBe("Nhập số tấm nguyên ≥ 1.");
    expect(update).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "12" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });
    expect(update).toHaveBeenCalledWith(task.id, { qtyAssigned: 12 });
    expect(ask).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Đã điền số lượng"));
  });

  it("the Leader fills it in the same way; a split task's own part, its subtasks' images beside it", async () => {
    const task = line({
      ...empty,
      allocatedQty: 3,
      subtasks: [subtask],
      capabilities: caps({ canEdit: true, canEditQtyAssigned: true })
    });
    const update = vi.spyOn(jobsApi, "updateTask").mockResolvedValue({ ...task, qtyAssigned: 5 });
    facts(task, LEADER);
    expect(screen.queryByRole("button", { name: "Sửa Số lượng giao" })).toBeNull();
    const field = screen.getByRole("button", { name: "Điền Số lượng giao" });
    expect(valueOf(field)).toContain("+ 3 tấm subtask");
    await click(field);
    const input = screen.getByLabelText<HTMLInputElement>(
      "Số lượng của task #3, không gồm subtask"
    );
    fireEvent.change(input, { target: { value: "5" } });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(update).toHaveBeenCalledWith(task.id, { qtyAssigned: 5 });
  });

  it("someone who may not change it only sees the chip", () => {
    facts(line({ ...empty }), LEADER);
    expect(screen.queryByRole("button", { name: /Số lượng giao/ })).toBeNull();
    expect(screen.getByTitle("Chưa có số lượng — người làm điền khi chuyển Done")).toBeTruthy();
  });

  it("the tree shows “Chưa có SL” in the quantity column; an empty subtask is filled in directly", async () => {
    const task = line({
      ...empty,
      allocatedQty: 0,
      subtasks: [{ ...subtask, qtyAssigned: null }],
      capabilities: caps({ canEdit: true, canCreateSubtask: true })
    });
    const update = vi.spyOn(jobsApi, "updateTask").mockResolvedValue(task);
    renderWith(WORKER, <TaskSubtasks task={task} archived={false} timeZone={TZ} />);
    // Root and leaf: the chip instead of "Số lượng N"; no total until every part has a number.
    expect(screen.getAllByText("Chưa có SL")).toHaveLength(2);
    expect(textOf("Tổng —")).toBeTruthy();
    await click(screen.getByRole("button", { name: "Điền số lượng của subtask #3a" }));
    const qty = screen.getByLabelText<HTMLInputElement>("Số lượng của subtask");
    expect(qty.value).toBe("");
    // Nothing is carved from a task without a quantity: no "Task gốc còn".
    expect(screen.queryByText(/Task gốc còn/)).toBeNull();
    fireEvent.change(qty, { target: { value: "4" } });
    await act(async () => {
      fireEvent.keyDown(qty, { key: "Enter" });
      await Promise.resolve();
    });
    expect(update).toHaveBeenCalledWith(subtask.id, { qtyAssigned: 4 });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Đã điền số lượng"));
  });

  it("an empty subtask filled in under a task that has a number is taken from it (the task keeps at least 1)", async () => {
    const task = line({
      qtyAssigned: 7,
      allocatedQty: 7,
      subtasks: [{ ...subtask, qtyAssigned: null }],
      capabilities: caps({ canEdit: true, canCreateSubtask: true })
    });
    const update = vi.spyOn(jobsApi, "updateTask").mockResolvedValue(task);
    renderWith(WORKER, <TaskSubtasks task={task} archived={false} timeZone={TZ} />);
    await click(screen.getByRole("button", { name: "Điền số lượng của subtask #3a" }));
    const qty = screen.getByLabelText<HTMLInputElement>("Số lượng của subtask");
    fireEvent.change(qty, { target: { value: "7" } });
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(screen.getByRole("alert").textContent).toBe("Tối đa 6 tấm (task gốc giữ ít nhất 1 tấm).");
    expect(update).not.toHaveBeenCalled();
    fireEvent.change(qty, { target: { value: "4" } });
    expect(screen.getByText("Task gốc còn 3 tấm")).toBeTruthy();
    await click(screen.getByRole("button", { name: "Lưu" }));
    expect(update).toHaveBeenCalledWith(subtask.id, { qtyAssigned: 4 });
  });

  it("“Tạo subtask” without a quantity sends none; under a task without one nothing is carved", async () => {
    const task = line({
      ...empty,
      capabilities: caps({ canEdit: true, canCreateSubtask: true })
    });
    const create = vi.spyOn(jobsApi, "createSubtask").mockResolvedValue(task);
    renderWith(WORKER, <TaskSubtasks task={task} archived={false} timeZone={TZ} />);
    await click(screen.getByRole("button", { name: "Thêm subtask" }));
    const form = screen.getByRole("form", { name: "Tạo subtask cho task #3" });
    const qty = within(form).getByLabelText("Số lượng (tùy chọn)");
    expect(
      within(form).getByText("Để trống nếu chưa biết — người làm điền khi chuyển Done.")
    ).toBeTruthy();
    fireEvent.change(qty, { target: { value: "50" } });
    expect(within(form).getByText("Task gốc chưa có số lượng nên không bị trừ.")).toBeTruthy();
    fireEvent.change(qty, { target: { value: "" } });
    await click(within(form).getByRole("combobox", { name: "Công đoạn" }));
    const [option] = await screen.findAllByRole("option");
    await act(async () => {
      fireEvent.pointerDown(option!);
      fireEvent.click(option!);
      await Promise.resolve();
    });
    await click(within(form).getByRole("button", { name: "Tạo subtask" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1]).toEqual({ processId: CUTOUT.id });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Đã tạo subtask Cắt nền cho #3 — chưa có số lượng"
      )
    );
  });
});
