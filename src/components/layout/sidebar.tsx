import { cn } from "cn";
import {
  ChevronRight,
  House,
  Inbox,
  Library,
  ListTodo,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Trash2,
  WifiOff,
  type LucideIcon
} from "lucide-react";
import { type ReactNode } from "react";
import { Link, NavLink, useMatch } from "react-router";

import { ProjectIcon } from "@/components/shared/project-icon";
import { Shortcut } from "@/components/shared/shortcut";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { P } from "@/features/auth/permissions";
import { usePermissions, useSessionContext } from "@/features/auth/hooks";
import {
  ChannelsSection,
  ChannelsSectionAction,
  DirectMessagesSection,
  DirectMessagesSectionAction
} from "@/features/chat/components/sidebar-sections";
import { ChatNavBadge } from "@/features/chat/components/chat-nav-badge";
import { KnowledgeSidebarSection } from "@/features/knowledge/components/sidebar-section";
import { useKnowledgePermissions } from "@/features/knowledge/hooks";
import { canCreateSpace, canSeeKnowledge } from "@/features/knowledge/model/access";
import { InboxNavBadge } from "@/features/notifications/components/inbox-badge";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { useProductionNavEntries } from "@/features/production/hooks";
import { ProjectTree } from "@/features/projects/components/project-tree";
import { useProjects } from "@/features/projects/hooks";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useRealtimeStatus } from "@/lib/realtime/hooks";
import { useUiStore } from "@/stores/ui-store";

import {
  productionSectionDefaultOpen,
  useSidebarSection,
  type SidebarSectionId
} from "./sidebar-sections";
import { UserMenu } from "./user-menu";

type NavEntry = { to: string; label: string; icon: LucideIcon; end?: boolean };

const primaryNav: NavEntry[] = [
  { to: "/", label: "Trang chủ", icon: House, end: true },
  { to: "/my-tasks", label: "Việc của tôi", icon: ListTodo },
  { to: "/inbox", label: "Hộp thư", icon: Inbox }
];

const navItemClass = (active: boolean) =>
  cn(
    "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-foreground/85 outline-none transition-colors duration-150 pointer-coarse:h-10",
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
  const setNewSpaceOpen = useUiStore((state) => state.setNewSpaceOpen);
  const knowledge = useKnowledgePermissions();
  const productionNav = useProductionNavEntries();
  const productionDefaultOpen = useProductionSectionDefault();
  // Phones reach the bell from the top bar; the drawer keeps "Hộp thư".
  const showBell = useBreakpoint() !== "mobile";

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-canvas">
      <div className="flex items-center gap-1 px-2 pt-2 pb-1.5">
        <UserMenu onNavigate={onNavigate} />
        {showBell ? <NotificationBell placement="sidebar" /> : null}
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
                {entry.to === "/inbox" ? <InboxNavBadge /> : null}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Production (retouch) module: only for users holding a production role (PD-011). */}
        {productionNav.length > 0 ? (
          <SidebarSection id="production" title="Sản xuất" defaultOpen={productionDefaultOpen}>
            <ul className="flex flex-col gap-px px-2">
              {productionNav.map((entry) => (
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
          </SidebarSection>
        ) : null}

        <SidebarSection
          id="projects"
          title="Dự án"
          action={
            can(P.ProjectCreate) ? (
              <SectionActionButton label="Tạo dự án" onClick={() => setNewProjectOpen(true)} />
            ) : null
          }
        >
          <ProjectTree onNavigate={onNavigate} />
        </SidebarSection>

        {/* Knowledge base (PD-031): only with knowledge.view; "Tạo kho" with knowledge.create. */}
        {canSeeKnowledge(knowledge) ? (
          <SidebarSection
            id="knowledge"
            title="Tri thức"
            action={
              canCreateSpace(knowledge) ? (
                <SectionActionButton label="Tạo kho" onClick={() => setNewSpaceOpen(true)} />
              ) : null
            }
          >
            <KnowledgeSidebarSection onNavigate={onNavigate} />
          </SidebarSection>
        ) : null}

        <SidebarSection id="channels" title="Kênh" action={<ChannelsSectionAction />}>
          <ChannelsSection />
        </SidebarSection>

        <SidebarSection
          id="dms"
          title="Tin nhắn trực tiếp"
          action={<DirectMessagesSectionAction />}
        >
          <DirectMessagesSection />
        </SidebarSection>
      </nav>

      <div className="flex flex-col gap-px border-t px-2 py-2">
        <RealtimeIndicator />
        {/* A fixed way back to deleted tasks, next to the settings (P7). */}
        <NavLink
          to="/trash"
          onClick={() => onNavigate?.()}
          className={({ isActive }) => navItemClass(isActive)}
        >
          <Trash2 aria-hidden="true" />
          Thùng rác
        </NavLink>
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

/** Default for the "Sản xuất" section: open for people holding an explicit production role. */
const useProductionSectionDefault = () =>
  productionSectionDefaultOpen(useSessionContext().productionRoles);

const SidebarSection = ({
  id,
  title,
  action,
  defaultOpen = true,
  children
}: {
  id: SidebarSectionId;
  title: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) => {
  const userId = useSessionContext().user.id;
  // Remembered per user on this device (P2).
  const [open, setOpen] = useSidebarSection(userId, id, defaultOpen);
  return (
    <section className="mt-4" aria-label={title}>
      <div className="group/section flex h-7 items-center gap-1 px-2 pointer-coarse:h-8">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-6 flex-1 items-center gap-1 rounded-md px-2 text-left text-[11px] font-semibold tracking-[0.06em] text-foreground-subtle uppercase outline-none pointer-coarse:h-8 hover:text-foreground-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          {title}
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-3 opacity-0 transition-[transform,opacity] duration-150 group-hover/section:opacity-100 pointer-coarse:opacity-100",
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
          className="flex size-6 items-center justify-center rounded-md text-foreground-muted outline-none pointer-coarse:size-8 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent [&_svg]:size-3.5"
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
    "flex size-9 items-center justify-center rounded-lg text-foreground-muted outline-none transition-colors duration-150 pointer-coarse:size-10 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px]",
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
          className={({ isActive }) => cn(railItemClass(isActive), "relative")}
        />
      }
    >
      <entry.icon aria-hidden="true" />
      {entry.to === "/inbox" ? <InboxNavBadge variant="dot" /> : null}
      {entry.to === "/c" ? <ChatNavBadge /> : null}
    </TooltipTrigger>
    <TooltipContent side="right">{entry.label}</TooltipContent>
  </Tooltip>
);

const SidebarRail = ({ onToggle }: Pick<SidebarProps, "onToggle">) => {
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const projects = useProjects();
  const projectMatch = useMatch("/p/:projectId/*");
  const productionNav = useProductionNavEntries();
  const knowledge = useKnowledgePermissions();
  const userId = useSessionContext().user.id;
  const [productionOpen] = useSidebarSection(userId, "production", useProductionSectionDefault());
  // A collapsed "Sản xuất" section leaves one icon (the overview) on the rail.
  const productionOverview = productionNav[0];
  const railProduction = productionOpen
    ? productionNav
    : productionOverview
      ? [{ ...productionOverview, label: "Sản xuất", end: false }]
      : [];

  return (
    <div className="flex h-full w-full flex-col items-center gap-1 bg-canvas py-2">
      <UserMenu compact />
      <NotificationBell placement="rail" />
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
        {/* Chat lives in sidebar sections on the full sidebar; the rail links to all conversations. */}
        <RailLink entry={{ to: "/c", label: "Tin nhắn", icon: MessagesSquare }} />
        {canSeeKnowledge(knowledge) ? (
          <RailLink entry={{ to: "/k", label: "Tri thức", icon: Library }} />
        ) : null}
        {railProduction.length > 0 ? (
          <>
            <Separator className="my-1 w-6" />
            {railProduction.map((entry) => (
              <RailLink key={entry.to} entry={entry} />
            ))}
          </>
        ) : null}
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
        <RailLink entry={{ to: "/trash", label: "Thùng rác", icon: Trash2 }} />
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
