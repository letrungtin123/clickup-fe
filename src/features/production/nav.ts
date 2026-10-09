import {
  Building2,
  CalendarClock,
  Coins,
  Factory,
  FolderKanban,
  GitBranch,
  MailCheck,
  Network,
  Settings2,
  SlidersHorizontal,
  Tags,
  TextCursorInput,
  UsersRound,
  Workflow,
  type LucideIcon
} from "lucide-react";

import type { ProductionRole } from "@/contracts/production-catalog";

import { hasAnyRole } from "./roles";

/**
 * Navigation model for the production module. Later phases append entries (jobs, my tasks, QC
 * queue, scores, dashboards); visibility is the union over the user's roles (SPEC Phase 0 §5).
 */

export type ProductionNavEntry = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: readonly ProductionRole[];
  /** Exact match only (overview vs. its children). */
  end?: boolean;
};

export const productionNavEntries: readonly ProductionNavEntry[] = [
  { to: "/production", label: "Tổng quan", icon: Factory, roles: [], end: true },
  { to: "/production/clients", label: "Khách hàng", icon: Building2, roles: ["ACCOUNT"] },
  { to: "/production/settings", label: "Cấu hình", icon: Settings2, roles: ["ADMIN"] }
];

export const visibleNavEntries = (roles: readonly ProductionRole[]) =>
  roles.length === 0 ? [] : productionNavEntries.filter((entry) => hasAnyRole(roles, entry.roles));

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
    description: "Gán vai trò sản xuất, team, trường tùy chỉnh và tag cho từng người.",
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
    description: "Mã dự án, khách hàng và thời gian dự phòng cho QC.",
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
    description: "Cách tính công của mỗi ca: tính điểm hoặc khoán theo KPI.",
    icon: CalendarClock,
    group: "catalog",
    roles: ["ADMIN"]
  },
  {
    slug: "credit-rules",
    label: "Bảng đơn giá",
    description: "Credit và tiền mỗi tấm theo dự án × quy trình, có lịch sử phiên bản.",
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
    description: "Ngày chốt KPI, minh bạch điểm/tiền, cảnh báo và chat.",
    icon: SlidersHorizontal,
    group: "system",
    roles: ["ADMIN"]
  }
];

export const visibleSettingsPages = (roles: readonly ProductionRole[]) =>
  roles.length === 0 ? [] : settingsPages.filter((page) => hasAnyRole(roles, page.roles));

export const settingsPageBySlug = (slug: string | undefined) =>
  settingsPages.find((page) => page.slug === slug) ?? null;
