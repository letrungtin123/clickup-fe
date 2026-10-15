import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

import type { ChatChannelCollection, ChatMessageEvent } from "@/contracts/chat";
import { useSessionContext } from "@/features/auth/hooks";
import { chatKeys } from "@/features/chat/keys";
import { chatContent } from "@/features/desktop-notifications/content";
import { chatAlertVerdict, conversationIdFromPath } from "@/features/desktop-notifications/rules";
import { useRealtimeEvent } from "@/lib/realtime/hooks";

import { allowsPopup } from "./bell";
import { chatToastId, chatToastTitle } from "./chat-toast";
import { useWebNotificationsEnabled } from "./web-preference";

/**
 * In-app toast for new chat messages (owner, 2026-10-15): like a task or job notification, a card in the corner
 * with the sender, the message and "Xem". Same alert rule as the OS pop-up (desktop-notifications/rules.ts:
 * DMs always, channels by their notification level, never my own or muted ones); only in a visible tab, never for
 * the conversation already on screen, and off with "Thông báo trên web". A hidden tab is left to the OS pop-up.
 */
export const ChatToastRuntime = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const myId = useSessionContext().user.id;
  const webEnabled = useWebNotificationsEnabled();
  // Realtime handlers and toast clicks run later: always read the latest router state.
  const latest = useRef({ navigate, pathname, webEnabled });
  useEffect(() => {
    latest.current = { navigate, pathname, webEnabled };
  });
  const bursts = useRef(new Map<string, number>());

  useRealtimeEvent("chat:message", ({ channelId, message }: ChatMessageEvent) => {
    if (document.visibilityState !== "visible") return;
    if (!allowsPopup(undefined, latest.current.webEnabled)) return;
    const channel =
      queryClient
        .getQueryData<ChatChannelCollection>(chatKeys.channels())
        ?.items.find((entry) => entry.id === channelId) ?? null;
    if (chatAlertVerdict({ message, channel, myId, now: Date.now() }) !== "show") return;
    if (conversationIdFromPath(latest.current.pathname) === channelId) return;

    const content = chatContent({ channelId, message, channel, showPreview: true });
    const id = chatToastId(channelId);
    const count = (bursts.current.get(id) ?? 0) + 1;
    bursts.current.set(id, count);
    const forget = () => bursts.current.delete(id);
    const path = content.path;
    toast(chatToastTitle(content.title, count), {
      id,
      description: content.body,
      action: path
        ? {
            label: "Xem",
            onClick: () => {
              forget();
              void latest.current.navigate(path);
            }
          }
        : undefined,
      duration: 6000,
      onDismiss: forget,
      onAutoClose: forget
    });
  });

  return null;
};
