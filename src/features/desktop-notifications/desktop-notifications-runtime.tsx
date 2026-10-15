import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import type { ChatChannelCollection, ChatMessageEvent } from "@/contracts/chat";
import type { NotificationNewEvent } from "@/contracts/notifications";
import { useSessionContext } from "@/features/auth/hooks";
import { chatKeys } from "@/features/chat/keys";
import { describeNotification, sentenceText } from "@/features/notifications/describe";
import { useOpenNotification } from "@/features/notifications/hooks";
import { useRealtimeEvent } from "@/lib/realtime/hooks";

import { EnableDesktopNotificationsPrompt } from "./components/enable-prompt";
import { chatContent, inboxContent } from "./content";
import { currentViewer, deliverOnce } from "./deliver";
import { getDesktopSupport, useFocusBeacon } from "./hooks";
import { chatVerdict, inboxVerdict, isReadingConversation } from "./rules";
import { readPrefs } from "./storage";
import { readDesktopPermission } from "./support";

/**
 * Desktop (OS) notifications, PD-055: a chat message or an inbox notification pops up as a real Windows / macOS
 * notification while the person is in another tab, another app or has the browser minimized. Mounted once in
 * ShellServices; renders nothing on phones, over plain http or without the Notification API (the settings card
 * explains why). Rules: rules.ts; one pop-up across tabs: election.ts.
 */
export const DesktopNotificationsRuntime = () => {
  if (getDesktopSupport() !== "supported") return null;
  return (
    <>
      <DesktopNotifier />
      <EnableDesktopNotificationsPrompt />
    </>
  );
};

const DesktopNotifier = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const myId = useSessionContext().user.id;
  const openNotification = useOpenNotification();
  // Clicks may come minutes later: always use the latest router state.
  const latest = useRef({ navigate, openNotification });
  useEffect(() => {
    latest.current = { navigate, openNotification };
  });

  useFocusBeacon();

  useRealtimeEvent("chat:message", (event: ChatMessageEvent) => {
    if (readDesktopPermission() !== "granted") return;
    const prefs = readPrefs();
    if (!prefs.chat) return;
    const channel =
      queryClient
        .getQueryData<ChatChannelCollection>(chatKeys.channels())
        ?.items.find((entry) => entry.id === event.channelId) ?? null;
    const verdict = chatVerdict({
      channelId: event.channelId,
      message: event.message,
      channel,
      myId,
      now: Date.now(),
      viewer: currentViewer()
    });
    if (verdict !== "show") return;
    const content = chatContent({
      channelId: event.channelId,
      message: event.message,
      channel,
      showPreview: prefs.chatPreview
    });
    const path = content.path;
    void deliverOnce(
      {
        title: content.title,
        body: content.body,
        tag: content.tag,
        onClick: path ? () => void latest.current.navigate(path) : undefined
      },
      () => !isReadingConversation(currentViewer(), event.channelId)
    );
  });

  useRealtimeEvent("notification:new", ({ notification }: NotificationNewEvent) => {
    if (readDesktopPermission() !== "granted") return;
    if (!readPrefs().work) return;
    if (inboxVerdict({ notification, now: Date.now(), viewer: currentViewer() }) !== "show") return;
    const content = inboxContent(notification, sentenceText(describeNotification(notification)));
    void deliverOnce(
      {
        title: content.title,
        body: content.body,
        tag: content.tag,
        onClick: () => latest.current.openNotification(notification)
      },
      () => inboxVerdict({ notification, now: Date.now(), viewer: currentViewer() }) === "show"
    );
  });

  return null;
};
