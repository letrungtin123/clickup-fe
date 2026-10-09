import { cn } from "cn";
import {
  ChevronRight,
  House,
  Inbox,
  ListTodo,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  WifiOff,
  type LucideIcon
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink, useMatch } from "react-router";

import { ProjectIcon } from "@/components/shared/project-icon";
import { Shortcut } from "@/components/shared/shortcut";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { P } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks";
import {
  ChannelsSection,
  DirectMessagesSection
} from "@/features/chat/components/sidebar-sections";
import { ProjectTree } from "@/features/projects/components/project-tree";
import { useProjects } from "@/features/projects/hooks";
import { useRealtimeStatus } from "@/lib/realtime/hooks";
import { useUiStore } from "@/stores/ui-store";

import { UserMenu } from "./user-menu";

type NavEntry = { to: string; label: string; icon: LucideIcon; end?: boolean };

const primaryNav: NavEntry[] = [
  { to: "/", label: "Trang chủ", icon: House, end: true },
  { to: "/my-tasks", label: "Việc của tôi", icon: ListTodo },
  { to: "/inbox", label: "Hộp thư", icon: Inbox }
];

const navItemClass = (active: boolean) =>
  cn(
    "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-foreground/85 outline-none transition-colors duration-150",
    "hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-4 [&_svg]:shrink-0",
    active && "bg-brand-soft font-medium text-brand-text hover:bg-brand-soft hover:text-brand-text"
  );

type SidebarProps = {
  /** "full" = labelled navigation; "rail" = icon-only (tablet / collapsed desktop). */
  variant: "full" | "rail";
  /** Called after any navigation (closes overlays on tablet/mobile). */
  onNavigate?: (() => void) | undefined;
  /** Collapse (full) or expand (rail) control; omitted on mobile. */
  onToggle?: (() => void) | undefined;
};

export const Sidebar = ({ variant, onNavigate, onToggle }: SidebarProps) =>
  variant === "rail" ? (
    <SidebarRail onToggle={onToggle} />
  ) : (
    <SidebarFull onNavigate={onNavigate} onToggle={onToggle} />
  );

// --- Full -------------------------------------------------------------------------------------------

const SidebarFull = ({ onNavigate, onToggle }: Pick<SidebarProps, "onNavigate" | "onToggle">) => {
  const { can } = usePermissions();
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const setNewProjectOpen = useUiStore((state) => state.setNewProjectOpen);

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-canvas">
      <div className="flex items-center gap-1 px-2 pt-2 pb-1.5">
        <UserMenu onNavigate={onNavigate} />
        {onToggle ? (
          <IconTooltipButton label="Thu gọn thanh bên" onClick={onToggle}>
            <PanelLeftClose />
          </IconTooltipButton>
        ) : null}
      </div>

      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2 text-[13px] text-foreground-subtle shadow-xs transition-colors duration-150 outline-none hover:border-border-strong hover:text-foreground-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-3.5" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-left">Tìm kiếm…</span>
          <Shortcut keys={["mod", "K"]} />
        </button>
      </div>

      <nav
        aria-label="Điều hướng chính"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4"
      >
        <ul className="flex flex-col gap-px px-2">
          {primaryNav.map((entry) => (
            <li key={entry.to}>
              <NavLink
                to={entry.to}
                end={entry.end ?? false}
                onClick={() => onNavigate?.()}
                className={({ isActive }) => navItemClass(isActive)}
              >
                <entry.icon aria-hidden="true" />
                {entry.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <SidebarSection
          title="Dự án"
          action={
            can(P.ProjectCreate) ? (
              <SectionActionButton label="Tạo dự án" onClick={() => setNewProjectOpen(true)} />
            ) : null
          }
        >
          <ProjectTree onNavigate={onNavigate} />
        </SidebarSection>

        <SidebarSection
          title="Kênh"
          action={<SectionActionButton label="Tạo kênh (sắp ra mắt)" disabled />}
        >
          <ChannelsSection />
        </SidebarSection>

        <SidebarSection
          title="Tin nhắn trực tiếp"
          action={<SectionActionButton label="Tin nhắn mới (sắp ra mắt)" disabled />}
        >
          <DirectMessagesSection />
        </SidebarSection>
      </nav>

      <div className="flex flex-col gap-1 border-t px-2 py-2">
        <RealtimeIndicator />
        <NavLink
          to="/settings"
          onClick={() => onNavigate?.()}
          className={({ isActive }) => navItemClass(isActive)}
        >
          <Settings aria-hidden="true" />
          Cài đặt
        </NavLink>
      </div>
    </div>
  );
};

const SidebarSection = ({
  title,
  action,
  children
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(true);
  return (
    <section className="mt-4" aria-label={title}>
      <div className="group/section flex h-7 items-center gap-1 px-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex h-6 flex-1 items-center gap-1 rounded-md px-2 text-left text-[11px] font-semibold tracking-[0.06em] text-foreground-subtle uppercase outline-none hover:text-foreground-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          {title}
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-3 opacity-0 transition-[transform,opacity] duration-150 group-hover/section:opacity-100",
              open && "rotate-90"
            )}
          />
        </button>
        {action}
      </div>
      {open ? <div className="pt-0.5">{children}</div> : null}
    </section>
  );
};

const SectionActionButton = ({
  label,
  onClick,
  disabled
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="flex size-6 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent [&_svg]:size-3.5"
        />
      }
    >
      <Plus />
    </TooltipTrigger>
    <TooltipContent side="right">{label}</TooltipContent>
  </Tooltip>
);

const IconTooltipButton = ({
  label,
  onClick,
  children,
  side = "bottom"
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  side?: "bottom" | "right";
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-foreground-muted outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
        />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent side={side}>{label}</TooltipContent>
  </Tooltip>
);

const RealtimeIndicator = () => {
  const status = useRealtimeStatus();
  if (status !== "reconnecting" && status !== "offline") {
    return null;
  }
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-md bg-warning-soft px-2 py-1.5 text-xs text-foreground-muted"
    >
      <WifiOff className="size-3.5 text-warning" aria-hidden="true" />
      {status === "offline" ? "Mất kết nối thời gian thực" : "Đang kết nối lại…"}
    </p>
  );
};

// --- Rail -------------------------------------------------------------------------------------------

const railItemClass = (active: boolean) =>
  cn(
    "flex size-9 items-center justify-center rounded-lg text-foreground-muted outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px]",
    active && "bg-brand-soft text-brand-text hover:bg-brand-soft hover:text-brand-text"
  );

const RailLink = ({ entry }: { entry: NavEntry }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <NavLink
          to={entry.to}
          end={entry.end ?? false}
          aria-label={entry.label}
          className={({ isActive }) => railItemClass(isActive)}
        />
      }
    >
      <entry.icon aria-hidden="true" />
    </TooltipTrigger>
    <TooltipContent side="right">{entry.label}</TooltipContent>
  </Tooltip>
);

const SidebarRail = ({ onToggle }: Pick<SidebarProps, "onToggle">) => {
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const projects = useProjects();
  const projectMatch = useMatch("/p/:projectId/*");

  return (
    <div className="flex h-full w-full flex-col items-center gap-1 bg-canvas py-2">
      <UserMenu compact />
      <nav
        aria-label="Điều hướng chính"
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-1"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Tìm kiếm"
                onClick={() => setCommandOpen(true)}
                className={railItemClass(false)}
              />
            }
          >
            <Search aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="right">
            Tìm kiếm <Shortcut keys={["mod", "K"]} />
          </TooltipContent>
        </Tooltip>
        {primaryNav.map((entry) => (
          <RailLink key={entry.to} entry={entry} />
        ))}
        <Separator className="my-1 w-6" />
        <ul
          aria-label="Dự án"
          className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto scrollbar-none"
        >
          {(projects.data?.items ?? []).map((project) => {
            const firstList = project.lists[0];
            const active = projectMatch?.params.projectId === project.id;
            return (
              <li key={project.id}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Link
                        to={
                          firstList
                            ? `/p/${project.id}/l/${firstList.id}`
                            : `/p/${project.id}/settings`
                        }
                        aria-label={project.name}
                        aria-current={active ? "page" : undefined}
                        className={railItemClass(active)}
                      />
                    }
                  >
                    <ProjectIcon
                      color={project.color}
                      icon={project.icon}
                      name={project.name}
                      size="sm"
                    />
                  </TooltipTrigger>
                  <TooltipContent side="right">{project.name}</TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
        <RailLink entry={{ to: "/settings", label: "Cài đặt", icon: Settings }} />
        {onToggle ? (
          <IconTooltipButton label="Mở rộng thanh bên" onClick={onToggle} side="right">
            <PanelLeftOpen />
          </IconTooltipButton>
        ) : null}
      </nav>
    </div>
  );
};
