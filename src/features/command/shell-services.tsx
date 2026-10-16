import { UpdateNoticeRuntime } from "@/features/app-update/update-runtime";
import { ChatDialogs } from "@/features/chat/components/chat-dialogs";
import { ChatRuntime } from "@/features/chat/realtime/chat-runtime";
import { DesktopNotificationsRuntime } from "@/features/desktop-notifications/desktop-notifications-runtime";
import { ChatToastRuntime } from "@/features/notifications/chat-toast-runtime";
import { NotificationsRuntime } from "@/features/notifications/notifications-runtime";
import { TabBadgeRuntime } from "@/features/notifications/tab-badge-runtime";
import { ProductionRuntime } from "@/features/production/components/production-runtime";
import { TaskRuntime } from "@/features/tasks/realtime";

/**
 * App-wide, always-mounted services for chat, task caches and the inbox. Rendered by <CommandPalette/> — the one
 * feature component the shell mounts on every layout tier (the sidebar is not mounted on mobile
 * while its drawer is closed), so realtime badges, toasts and dialogs work everywhere.
 */
export const ShellServices = () => (
  <>
    <ChatRuntime />
    <TaskRuntime />
    <NotificationsRuntime />
    {/* New chat messages pop up as a corner toast, like task and job notifications. */}
    <ChatToastRuntime />
    {/* Unread count on the browser tab (favicon badge + title), for people working in many tabs. */}
    <TabBadgeRuntime />
    {/* Windows / macOS pop-ups for chat and the inbox while the app is in the background (PD-055). */}
    <DesktopNotificationsRuntime />
    <ProductionRuntime />
    <ChatDialogs />
    {/* "Đã có phiên bản mới — Tải lại" after a deploy, instead of clicks that silently fail. */}
    <UpdateNoticeRuntime />
  </>
);
