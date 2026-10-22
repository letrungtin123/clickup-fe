import type { OverviewJob } from "@/contracts/production-overview";

import { barDetail, jobFlags, matchedLabel, sortFlags, type BarFocus, type FilteredJob, type JobFlag, type ProjectGroup } from "../model";

/** PD-082 — what every row of the job table / phone cards needs to know (kept apart from the components). */
export type TableView = {
  taskMode: boolean;
  focus: BarFocus;
  now: Date;
  timeZone: string;
  alertHours: number;
  /** "Trễ" selected: the matched chip is about lateness. */
  clientFilter: boolean;
  canAssign: boolean;
  collapsed: ReadonlySet<string>;
  toggle: (projectId: string) => void;
  onAssign: (group: ProjectGroup) => void;
};

/** The flags of a job row: its own, or — listing lines — the matched lines (and "Trễ khách" under the Trễ filter). */
export const rowFlags = (
  { job, tasks }: FilteredJob,
  view: Pick<TableView, "taskMode" | "focus" | "clientFilter" | "alertHours">
): JobFlag[] =>
  view.taskMode
    ? sortFlags([
        { key: "matched", label: matchedLabel(tasks), tone: view.focus === "done" ? "success" : view.clientFilter ? "danger" : "info" },
        ...(view.clientFilter && job.clientLate ? [{ key: "clientLate", label: "Trễ khách", tone: "danger" as const }] : [])
      ])
    : jobFlags(job, view.alertHours);

/** "xong 20 · đang làm 9 · chưa chia 10 · 3 task chưa có SL", or why there is no bar. */
export const jobBarDetail = (job: Pick<OverviewJob, "images" | "tasksWithoutQty">) =>
  [barDetail(job.images), job.tasksWithoutQty > 0 ? `${job.tasksWithoutQty} task chưa có SL` : null].filter(Boolean).join(" · ") ||
  "Chưa có số tấm";
