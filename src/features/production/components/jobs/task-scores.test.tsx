// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import type { ProductionTask } from "@/contracts/production-jobs";
import type { TaskScoreEntry, TaskScores } from "@/contracts/production-scores";

import { productionKeys } from "../../keys";
import { TaskScoresSection } from "./task-scores";

// PD-048 task scores: per process, per person (task + subtasks), ledger rows with their task code. Obviously fake ids
// and names (public repository).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const WORKER = { id: id(2), displayName: "Người B", email: null, avatarUrl: null };
const QC = { id: id(3), displayName: "Người C", email: null, avatarUrl: null };
const RETOUCH = { id: id(20), name: "Retouch" };
const CUTOUT = { id: id(21), name: "Cắt nền" };
const CHECKING = { id: id(22), name: "Checking" };

const task = {
  id: id(50),
  number: 3,
  code: "3",
  kind: "NORMAL",
  doneAt: "2026-10-03T10:00:00+07:00",
  subtasks: []
} as unknown as ProductionTask;

const entry = (
  n: number,
  overrides: Partial<TaskScoreEntry> & { code?: string } = {}
): TaskScoreEntry => {
  const { code = "3", ...rest } = overrides;
  return {
    id: id(200 + n),
    role: "WORKER",
    task: {
      id: code === "3" ? task.id : id(51),
      number: 3,
      code,
      jobId: id(60),
      jobCode: "VD JOB-1"
    },
    project: { id: id(70), code: "VD" },
    process: RETOUCH,
    shift: { id: id(30), name: "Ca ngày" },
    payMode: "POINTS",
    kind: "NORMAL",
    qty: 7,
    unitCredits: 1.5,
    credits: 10.5,
    money: null,
    missingRule: false,
    businessDay: "2026-10-03",
    period: "2026-10",
    adjustsEntryId: null,
    note: null,
    createdAt: "2026-10-03T10:00:00+07:00",
    user: WORKER,
    ...rest
  };
};

const scores: TaskScores = {
  taskId: task.id,
  moneyVisible: false,
  items: [
    entry(1),
    entry(2, {
      code: "3a",
      process: CUTOUT,
      qty: 3,
      unitCredits: 0,
      credits: 0,
      missingRule: true
    }),
    entry(3, { role: "QC", user: QC, process: CHECKING, qty: 10, unitCredits: 0.2, credits: 2 })
  ],
  totals: [
    { role: "WORKER", user: WORKER, qty: 10, credits: 10.5, money: null },
    { role: "QC", user: QC, qty: 10, credits: 2, money: null }
  ],
  byProcess: [
    { process: RETOUCH, qty: 7, credits: 10.5, unitCredits: 1.5, missingRule: false },
    { process: CUTOUT, qty: 3, credits: 0, unitCredits: null, missingRule: true },
    { process: CHECKING, qty: 10, credits: 2, unitCredits: 0.2, missingRule: false }
  ]
};

const renderScores = (isAdmin: boolean) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } }
  });
  client.setQueryData(productionKeys.me(), {
    roles: isAdmin ? ["ADMIN"] : ["LEADER"],
    isAdmin,
    teamId: null,
    jobPermissions: { view: "all", create: "all", update: "all", delete: "all" },
    settings: { timezone: "Asia/Ho_Chi_Minh" }
  });
  client.setQueryData(productionKeys.taskScores(task.id), scores);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TaskScoresSection task={task} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

afterEach(cleanup);

describe("TaskScoresSection (PD-048)", () => {
  it("breaks the points down by process: images × price, points, a missing price flagged", () => {
    renderScores(false);
    const byProcess = screen.getByRole("list", { name: "Điểm theo công đoạn" });
    const rows = within(byProcess).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("Retouch");
    expect(rows[0]?.textContent).toContain("7 tấm × 1,50");
    expect(rows[0]?.textContent).toContain("10,50 điểm");
    expect(rows[1]?.textContent).toContain("3 tấm × nhiều đơn giá");
    expect(rows[1]?.textContent).toContain(
      "Chưa có đơn giá cho công đoạn này lúc ghi nhận — 0 điểm. Thêm đơn giá ở Bảng đơn giá."
    );
    expect(rows[0]?.textContent).not.toContain("Chưa có đơn giá");
    // Not an admin: the price table is named, not linked.
    expect(within(byProcess).queryByRole("link", { name: "Bảng đơn giá" })).toBeNull();
    // The per-process warnings replace the old general note (and nothing says "dòng" for a task).
    expect(screen.queryByText(/Có dòng/)).toBeNull();
  });

  it("an admin gets a link to the price table", () => {
    renderScores(true);
    expect(screen.getByRole("link", { name: "Bảng đơn giá" })).toBeTruthy();
  });

  it("keeps the per-person totals (task and subtasks together) and marks each ledger row with its task code", async () => {
    renderScores(false);
    const people = screen.getByRole("list", { name: "Điểm theo người" });
    expect(within(people).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/gồm cả subtask/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Các dòng điểm (3)" }));
      await Promise.resolve();
    });
    const ledger = screen.getByRole("list", { name: "Các dòng điểm" });
    const rows = within(ledger).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getByTitle(/^(Task|Subtask) #/).textContent)).toEqual([
      "#3",
      "#3a",
      "#3"
    ]);
    expect(within(rows[1]!).getByTitle("Subtask #3a")).toBeTruthy();
  });
});

describe("TaskScoresSection — Khoán is money, never points (PD-066)", () => {
  const khoanScores = (money: number | null): TaskScores => ({
    taskId: task.id,
    moneyVisible: money !== null,
    items: [
      entry(1, {
        shift: { id: id(31), name: "Ca tối" },
        payMode: "MONEY_IF_KPI",
        qty: 10,
        unitCredits: 2,
        credits: 20,
        money
      })
    ],
    totals: [{ role: "WORKER", user: WORKER, qty: 10, credits: 20, money }],
    byProcess: [{ process: RETOUCH, qty: 10, credits: 20, unitCredits: 2, missingRule: false }]
  });
  const renderWith = (value: TaskScores) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } }
    });
    client.setQueryData(productionKeys.me(), {
      roles: ["STAFF"],
      isAdmin: false,
      teamId: null,
      jobPermissions: { view: "all", create: "none", update: "own", delete: "none" },
      settings: { timezone: "Asia/Ho_Chi_Minh" }
    });
    client.setQueryData(productionKeys.taskScores(task.id), value);
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TaskScoresSection task={task} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
  const words = (text: string | null | undefined) => text?.replace(/\s/g, " ") ?? "";

  it("a Khoán row shows its money per process, per person and in the ledger", async () => {
    renderWith(khoanScores(150_000));
    const byProcess = screen.getByRole("list", { name: "Điểm theo công đoạn" });
    expect(words(byProcess.textContent)).toContain("10 tấm · ca Khoán");
    expect(words(byProcess.textContent)).toContain("150.000 ₫");
    const people = screen.getByRole("list", { name: "Điểm theo người" });
    expect(words(people.textContent)).toContain("150.000 ₫");
    expect(people.textContent).not.toContain("20,00 điểm");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Các dòng điểm (1)" }));
      await Promise.resolve();
    });
    const ledger = screen.getByRole("list", { name: "Các dòng điểm" });
    expect(words(ledger.textContent)).toContain("+150.000 ₫");
    expect(ledger.textContent).not.toContain("điểm");
    expect(document.body.textContent).not.toMatch(/điểm Khoán/i);
  });

  it("someone else's hidden money reads “Khoán”, still never points", () => {
    renderWith(khoanScores(null));
    const people = screen.getByRole("list", { name: "Điểm theo người" });
    expect(people.textContent).toContain("Khoán");
    expect(people.textContent).not.toContain("20,00");
    expect(people.textContent).not.toContain("₫");
  });
});
