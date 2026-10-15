import { describe, expect, it } from "vitest";

import {
  STALE_EVENT_MS,
  chatAlertVerdict,
  chatVerdict,
  conversationIdFromPath,
  inboxVerdict,
  type ChatNotifyInput,
  type ViewerState
} from "./rules";

const ME = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const CHANNEL = "00000000-0000-4000-8000-0000000000c1";
const NOW = Date.parse("2026-10-15T08:00:00.000Z");

const away: ViewerState = { focusedHere: false, pathname: "/", focusedElsewherePath: null };

const input = (overrides: {
  message?: Partial<ChatNotifyInput["message"]>;
  channel?: ChatNotifyInput["channel"];
  viewer?: ViewerState;
}): ChatNotifyInput => ({
  channelId: CHANNEL,
  message: {
    id: "00000000-0000-4000-8000-0000000000a1",
    kind: "user",
    author: { id: OTHER, displayName: "An", email: null, avatarUrl: null },
    threadRootId: null,
    mentions: [],
    isDeleted: false,
    createdAt: new Date(NOW - 1000).toISOString(),
    ...overrides.message
  },
  channel: overrides.channel === undefined ? { kind: "public", notifyLevel: "all" } : overrides.channel,
  myId: ME,
  now: NOW,
  viewer: overrides.viewer ?? away
});

describe("chat pop-up rules", () => {
  it("never pops up my own, system or deleted messages", () => {
    expect(chatVerdict(input({ message: { author: { id: ME, displayName: "Tôi", email: null, avatarUrl: null } } }))).toBe("own");
    expect(chatVerdict(input({ message: { kind: "system", author: null } }))).toBe("system");
    expect(chatVerdict(input({ message: { isDeleted: true } }))).toBe("deleted");
  });

  it("ignores stale events (replays / very late deliveries)", () => {
    const old = new Date(NOW - STALE_EVENT_MS - 1000).toISOString();
    expect(chatVerdict(input({ message: { createdAt: old } }))).toBe("stale");
  });

  it("DMs and group DMs always pop up, unless muted", () => {
    expect(chatVerdict(input({ channel: { kind: "dm", notifyLevel: "all" } }))).toBe("show");
    expect(chatVerdict(input({ channel: { kind: "group_dm", notifyLevel: "mentions" } }))).toBe("show");
    expect(chatVerdict(input({ channel: { kind: "dm", notifyLevel: "none" } }))).toBe("muted");
  });

  it("channels follow the notify level", () => {
    expect(chatVerdict(input({ channel: { kind: "public", notifyLevel: "all" } }))).toBe("show");
    expect(chatVerdict(input({ channel: { kind: "private", notifyLevel: null } }))).toBe("show");
    expect(chatVerdict(input({ channel: { kind: "public", notifyLevel: "mentions" } }))).toBe("not-mentioned");
    expect(
      chatVerdict(input({ channel: { kind: "public", notifyLevel: "mentions" }, message: { mentions: [ME] } }))
    ).toBe("show");
    // Muted wins over a mention.
    expect(
      chatVerdict(input({ channel: { kind: "public", notifyLevel: "none" }, message: { mentions: [ME] } }))
    ).toBe("muted");
  });

  it("thread replies pop up only in DMs or when I am mentioned", () => {
    const reply = { threadRootId: "00000000-0000-4000-8000-0000000000a0" };
    expect(chatVerdict(input({ message: reply }))).toBe("thread");
    expect(chatVerdict(input({ message: { ...reply, mentions: [ME] } }))).toBe("show");
    expect(chatVerdict(input({ message: reply, channel: { kind: "dm", notifyLevel: "all" } }))).toBe("show");
  });

  it("an uncached conversation pops up only for a mention", () => {
    expect(chatVerdict(input({ channel: null }))).toBe("unknown-channel");
    expect(chatVerdict(input({ channel: null, message: { mentions: [ME] } }))).toBe("show");
  });

  it("is skipped while the person reads that conversation, here or in another focused tab", () => {
    const here: ViewerState = { focusedHere: true, pathname: `/c/${CHANNEL}`, focusedElsewherePath: null };
    expect(chatVerdict(input({ viewer: here }))).toBe("reading");
    const elsewhere: ViewerState = { focusedHere: false, pathname: "/", focusedElsewherePath: `/c/${CHANNEL}` };
    expect(chatVerdict(input({ viewer: elsewhere }))).toBe("reading");
    // Visible but not focused (the person is in Photoshop): pop up.
    expect(chatVerdict(input({ viewer: { ...here, focusedHere: false } }))).toBe("show");
    // The app is in front on another page or conversation: the in-app toast alerts instead, no OS pop-up.
    expect(chatVerdict(input({ viewer: { ...here, pathname: "/my-tasks" } }))).toBe("focused");
    expect(
      chatVerdict(input({ viewer: { focusedHere: false, pathname: "/", focusedElsewherePath: "/c/other" } }))
    ).toBe("focused");
  });

  it("decides whether a message deserves any alert, wherever the person is", () => {
    const { viewer: _viewer, channelId: _channelId, ...base } = input({});
    expect(chatAlertVerdict(base)).toBe("show");
    expect(chatAlertVerdict({ ...base, channel: { kind: "dm", notifyLevel: "none" } })).toBe("muted");
    expect(chatAlertVerdict({ ...base, channel: { kind: "public", notifyLevel: "mentions" } })).toBe("not-mentioned");
  });

  it("reads the conversation id from the path", () => {
    expect(conversationIdFromPath(`/c/${CHANNEL}`)).toBe(CHANNEL);
    expect(conversationIdFromPath(`/c/${CHANNEL}/`)).toBe(CHANNEL);
    expect(conversationIdFromPath("/c")).toBeNull();
    expect(conversationIdFromPath("/inbox")).toBeNull();
  });
});

describe("inbox pop-up rules", () => {
  const notification = (type: string, ageMs = 1000) =>
    ({ type, createdAt: new Date(NOW - ageMs).toISOString() }) as Parameters<
      typeof inboxVerdict
    >[0]["notification"];

  it("leaves chat notifications to the chat rule", () => {
    expect(inboxVerdict({ notification: notification("chat.mentioned"), now: NOW, viewer: away })).toBe("chat");
    expect(inboxVerdict({ notification: notification("channel.member_added"), now: NOW, viewer: away })).toBe(
      "chat"
    );
  });

  it("pops up work notifications only while no tab of the app is in front", () => {
    const task = notification("production.task_waiting_qc");
    expect(inboxVerdict({ notification: task, now: NOW, viewer: away })).toBe("show");
    expect(
      inboxVerdict({ notification: task, now: NOW, viewer: { ...away, focusedHere: true } })
    ).toBe("focused");
    expect(
      inboxVerdict({ notification: task, now: NOW, viewer: { ...away, focusedElsewherePath: "/inbox" } })
    ).toBe("focused");
    expect(
      inboxVerdict({ notification: notification("task.assigned", STALE_EVENT_MS + 1), now: NOW, viewer: away })
    ).toBe("stale");
  });
});
