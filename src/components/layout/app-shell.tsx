import { cn } from "cn";
import { Inbox, Menu, MessagesSquare, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, useEffect } from "react";
import { Link, Outlet, useLocation, useMatch } from "react-router";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSessionContext } from "@/features/auth/hooks";
import { ChatNavBadge } from "@/features/chat/components/chat-nav-badge";
import { useChatUnreadLabel } from "@/features/chat/hooks/use-chat-unread-label";
import { CommandPalette } from "@/features/command/command-palette";
import { InboxNavBadge } from "@/features/notifications/components/inbox-badge";
import { useUnreadNotificationCount } from "@/features/notifications/hooks";
import { NewProjectDialog } from "@/features/projects/components/new-project-dialog";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useUiStore } from "@/stores/ui-store";

import { DetailPanel } from "./detail-panel";
import { RouteFallback } from "./route-fallback";
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
  const location = useLocation();

  // Overlays never survive a layout tier change or a navigation.
  useEffect(() => setOverlayOpen(false), [breakpoint, setOverlayOpen]);
  useEffect(() => setOverlayOpen(false), [location.pathname, setOverlayOpen]);

  const closeOverlay = () => setOverlayOpen(false);
  const railOnly = breakpoint === "tablet" || (breakpoint === "desktop" && collapsed);
  const mobile = breakpoint === "mobile";
  // A conversation brings its own header (back to /c); the global bar would only eat chat space.
  const inConversation = useMatch("/c/:channelId") !== null;

  return (
    // Height follows the on-screen keyboard (see app/ViewportSync) so bottom composers stay visible.
    <div className="flex h-[calc(100dvh-var(--keyboard-inset))] w-full overflow-hidden bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-surface-raised px-3 py-2 text-sm shadow-lg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Bỏ qua tới nội dung chính
      </a>

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
            <SheetDescription className="sr-only">Dự án, kênh và cài đặt</SheetDescription>
            <Sidebar variant="full" onNavigate={closeOverlay} />
          </SheetContent>
        </Sheet>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {mobile && !inConversation ? <MobileTopBar onOpenNav={() => setOverlayOpen(true)} /> : null}
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden outline-none",
            // Phones: keep the last row / the composer clear of the home indicator.
            mobile && "pb-(--safe-bottom)"
          )}
        >
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
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
    </div>
  );
};

/** Phone header: navigation drawer, workspace, search, chat and inbox (with unread badges). */
const MobileTopBar = ({ onOpenNav }: { onOpenNav: () => void }) => {
  const session = useSessionContext();
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const inboxUnread = useUnreadNotificationCount().data ?? 0;
  const chatLabel = useChatUnreadLabel("Tin nhắn");
  return (
    <header className="shrink-0 border-b bg-canvas pt-[env(safe-area-inset-top)] pr-[max(0.25rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))]">
      <div className="flex h-12 items-center gap-0.5">
        <Button variant="ghost" size="icon" onClick={onOpenNav} aria-label="Mở điều hướng">
          <Menu />
        </Button>
        <Link
          to="/"
          className="ml-0.5 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${session.organization.name} — Trang chủ`}
        >
          <OrgMark name={session.organization.name} className="size-6 text-xs" />
          <span className="min-w-0 truncate text-sm font-semibold">
            {session.organization.name}
          </span>
        </Link>
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
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          nativeButton={false}
          render={
            <Link
              to="/inbox"
              aria-label={inboxUnread > 0 ? `Hộp thư, ${inboxUnread} chưa đọc` : "Hộp thư"}
            />
          }
        >
          <Inbox />
          <InboxNavBadge variant="dot" />
        </Button>
      </div>
    </header>
  );
};
