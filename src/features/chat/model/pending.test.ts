import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import { chatKeys } from "../keys";
import { receiveMessage } from "../realtime/cache";
import { conversationKey, mergeWithPending, usePendingStore, type PendingMessage } from "./pending";
import { CHANNEL_ID, makeChannel, makeMessage, me } from "./test-fixtures";
import type { MessageWindow } from "./window";

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";

const pending = (overrides: Partial<PendingMessage> = {}): PendingMessage => ({
  clientMessageId: CLIENT_ID,
  channelId: CHANNEL_ID,
  threadRootId: null,
  body: { type: "doc", content: [] },
  text: "Đang gửi",
  attachments: [],
  author: me,
  createdAt: "2026-10-09T08:05:00.000Z",
  status: "sending",
  ...overrides
});

afterEach(() => usePendingStore.setState({ byConversation: {} }));

describe("optimistic send reconciliation", () => {
  it("shows pending messages after confirmed ones, ordered by creation", () => {
    const confirmed = [makeMessage({ seq: 1 })];
    const merged = mergeWithPending(confirmed, [
      pending({ clientMessageId: "33333333-3333-4333-8333-333333333333", createdAt: "2026-10-09T08:06:00Z" }),
      pending()
    ]);
    expect(merged.map((message) => message.clientMessageId ?? message.id)).toEqual([
      confirmed[0]!.id,
      CLIENT_ID,
      "33333333-3333-4333-8333-333333333333"
    ]);
    expect(merged[1]?.pending).toEqual({ status: "sending", error: undefined });
  });

  it("drops a pending copy as soon as its server copy is in the list (no double render)", () => {
    const server = makeMessage({ seq: 2, author: me, clientMessageId: CLIENT_ID });
    const merged = mergeWithPending([server], [pending()]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe(server.id);
  });

  it("confirms through the realtime echo: window updated, pending removed, own message not unread", () => {
    const queryClient = new QueryClient();
    usePendingStore.getState().add(pending());
    queryClient.setQueryData<MessageWindow>(chatKeys.messages(CHANNEL_ID), {
      items: [makeMessage({ seq: 1 })],
      hasOlder: false,
      hasNewer: false,
      lastReadSeq: 1
    });
    queryClient.setQueryData(chatKeys.channels(), {
      items: [makeChannel({ lastMessageSeq: 1, lastReadSeq: 1 })]
    });

    const server = makeMessage({ seq: 2, author: me, clientMessageId: CLIENT_ID });
    receiveMessage(queryClient, { channelId: CHANNEL_ID, message: server, threadRoot: null }, me.id, {
      fromRealtime: true
    });
    // The POST response arriving afterwards is a no-op.
    receiveMessage(queryClient, { channelId: CHANNEL_ID, message: server, threadRoot: null }, me.id, {
      fromRealtime: false
    });

    const window = queryClient.getQueryData<MessageWindow>(chatKeys.messages(CHANNEL_ID));
    expect(window?.items.map((message) => message.seq)).toEqual([1, 2]);
    expect(usePendingStore.getState().byConversation[conversationKey(CHANNEL_ID, null)]).toBeUndefined();
    const sidebar = queryClient.getQueryData<{ items: ReturnType<typeof makeChannel>[] }>(chatKeys.channels());
    expect(sidebar?.items[0]).toMatchObject({ lastMessageSeq: 2, unreadCount: 0, lastReadSeq: 2 });
  });

  it("bumps unread and mention counts for others' messages in channels the viewer is not reading", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(chatKeys.channels(), {
      items: [makeChannel({ lastMessageSeq: 5, lastReadSeq: 5 })]
    });
    const incoming = makeMessage({ seq: 6, mentions: [me.id] });
    receiveMessage(queryClient, { channelId: CHANNEL_ID, message: incoming, threadRoot: null }, me.id, {
      fromRealtime: true
    });
    receiveMessage(queryClient, { channelId: CHANNEL_ID, message: incoming, threadRoot: null }, me.id, {
      fromRealtime: true
    });
    const sidebar = queryClient.getQueryData<{ items: ReturnType<typeof makeChannel>[] }>(chatKeys.channels());
    expect(sidebar?.items[0]).toMatchObject({ unreadCount: 1, mentionCount: 1, lastMessageSeq: 6 });
  });

  it("marks failures in place and removes discarded messages", () => {
    const store = usePendingStore.getState();
    store.add(pending());
    store.update(CLIENT_ID, { status: "failed", error: "Bạn gửi hơi nhanh." });
    expect(store.find(CLIENT_ID)).toMatchObject({ status: "failed", error: "Bạn gửi hơi nhanh." });
    usePendingStore.getState().remove(CLIENT_ID);
    expect(usePendingStore.getState().find(CLIENT_ID)).toBeUndefined();
  });
});
