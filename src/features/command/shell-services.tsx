import { ChatDialogs } from "@/features/chat/components/chat-dialogs";
import { ChatRuntime } from "@/features/chat/realtime/chat-runtime";
import { NotificationsRuntime } from "@/features/notifications/notifications-runtime";
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
    <ChatDialogs />
  </>
);
