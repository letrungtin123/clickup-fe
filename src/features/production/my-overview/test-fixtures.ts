import type { ProductionStatus, ProductionWorkflow } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";
import type {
  MyOverview,
  MyOverviewQcTask,
  MyOverviewTask
} from "@/contracts/production-my-overview";

/**
 * PD-081 test data (tests only): obviously made-up ids, codes and names — the repository is public. "Now" in these
 * fixtures is Thursday 2026-10-22, 16:00 in Asia/Ho_Chi_Minh.
 */
export const TZ = "Asia/Ho_Chi_Minh";
export const NOW = "2026-10-22T09:00:00.000Z";
export const fid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const ME = { id: fid(1), displayName: "Người Thử", email: null, avatarUrl: null };
export const WORKER = { id: fid(2), displayName: "Nhân viên Một", email: null, avatarUrl: null };
export const QC_PERSON = { id: fid(3), displayName: "Kiểm Tra Viên", email: null, avatarUrl: null };

const statusRow = (
  n: number,
  code: string,
  name: string,
  color: ProductionStatus["color"],
  extra: Partial<ProductionStatus> = {}
): ProductionStatus => ({
  id: fid(800 + n),
  code,
  name,
  color,
  sortOrder: n,
  countsDone: code === "DONE",
  countsChecked: code === "CHECKED",
  isTerminal: false,
  isInitial: code === "ASSIGNED",
  setByRoles: [],
  active: true,
  ...extra
});

export const statuses = {
  ASSIGNED: statusRow(1, "ASSIGNED", "Mới giao", "slate"),
  REWORK: statusRow(2, "REWORK", "Cần sửa lại", "red"),
  PROCESSING: statusRow(3, "PROCESSING", "Đang làm", "blue"),
  DONE: statusRow(4, "DONE", "Done", "green"),
  WAITING_QC: statusRow(5, "WAITING_QC", "Chờ QC", "amber"),
  QC_CHECKING: statusRow(6, "QC_CHECKING", "Đang check", "purple"),
  CHECKED: statusRow(7, "CHECKED", "Đã check", "teal"),
  COMPLETE: statusRow(8, "COMPLETE", "Complete", "green")
};
export type Code = keyof typeof statuses;

export const workflowFixture: ProductionWorkflow = {
  statuses: Object.values(statuses),
  transitions: []
};

export const option = (
  code: Code,
  extra: Partial<TaskTransitionOption> = {}
): TaskTransitionOption => ({
  toStatusId: statuses[code].id,
  requiresNote: false,
  asksQty: code === "DONE",
  asksOtHours: false,
  override: false,
  ...extra
});

const ref = (code: Code) => ({
  id: statuses[code].id,
  code,
  name: statuses[code].name,
  color: statuses[code].color
});

export const taskOf = (
  n: number,
  code: Code,
  extra: Partial<ProductionTask> = {}
): ProductionTask => ({
  id: fid(500 + n),
  number: 1300 + n,
  code: String(1300 + n),
  jobId: fid(100),
  jobCode: "Batch 07",
  project: { id: fid(200), code: "AXP", name: "Dự án A" },
  assignee: ME,
  qc: QC_PERSON,
  process: { id: fid(300), name: "Normal Retouch", isQc: false },
  shift: { id: fid(400), name: "Ca chính", payMode: "POINTS", requiresOtHours: false },
  qtyAssigned: 25,
  qtyDone: null,
  errorQty: null,
  otHours: null,
  assignedAt: "2026-10-20T01:00:00.000Z",
  deadline: "2026-10-22T10:00:00.000Z",
  doneAt: null,
  checkedAt: null,
  status: ref(code),
  kind: "NORMAL",
  parentTaskId: null,
  isSubtask: false,
  splitReason: null,
  subtasks: [],
  allocatedQty: 25,
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
  points: null,
  lastQcFail: null,
  createdAt: "2026-10-20T01:00:00.000Z",
  updatedAt: "2026-10-20T01:00:00.000Z",
  capabilities: {
    transitions: [],
    canEdit: false,
    canAssign: false,
    canChangeAssignee: false,
    canEditQty: false,
    canEditQtyAssigned: false,
    canRequestQty: false,
    canDecideQtyRequest: false,
    canCreateSubtask: false,
    canDelete: false
  },
  ...extra
});

export const withMoves = (task: ProductionTask, ...codes: Code[]): ProductionTask => ({
  ...task,
  capabilities: {
    ...task.capabilities,
    transitions: codes.map((code) => option(code, code === "REWORK" ? { requiresNote: true } : {}))
  }
});

export const lineOf = (
  task: ProductionTask,
  extra: Partial<MyOverviewTask> = {}
): MyOverviewTask => ({
  task,
  folderLink: "https://drive.example.test/folder-axp-07",
  finished: false,
  late: false,
  rework: false,
  withQc: false,
  dueSoon: false,
  dueCoreMinutes: null,
  finishedAt: null,
  lastDoneAt: task.doneAt,
  qcWait: null,
  images: { assigned: task.qtyAssigned, done: task.qtyDone },
  ...extra
});

export const qcLineOf = (
  task: ProductionTask,
  extra: Partial<MyOverviewQcTask> = {}
): MyOverviewQcTask => ({
  task,
  folderLink: null,
  waitingSince: "2026-10-22T04:00:00.000Z",
  waitMinutes: 60,
  alert: false,
  checkingSince: null,
  images: task.qtyDone ?? task.qtyAssigned,
  ...extra
});

/** A Staff + QC member's afternoon: one line sent back, one late, two due soon, one with QC, one checked; 3 to check. */
export const sampleLines = () => {
  const rework = lineOf(
    withMoves(
      taskOf(3, "REWORK", {
        deadline: "2026-10-20T11:00:00.000Z",
        doneAt: "2026-10-20T04:00:00.000Z",
        qtyAssigned: 4,
        qcFailCount: 1,
        lastQcFail: {
          note: "Viền nền ảnh 3, 7, 12 chưa sạch — cắt lại.",
          at: "2026-10-21T03:00:00.000Z",
          by: QC_PERSON
        }
      }),
      "PROCESSING"
    ),
    { rework: true, late: true, images: { assigned: 4, done: 4 } }
  );
  const late = lineOf(
    withMoves(
      taskOf(2, "ASSIGNED", { deadline: "2026-10-21T10:00:00.000Z", qtyAssigned: 12 }),
      "PROCESSING"
    ),
    { late: true }
  );
  const doing = lineOf(
    withMoves(taskOf(61, "PROCESSING", { deadline: "2026-10-22T16:00:00.000Z" }), "DONE"),
    {
      dueSoon: true,
      dueCoreMinutes: 30
    }
  );
  const tomorrow = lineOf(
    withMoves(
      taskOf(62, "ASSIGNED", { deadline: "2026-10-23T03:00:00.000Z", qtyAssigned: 12 }),
      "PROCESSING"
    ),
    {
      dueSoon: true,
      dueCoreMinutes: 60
    }
  );
  const waiting = lineOf(
    taskOf(12, "WAITING_QC", {
      deadline: "2026-10-22T15:00:00.000Z",
      doneAt: "2026-10-22T04:05:00.000Z",
      qtyDone: 20,
      qtyAssigned: 20
    }),
    {
      withQc: true,
      lastDoneAt: "2026-10-22T04:05:00.000Z",
      qcWait: { since: "2026-10-22T04:05:00.000Z", minutes: 180 }
    }
  );
  const checked = lineOf(
    taskOf(55, "CHECKED", {
      deadline: "2026-10-22T05:00:00.000Z",
      doneAt: "2026-10-22T02:00:00.000Z",
      qtyDone: 8,
      qtyAssigned: 8
    }),
    {
      finished: true,
      finishedAt: "2026-10-22T03:00:00.000Z"
    }
  );
  return { rework, late, doing, tomorrow, waiting, checked };
};

export const sampleQcLines = () => [
  qcLineOf(
    withMoves(
      taskOf(70, "WAITING_QC", {
        assignee: WORKER,
        qc: ME,
        doneAt: "2026-10-22T04:45:00.000Z",
        qtyDone: 20,
        qtyAssigned: 20
      }),
      "QC_CHECKING",
      "CHECKED",
      "REWORK"
    ),
    {
      waitingSince: "2026-10-22T04:45:00.000Z",
      waitMinutes: 135,
      alert: true,
      images: 20
    }
  ),
  qcLineOf(
    withMoves(
      taskOf(71, "WAITING_QC", {
        assignee: WORKER,
        qc: ME,
        doneAt: "2026-10-22T08:40:00.000Z",
        qtyDone: 12,
        qtyAssigned: 12
      }),
      "QC_CHECKING",
      "CHECKED",
      "REWORK"
    ),
    {
      waitingSince: "2026-10-22T08:40:00.000Z",
      waitMinutes: 20,
      images: 12
    }
  ),
  qcLineOf(
    withMoves(
      taskOf(72, "QC_CHECKING", {
        assignee: WORKER,
        qc: ME,
        doneAt: "2026-10-22T07:00:00.000Z",
        qtyDone: 25
      }),
      "CHECKED",
      "REWORK"
    ),
    {
      waitingSince: "2026-10-22T07:00:00.000Z",
      waitMinutes: 100,
      checkingSince: "2026-10-22T08:50:00.000Z",
      images: 25
    }
  )
];

const count = (lines: readonly MyOverviewTask[]) => ({
  count: lines.length,
  images: lines.reduce(
    (sum, line) => sum + ((line.finished ? line.images.done : line.images.assigned) ?? 0),
    0
  ),
  withoutQty: 0
});

const statusCountsOf = (lines: readonly MyOverviewTask[]) => {
  const map = new Map<
    string,
    { status: MyOverviewTask["task"]["status"]; count: number; order: number }
  >();
  for (const line of lines) {
    const entry = map.get(line.task.status.id) ?? {
      status: line.task.status,
      count: 0,
      order: statuses[line.task.status.code as Code].sortOrder
    };
    entry.count += 1;
    map.set(line.task.status.id, entry);
  }
  return [...map.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ status, count }) => ({ status, count }));
};

/** A whole answer from lines (counts derived the way the API counts them). */
export const overviewOf = (
  lines: readonly MyOverviewTask[],
  options: { qc?: MyOverviewQcTask[] | null; extra?: Partial<MyOverview> } = {}
): MyOverview => {
  const open = lines.filter((line) => !line.finished);
  const done = lines.filter((line) => line.finished);
  const late = lines.filter((line) => line.late);
  const qc = options.qc ?? null;
  const waiting = (qc ?? []).filter((line) => line.task.status.code !== "QC_CHECKING");
  return {
    today: "2026-10-22",
    timeZone: TZ,
    generatedAt: NOW,
    range: { from: "2026-10-22", to: "2026-10-22" },
    viewer: { qc: qc !== null },
    clock: { coreStart: "09:30", coreEnd: "16:30", dueSoonMinutes: 180, qcAlertMinutes: 120 },
    points: {
      today: 26.4,
      week: { from: "2026-10-19", to: "2026-10-22", points: 142.7 },
      period: { period: "2026-10", from: "2026-09-26", to: "2026-10-25", points: 1284 },
      kpi: {
        target: 2600,
        required: true,
        percent: 49.38,
        remaining: 1316,
        workingDaysLeft: 3,
        perDayNeeded: 438.67
      }
    },
    tags: {
      mine: count(lines),
      inProgress: count(open),
      done: count(done),
      late: count(late),
      qc: qc
        ? {
            count: qc.length,
            overAlert: waiting.filter((line) => line.alert).length,
            longestWaitMinutes: waiting.reduce(
              (longest, line) => Math.max(longest, line.waitMinutes),
              0
            )
          }
        : null
    },
    needs: {
      rework: lines.filter((line) => line.rework).length,
      late: late.length,
      dueSoon: lines.filter((line) => line.dueSoon).length,
      qcWaiting: qc ? qc.length : null,
      qcOverAlert: qc ? waiting.filter((line) => line.alert).length : null
    },
    statusCounts: {
      mine: statusCountsOf(lines),
      inProgress: statusCountsOf(open),
      done: statusCountsOf(done),
      late: statusCountsOf(late)
    },
    tasks: [...lines],
    truncated: false,
    qcQueue: qc,
    ...options.extra
  };
};
