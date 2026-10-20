import {
  Briefcase,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ChartColumnBig,
  CircleDot,
  ClipboardList,
  Coins,
  Factory,
  FolderKanban,
  Gauge,
  GitBranch,
  LayoutDashboard,
  MailCheck,
  Network,
  ScanSearch,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  Target,
  TextCursorInput,
  UsersRound,
  Workflow,
  type LucideIcon
} from "lucide-react";

import type {
  FeaturePermissionKey,
  JobPermissionScope,
  ProductionRole
} from "@/contracts/production-catalog";

import { fallbackFeatures } from "./feature-permissions";
import { hasAnyRole } from "./roles";

/**
 * Navigation model for the production module. Later phases append entries (jobs, my tasks, QC
 * queue, scores, dashboards); visibility is the union over the user's roles (SPEC Phase 0 §5).
 */

export type ProductionNavEntry = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Who sees it when neither `feature` nor `byJobView` decides; [] = every production member (ADMIN always). */
  roles: readonly ProductionRole[];
  /**
   * PD-065: shown to whoever holds this feature (`/production/me` features, "Quyền theo tính năng") instead of the
   * roles; until the caller's features are known, the default matrix of their roles decides.
   */
  feature?: FeaturePermissionKey;
  /** Exact match only (overview vs. its children). */
  end?: boolean;
  /**
   * Shown by the job permission matrix (PD-036) instead of the roles: whoever may view jobs ("own" or "all") sees it.
   * The roles still apply when the caller's scope is not known yet.
   */
  byJobView?: boolean;
};

/**
 * The "Báo cáo" module is hidden from the UI (owner, 2026-10-16): no menu entry and no buttons leading to it (Bất
 * thường, Quản trị số liệu). Set to true — and restore its menu entry below — to bring it back.
 */
export const REPORTS_MODULE_VISIBLE = false;

export const productionNavEntries: readonly ProductionNavEntry[] = [
  { to: "/production", label: "Tổng quan", icon: Factory, roles: [], end: true },
  {
    to: "/production/dashboard",
    label: "Bảng điều khiển",
    icon: LayoutDashboard,
    roles: [],
    feature: "leader_dashboard"
  },
  {
    to: "/production/admin",
    label: "Quản trị số liệu",
    icon: Gauge,
    roles: [],
    feature: "admin_dashboard"
  },
  {
    to: "/production/jobs",
    label: "Job",
    icon: Briefcase,
    roles: ["ACCOUNT", "LEADER"],
    byJobView: true
  },
  {
    to: "/production/my-tasks",
    label: "Việc của tôi",
    icon: ClipboardList,
    roles: ["STAFF", "QC", "LEADER"]
  },
  { to: "/production/qc", label: "Hàng chờ QC", icon: ShieldCheck, roles: [], feature: "qc_queue" },
  // Everyone's points are the "Toàn đội" tab of Bảng điểm (PD-069; the old ranking /production/scores/board redirects).
  { to: "/production/scores", label: "Bảng điểm", icon: ChartColumnBig, roles: [], end: true },
  { to: "/production/leave", label: "Lịch nghỉ", icon: CalendarDays, roles: [] },
  // "Báo cáo" is hidden for now (owner, 2026-10-16: hard to use, not needed yet; see REPORTS_MODULE_VISIBLE). The route
  // /production/reports still works by URL; restore this entry to bring the menu item back:
  // { to: "/production/reports", label: "Báo cáo", icon: ChartNoAxesCombined, roles: ["LEADER"] },
  {
    to: "/production/anomalies",
    label: "Bất thường",
    icon: ScanSearch,
    roles: [],
    feature: "anomalies"
  },
  {
    to: "/production/clients",
    label: "Khách hàng",
    icon: Building2,
    roles: [],
    feature: "clients"
  },
  // Every role reaches "Trạng thái & luồng chuyển" read-only (PD-049); other pages keep their roles.
  { to: "/production/settings", label: "Cấu hình", icon: Settings2, roles: [] }
];

/**
 * Entries for the user's roles and features. Feature entries (PD-065: Hàng chờ QC, Bảng điều khiển, Quản trị số liệu,
 * Bất thường, Khách hàng) follow `features` — the caller's list from `/production/me`; while it is unknown,
 * the default matrix of their roles. "Job" follows the job view scope once known (PD-036).
 */
export const visibleNavEntries = (
  roles: readonly ProductionRole[],
  options: {
    jobView?: JobPermissionScope | undefined;
    features?: readonly FeaturePermissionKey[] | undefined;
  } = {}
) => {
  if (roles.length === 0) return [];
  const features = new Set(options.features ?? fallbackFeatures(roles));
  return productionNavEntries.filter((entry) =>
    entry.feature
      ? features.has(entry.feature)
      : entry.byJobView && options.jobView !== undefined
        ? options.jobView !== "none"
        : hasAnyRole(roles, entry.roles)
  );
};

export type SettingsGroup = "people" | "catalog" | "workflow" | "system";

export const settingsGroupLabels: Record<SettingsGroup, string> = {
  people: "Con người",
  catalog: "Danh mục",
  workflow: "Luồng & dữ liệu",
  system: "Hệ thống"
};

export type SettingsPage = {
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: SettingsGroup;
  /** Who may open the page (ADMIN always). */
  roles: readonly ProductionRole[];
};

export const settingsPages: readonly SettingsPage[] = [
  {
    slug: "members",
    label: "Thành viên & vai trò",
    description: "Gán vai trò Photo Retouch, team, trường tùy chỉnh và tag cho từng người.",
    icon: UsersRound,
    group: "people",
    roles: ["ADMIN"]
  },
  {
    slug: "teams",
    label: "Team",
    description: "Nhãn nhóm dùng cho báo cáo. Không giới hạn ai giao việc cho ai.",
    icon: Network,
    group: "people",
    roles: ["ADMIN"]
  },
  {
    slug: "whitelist",
    label: "Whitelist email",
    description: "Email được phép đăng nhập lần đầu.",
    icon: MailCheck,
    group: "people",
    roles: ["ADMIN"]
  },
  {
    slug: "clients",
    label: "Khách hàng",
    description: "Khách hàng đặt job, kèm trường tùy chỉnh và tag.",
    icon: Building2,
    group: "catalog",
    roles: ["ADMIN", "ACCOUNT"]
  },
  {
    slug: "projects",
    label: "Dự án",
    description: "Mã dự án, tên và mô tả.",
    icon: FolderKanban,
    group: "catalog",
    roles: ["ADMIN"]
  },
  {
    slug: "processes",
    label: "Quy trình",
    description: "Loại công việc retouch dùng chung cho mọi dự án; một quy trình là QC.",
    icon: Workflow,
    group: "catalog",
    roles: ["ADMIN"]
  },
  {
    slug: "shifts",
    label: "Ca làm",
    description: "Cách tính công của mỗi ca: tính điểm hoặc khoán (có tiền).",
    icon: CalendarClock,
    group: "catalog",
    roles: ["ADMIN"]
  },
  {
    slug: "credit-rules",
    label: "Bảng đơn giá",
    description: "Điểm và tiền mỗi tấm theo dự án × quy trình, có lịch sử phiên bản.",
    icon: Coins,
    group: "catalog",
    roles: ["ADMIN"]
  },
  {
    slug: "workflow",
    label: "Trạng thái & luồng chuyển",
    description: "Trạng thái task, cờ ghi điểm và ai được chuyển giữa các trạng thái.",
    icon: GitBranch,
    group: "workflow",
    // PD-049: everyone reads it; only the organization superadmin edits it (the API refuses the others).
    roles: []
  },
  {
    slug: "job-statuses",
    label: "Trạng thái job",
    description:
      "Trạng thái người đặt cho job (như ClickUp): tên, màu, thứ tự, trạng thái đóng và trạng thái cần mọi task đã check.",
    icon: CircleDot,
    group: "workflow",
    roles: ["ADMIN"]
  },
  {
    slug: "custom-fields",
    label: "Trường tùy chỉnh",
    description: "Trường riêng cho Job, Task, Thành viên và Khách hàng.",
    icon: TextCursorInput,
    group: "workflow",
    roles: ["ADMIN"]
  },
  {
    slug: "tags",
    label: "Tag",
    description: "Nhãn tự do gắn lên bản ghi, dùng để lọc báo cáo.",
    icon: Tags,
    group: "workflow",
    roles: ["ADMIN"]
  },
  {
    slug: "general",
    label: "Cài đặt chung",
    description: "Ngày chốt KPI, KPI mặc định, nghỉ phép trừ KPI, cảnh báo và chat.",
    icon: SlidersHorizontal,
    group: "system",
    roles: ["ADMIN"]
  },
  {
    slug: "kpi",
    label: "KPI nhân viên",
    description: "Chỉ tiêu điểm theo tháng, quý, năm cho từng người, có lịch sử hiệu lực.",
    icon: Target,
    group: "people",
    roles: ["ADMIN"]
  },
  {
    slug: "kpi-settlement",
    label: "Chốt KPI & báo cáo",
    description: "Chạy chốt KPI theo kỳ, lịch sử các lần chạy và báo cáo % đạt.",
    icon: CalendarCheck2,
    group: "system",
    roles: ["ADMIN"]
  }
];

export const visibleSettingsPages = (roles: readonly ProductionRole[]) =>
  roles.length === 0 ? [] : settingsPages.filter((page) => hasAnyRole(roles, page.roles));

export const settingsPageBySlug = (slug: string | undefined) =>
  settingsPages.find((page) => page.slug === slug) ?? null;
