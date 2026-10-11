import {
  ReportConfigSchema,
  type ReportConfig,
  type ReportConfigInput
} from "@/contracts/production-reports";

import type { FieldCatalog } from "./dimensions";

/**
 * "Mẫu báo cáo": ready-made builder configs for the questions asked most (PLAN §10 "báo cáo tổng giờ OT
 * theo NV theo tháng", §7 FB rate by client, team points per week, "Năng lực" A++/A/B). Picking one fills
 * the builder; the user can then change, save or export it. Ranges are computed from `today` so the
 * template always shows recent data. Pure — unit tested in templates.test.ts.
 */

export type ReportTemplate = {
  id: string;
  name: string;
  description: string;
  /** Uses Admin data (members' custom fields): offered to ADMIN only. */
  adminOnly: boolean;
  /** null = not available here (e.g. the custom field does not exist). */
  build: (context: { today: string; catalog: FieldCatalog }) => ReportConfig | null;
};

const pad = (value: number) => String(value).padStart(2, "0");

const shiftDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** First day of the month `months` before the one containing `day`. */
export const monthStart = (day: string, monthsBack = 0) => {
  const [year, month] = day.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 - monthsBack, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`;
};

/** Monday of the week `weeksBack` weeks before the one containing `day` (weeks start on Monday). */
export const weekStart = (day: string, weeksBack = 0) => {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftDays(day, -((weekday + 6) % 7) - weeksBack * 7);
};

const parse = (input: ReportConfigInput) => ReportConfigSchema.parse(input);

/** The "Năng lực" member field of PLAN §10 (seeded as a USER SELECT field). */
export const skillFieldId = "cf_user:nang_luc";

export const reportTemplates: readonly ReportTemplate[] = [
  {
    id: "ot-hours-by-user-month",
    name: "Giờ OT theo nhân viên theo tháng",
    description: "Tổng giờ OT của từng người, mỗi tháng một cột (6 tháng gần nhất).",
    adminOnly: false,
    build: ({ today }) =>
      parse({
        dimensions: ["user", "month"],
        measures: ["ot_hours"],
        from: monthStart(today, 5),
        to: today,
        taskDate: "DONE",
        view: { type: "PIVOT", rows: ["user"], columns: ["month"] }
      })
  },
  {
    id: "team-points-weekly",
    name: "Điểm theo team từng tuần",
    description: "Điểm ca tính điểm của mỗi team theo tuần, 8 tuần gần nhất.",
    adminOnly: false,
    build: ({ today }) =>
      parse({
        dimensions: ["week", "team"],
        measures: ["points"],
        from: weekStart(today, 7),
        to: today,
        view: { type: "LINE", rows: ["week"], columns: ["team"] }
      })
  },
  {
    id: "fb-rate-by-client",
    name: "Tỉ lệ FB theo khách hàng",
    description: "Task FB sai trên số task đã xong của mỗi khách hàng, tháng này.",
    adminOnly: false,
    build: () =>
      parse({
        dimensions: ["client"],
        measures: ["fb_rate", "fb_wrong_count", "task_count"],
        preset: "THIS_MONTH",
        taskDate: "DONE",
        sort: { key: "fb_rate", direction: "desc" },
        view: { type: "BAR", rows: ["client"], columns: [] }
      })
  },
  {
    id: "points-by-skill",
    name: "Điểm theo Năng lực",
    description: "Điểm và số tấm của nhóm A++, A, B trong kỳ KPI này.",
    adminOnly: true,
    build: ({ catalog }) =>
      catalog.has(skillFieldId)
        ? parse({
            dimensions: [skillFieldId],
            measures: ["points", "qty_done"],
            preset: "THIS_PERIOD",
            view: { type: "BAR", rows: [skillFieldId], columns: [] }
          })
        : null
  }
];

/** Templates the role can open, with their config for today. */
export const availableTemplates = (context: {
  today: string;
  isAdmin: boolean;
  catalog: FieldCatalog;
}) =>
  reportTemplates.flatMap((template) => {
    if (template.adminOnly && !context.isAdmin) return [];
    const config = template.build(context);
    return config ? [{ template, config }] : [];
  });
