import { cn } from "cn";
import {
  Archive,
  BookOpenText,
  History,
  Library,
  Lock,
  Settings2,
  Trash2,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "@/components/shared/router-link";

import { PageHeader } from "@/components/shared/page-header";
import { ProjectIcon } from "@/components/shared/project-icon";
import type { KnowledgeSpaceDetail } from "@/contracts/knowledge";

import type { SpaceUi } from "../model/access";

type Tab = { to: string; label: string; icon: LucideIcon; end?: boolean };

/** Space-level navigation: Mục · Nhật ký · Thùng rác · Cài đặt (each only when allowed). */
const spaceTabs = (space: Pick<KnowledgeSpaceDetail, "id">, ui: SpaceUi): Tab[] => [
  { to: `/k/${space.id}`, label: "Mục", icon: BookOpenText, end: true },
  ...(ui.canViewAudit ? [{ to: `/k/${space.id}/audit`, label: "Nhật ký", icon: History }] : []),
  ...(ui.canViewTrash ? [{ to: `/k/${space.id}/trash`, label: "Thùng rác", icon: Trash2 }] : []),
  // Managers edit; everyone else sees the space information and its members read-only.
  {
    to: `/k/${space.id}/settings`,
    label: ui.canManage ? "Cài đặt" : "Thông tin kho",
    icon: Settings2
  }
];

export const SpaceHeader = ({
  space,
  ui,
  title,
  description,
  actions,
  children
}: {
  space: KnowledgeSpaceDetail;
  ui: SpaceUi;
  /** Sub-page title ("Nhật ký kho"); defaults to the space name. */
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) => {
  const tabs = spaceTabs(space, ui);
  return (
    <PageHeader
      className="gap-2.5 pb-0"
      eyebrow={
        <nav aria-label="Đường dẫn" className="flex min-w-0 items-center gap-1">
          {/* Touch: a 40 px tall hit area (negative margin) without moving the line. */}
          <Link
            to="/k"
            className="inline-flex shrink-0 items-center gap-1 rounded outline-none pointer-coarse:-my-3 pointer-coarse:py-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Library className="size-3" aria-hidden="true" />
            Tri thức
          </Link>
          {title ? (
            <>
              <span aria-hidden="true">/</span>
              <Link
                to={`/k/${space.id}`}
                className="truncate rounded outline-none pointer-coarse:-my-3 pointer-coarse:py-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {space.name}
              </Link>
            </>
          ) : null}
        </nav>
      }
      leading={<ProjectIcon color={space.color} icon={space.icon} name={space.name} size="md" />}
      title={
        <span className="inline-flex max-w-full min-w-0 items-center gap-2">
          <span className="truncate">{title ?? space.name}</span>
          {!title && space.visibility === "private" ? (
            <Lock className="size-3.5 shrink-0 text-foreground-subtle" aria-label="Kho riêng tư" />
          ) : null}
          {space.archivedAt ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground-muted">
              <Archive className="size-3" aria-hidden="true" />
              Đã lưu trữ
            </span>
          ) : null}
        </span>
      }
      description={description ?? (title ? undefined : space.description)}
      actions={actions}
    >
      {children}
      <nav
        aria-label="Mục của kho"
        className="-mx-4 flex scrollbar-none items-center gap-1 overflow-x-auto px-4 md:-mx-6 md:px-6"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end ?? false}
            className={({ isActive }) =>
              cn(
                "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-t-md px-2.5 text-[13px] font-medium text-foreground-muted outline-none transition-colors pointer-coarse:h-11 max-sm:px-2 max-sm:[&_svg]:hidden",
                "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-3.5",
                "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent",
                isActive && "text-foreground after:bg-brand"
              )
            }
          >
            <tab.icon aria-hidden="true" />
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </PageHeader>
  );
};
