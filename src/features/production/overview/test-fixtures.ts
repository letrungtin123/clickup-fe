import type {
  OverviewJob,
  OverviewTask,
  OverviewTaskStage,
  ProductionOverview
} from "@/contracts/production-overview";
import { groupOfStage } from "@/contracts/production-overview";

/**
 * Test fixtures of the Overview V2 (PD-080). Obviously fake ids, codes ("AXP", "BRX", "CQZ") and names — the repository is
 * public: never real project codes or staff names.
 */
export const fid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const TZ = "Asia/Ho_Chi_Minh";
/** 10:00 on Thursday 2026-10-22 in Asia/Ho_Chi_Minh. */
export const NOW_ISO = "2026-10-22T03:00:00.000Z";

export const person = (n: number, name: string) => ({ id: fid(n), displayName: name, email: null, avatarUrl: null });
export const WORKER = person(901, "Nhân Viên Một");
export const WORKER_2 = person(902, "Nhân Viên Hai");
export const CHECKER = person(903, "Kiểm Tra Ba");
export const LEADER = person(904, "Trưởng Nhóm Bốn");

export const projectAxp = { id: fid(2), code: "AXP", name: "Dự án Axon" };
export const projectBrx = { id: fid(3), code: "BRX", name: "Dự án Brix" };
export const projectCqz = { id: fid(4), code: "CQZ", name: "Dự án Coqz" };

const statusFor: Record<OverviewTaskStage, { code: string; name: string; color: "slate" | "blue" | "amber" | "sky" | "green" | "red" | "pink" }> = {
  ASSIGNED: { code: "ASSIGNED", name: "Mới giao", color: "slate" },
  PROCESSING: { code: "PROCESSING", name: "Đang làm", color: "blue" },
  REWORK: { code: "REWORK", name: "Cần sửa lại", color: "red" },
  WAITING_QC: { code: "WAITING_QC", name: "Chờ QC", color: "amber" },
  QC_CHECKING: { code: "QC_CHECKING", name: "Đang check", color: "sky" },
  FEEDBACK: { code: "FEEDBACK", name: "Feedback", color: "pink" },
  CHECKED: { code: "CHECKED", name: "Đã check", color: "green" },
  COMPLETE: { code: "COMPLETE", name: "Complete", color: "green" }
};

let taskSeq = 1000;

export const task = (stage: OverviewTaskStage, extra: Partial<OverviewTask> = {}): OverviewTask => {
  taskSeq += 1;
  const status = statusFor[stage];
  return {
    id: fid(taskSeq),
    code: String(taskSeq),
    process: { id: fid(80), name: "Normal Retouch", isQc: false },
    assignee: WORKER,
    qc: CHECKER,
    status: { id: fid(60 + taskSeq % 10), code: status.code, name: status.name, color: status.color },
    stage,
    group: groupOfStage(stage),
    deadline: "2026-10-22T10:00:00.000Z",
    overdue: false,
    images: 10,
    note: null,
    qcWait: null,
    assigneeOnLeave: false,
    qcOnLeave: false,
    ...extra
  };
};

let jobSeq = 100;

export const job = (extra: Partial<OverviewJob> = {}): OverviewJob => {
  jobSeq += 1;
  const tasks = extra.tasks ?? [];
  const done = tasks.filter((item) => item.group === "DONE" && !item.process.isQc).reduce((sum, item) => sum + (item.images ?? 0), 0);
  const inProgress = tasks.filter((item) => item.group === "IN_PROGRESS" && !item.process.isQc).reduce((sum, item) => sum + (item.images ?? 0), 0);
  return {
    id: fid(jobSeq),
    code: `JOB-${jobSeq}`,
    name: null,
    project: projectAxp,
    leader: LEADER,
    receivedAt: "2026-10-21T01:00:00.000Z",
    deadline: "2026-10-22T16:59:00.000Z",
    createdAt: "2026-10-21T01:00:00.000Z",
    status: { id: fid(70), name: "Đang làm", color: "blue", kind: "IN_PROGRESS" },
    phase: "IN_PROGRESS",
    totalImages: done + inProgress,
    full: true,
    clientLate: false,
    noTasks: false,
    lineCount: tasks.length,
    images: { done, inProgress, unassigned: 0, total: done + inProgress },
    tasksWithoutQty: 0,
    lastActivityAt: "2026-10-22T02:30:00.000Z",
    stale: null,
    risk: null,
    newNotSplit: false,
    owned: true,
    people: [WORKER],
    tasks,
    ...extra
  };
};

export const overviewOf = (jobs: OverviewJob[], extra: Partial<ProductionOverview> = {}): ProductionOverview => ({
  today: "2026-10-22",
  timeZone: TZ,
  generatedAt: NOW_ISO,
  range: { from: "2026-10-22", to: "2026-10-22" },
  scope: "mine",
  viewer: { scopeSwitch: true, defaultScope: "mine", leaderNeeds: true, accountNeeds: false, canAssign: true, riskHistory: false },
  scopeCounts: { mine: jobs.length, all: jobs.length + 3 },
  clock: { coreStart: "09:30", coreEnd: "16:30", alertHours: 2 },
  stageNames: (Object.keys(statusFor) as OverviewTaskStage[]).map((stage) => ({ stage, name: statusFor[stage].name })),
  cards: {
    total: { tasks: 0, images: 0, jobs: jobs.length },
    unassigned: { jobs: 0, images: 0 },
    inProgress: { tasks: 0, images: 0 },
    done: { tasks: 0, images: 0 },
    overdue: { tasks: 0, clientJobs: 0, images: 0 }
  },
  leaderNeeds: { atRisk: 0, unassignedJobs: 0, qcWaitImages: 0, feedbackJobs: 0, readyJobs: 0, staleJobs: 0 },
  accountNeeds: null,
  jobs,
  ...extra
});
