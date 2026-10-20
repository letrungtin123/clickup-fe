import { cn } from "cn";
import { Menu, MessagesSquare, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, useEffect } from "react";
import { Outlet, useLocation, useMatch } from "react-router";
import { Link } from "@/components/shared/router-link";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSessionContext } from "@/features/auth/hooks";
import { ChatNavBadge } from "@/features/chat/components/chat-nav-badge";
import { useChatUnreadLabel } from "@/features/chat/hooks/use-chat-unread-label";
import { CommandPalette } from "@/features/command/command-palette";
import { DepartmentGuard } from "@/features/departments/components/department-guard";
import { DepartmentSwitcher } from "@/features/departments/components/department-switcher";
import { useDepartment, useDepartmentFade } from "@/features/departments/hooks";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { NewSpaceDialog } from "@/features/knowledge/components/new-space-dialog";
import { useKnowledgePermissions } from "@/features/knowledge/hooks";
import { useKnowledgeSidebarSync } from "@/features/knowledge/realtime";
import { NewProjectDialog } from "@/features/projects/components/new-project-dialog";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useUiStore } from "@/stores/ui-store";

import { DetailPanel } from "./detail-panel";
import { RouteFallback } from "./route-fallback";
import { RouteProgress } from "./route-progress";
import { Sidebar } from "./sidebar";
import { OrgMark } from "./user-menu";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Three-panel workspace (product §32–33):
 *   desktop  [sidebar 256 | rail 56] [main] [detail panel, docked]
 *   tablet   [rail 56 (+ full sidebar as overlay)] [main] [detail as overlay]
 *   mobile   [top bar + drawer] [main] [detail full-screen]
 * Exactly one navigation tree is mounted per tier.
 */
export const AppShell = () => {
  const breakpoint = useBreakpoint();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const overlayOpen = useUiStore((state) => state.navOverlayOpen);
  const setOverlayOpen = useUiStore((state) => state.setNavOverlayOpen);
  const newProjectOpen = useUiStore((state) => state.newProjectOpen);
  const setNewProjectOpen = useUiStore((state) => state.setNewProjectOpen);
  const newSpaceOpen = useUiStore((state) => state.newSpaceOpen);
  const setNewSpaceOpen = useUiStore((state) => state.setNewSpaceOpen);
  const location = useLocation();
  // Knowledge spaces created / shared / archived elsewhere refresh the sidebar list (PD-031).
  useKnowledgeSidebarSync(useKnowledgePermissions().view);

  // Overlays never survive a layout tier change or a navigation.
  useEffect(() => setOverlayOpen(false), [breakpoint, setOverlayOpen]);
  useEffect(() => setOverlayOpen(false), [location.pathname, setOverlayOpen]);

  const closeOverlay = () => setOverlayOpen(false);
  const railOnly = breakpoint === "tablet" || (breakpoint === "desktop" && collapsed);
  const mobile = breakpoint === "mobile";
  // A conversation brings its own header (back to /c); the global bar would only eat chat space.
  const inConversation = useMatch("/c/:channelId") !== null;
  // Switching department fades the page in place (PD-041).
  const mainRef = useDepartmentFade<HTMLElement>();

  return (
    // Height follows the on-screen keyboard (see app/ViewportSync) so bottom composers stay visible.
    <div className="flex h-[calc(100dvh-var(--keyboard-inset))] w-full overflow-hidden bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-surface-raised px-3 py-2 text-sm shadow-lg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Bỏ qua tới nội dung chính
      </a>
      <RouteProgress />

      {breakpoint === "mobile" ? null : (
        <aside
          aria-label="Thanh bên"
          className={cn(
            "relative h-full shrink-0 overflow-hidden border-r bg-canvas transition-[width] duration-200 ease-out-soft motion-reduce:transition-none",
            railOnly ? "w-14" : "w-64"
          )}
        >
          <div className={cn("h-full", railOnly ? "w-14" : "w-64")}>
            {railOnly ? (
              <Sidebar
                variant="rail"
                onToggle={breakpoint === "tablet" ? () => setOverlayOpen(true) : toggleCollapsed}
              />
            ) : (
              <Sidebar variant="full" onToggle={toggleCollapsed} />
            )}
          </div>
        </aside>
      )}

      {/* Tablet: the full sidebar floats over the content when expanded from the rail. */}
      <AnimatePresence>
        {breakpoint === "tablet" && overlayOpen ? (
          <>
            <motion.div
              key="nav-scrim"
              aria-hidden="true"
              className="fixed inset-0 z-40 bg-(--scrim)"
              onClick={closeOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            />
            <motion.aside
              key="nav-overlay"
              aria-label="Thanh bên"
              className="fixed inset-y-0 left-0 z-50 w-72 border-r bg-canvas shadow-xl"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.22, ease }}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeOverlay();
              }}
            >
              <Sidebar variant="full" onNavigate={closeOverlay} onToggle={closeOverlay} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      {/* Mobile: drawer navigation. */}
      {breakpoint === "mobile" ? (
        <Sheet open={overlayOpen} onOpenChange={setOverlayOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-[86vw] max-w-[20rem] gap-0 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
          >
            <SheetTitle className="sr-only">Điều hướng</SheetTitle>
            <SheetDescription className="sr-only">
              Phòng ban, tri thức, kênh và cài đặt
            </SheetDescription>
            <Sidebar variant="full" onNavigate={closeOverlay} />
          </SheetContent>
        </Sheet>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {mobile && !inConversation ? <MobileTopBar onOpenNav={() => setOverlayOpen(true)} /> : null}
        <main
          ref={mainRef}
          id="main"
          tabIndex={-1}
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden outline-none",
            // Phones: keep the last row / the composer clear of the home indicator.
            mobile && "pb-(--safe-bottom)"
          )}
        >
          <Suspense fallback={<RouteFallback />}>
            {/* Routes of a department: follow them (member) or explain (not a member). */}
            <DepartmentGuard>
              <Outlet />
            </DepartmentGuard>
          </Suspense>
        </main>
      </div>

      <DetailPanel
        mode={
          breakpoint === "desktop" ? "docked" : breakpoint === "tablet" ? "overlay" : "fullscreen"
        }
      />

      <CommandPalette />
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
      <NewSpaceDialog open={newSpaceOpen} onOpenChange={setNewSpaceOpen} />
    </div>
  );
};

/**
 * Phone header: navigation drawer, workspace, department (people in several departments: icon + short label, the
 * organization name truncates first), search, chat and the notification bell (with unread badges).
 */
const MobileTopBar = ({ onOpenNav }: { onOpenNav: () => void }) => {
  const session = useSessionContext();
  const { canSwitch } = useDepartment();
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const chatLabel = useChatUnreadLabel("Tin nhắn");
  return (
    <header className="shrink-0 border-b bg-canvas pt-[env(safe-area-inset-top)] pr-[max(0.25rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))]">
      <div className="flex h-12 items-center gap-0.5">
        <Button variant="ghost" size="icon" onClick={onOpenNav} aria-label="Mở điều hướng">
          <Menu />
        </Button>
        <Link
          to="/"
          className={cn(
            "ml-0.5 flex items-center gap-2 rounded-md px-1 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            canSwitch ? "shrink-0" : "min-w-0 flex-1"
          )}
          aria-label={`${session.organization.name} — Trang chủ`}
        >
          <OrgMark name={session.organization.name} className="size-6 text-xs" />
          {/* With the department switcher the bar keeps only the mark: a name cut to two letters reads as noise. */}
          {canSwitch ? null : (
            <span className="min-w-0 truncate text-sm font-semibold">
              {session.organization.name}
            </span>
          )}
        </Link>
        {canSwitch ? (
          <>
            <DepartmentSwitcher variant="topbar" />
            <span className="flex-1" aria-hidden="true" />
          </>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCommandOpen(true)}
          aria-label="Tìm kiếm"
        >
          <Search />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          nativeButton={false}
          render={<Link to="/c" aria-label={chatLabel} />}
        >
          <MessagesSquare />
          <ChatNavBadge />
        </Button>
        {/* The bell replaces the old inbox shortcut: 10 newest + "Xem tất cả" → /inbox. */}
        <NotificationBell placement="topbar" />
      </div>
    </header>
  );
};
