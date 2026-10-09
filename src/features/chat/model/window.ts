import type {
  ChatMessage,
  ChatMessageUpdatedEvent,
  ChatReactionEvent,
  MessageHistory,
  ReactionSummary,
  ThreadRootSummary
} from "@/contracts/chat";

/**
 * A bounded, contiguous window of a channel's top-level messages (oldest → newest by `seq`).
 * `hasNewer = false` means the window reaches the live end of the channel, so realtime messages
 * append to it; otherwise the user is reading history and new messages only raise a pill.
 */
export type MessageWindow = {
  items: ChatMessage[];
  hasOlder: boolean;
  hasNewer: boolean;
  /** Read marker returned with the latest fetch (null when previewing without membership). */
  lastReadSeq: number | null;
};

/** Hard cap on messages kept in memory/DOM per channel; the far end is trimmed and re-fetched on demand. */
export const WINDOW_MAX = 400;

export const fromHistory = (history: MessageHistory): MessageWindow => ({
  items: history.items.filter((message) => message.seq !== null),
  hasOlder: history.hasOlder,
  hasNewer: history.hasNewer,
  lastReadSeq: history.lastReadSeq
});

const bySeq = (a: ChatMessage, b: ChatMessage) => (a.seq ?? 0) - (b.seq ?? 0);

/** Merges messages by id (incoming wins) and keeps `seq` order. */
export const upsertMessages = (items: readonly ChatMessage[], incoming: readonly ChatMessage[]) => {
  if (incoming.length === 0) {
    return items as ChatMessage[];
  }
  const byId = new Map(items.map((message) => [message.id, message]));
  for (const message of incoming) {
    if (message.seq === null) {
      continue; // thread replies never enter the channel window
    }
    byId.set(message.id, message);
  }
  return [...byId.values()].sort(bySeq);
};

export const firstSeq = (window: MessageWindow) => window.items[0]?.seq ?? null;
export const lastSeq = (window: MessageWindow) => window.items.at(-1)?.seq ?? null;

/** Live message from realtime / the send response. Ignored while reading older history. */
export const appendLive = (window: MessageWindow, message: ChatMessage): MessageWindow => {
  if (message.seq === null || window.hasNewer) {
    return window;
  }
  const existing = window.items.find((item) => item.id === message.id);
  if (existing && existing === message) {
    return window;
  }
  let items = upsertMessages(window.items, [message]);
  let hasOlder = window.hasOlder;
  if (items.length > WINDOW_MAX) {
    items = items.slice(items.length - WINDOW_MAX);
    hasOlder = true;
  }
  return { ...window, items, hasOlder };
};

/** Older page prepended (scrolling up). Trims the newest end when the window grows too large. */
export const mergeOlder = (window: MessageWindow, page: MessageHistory): MessageWindow => {
  let items = upsertMessages(window.items, page.items);
  let hasNewer = window.hasNewer;
  if (items.length > WINDOW_MAX) {
    items = items.slice(0, WINDOW_MAX);
    hasNewer = true;
  }
  return { ...window, items, hasOlder: page.hasOlder, hasNewer };
};

/** Newer page appended (scrolling down through history). Trims the oldest end when too large. */
export const mergeNewer = (window: MessageWindow, page: MessageHistory): MessageWindow => {
  let items = upsertMessages(window.items, page.items);
  let hasOlder = window.hasOlder;
  if (items.length > WINDOW_MAX) {
    items = items.slice(items.length - WINDOW_MAX);
    hasOlder = true;
  }
  return {
    ...window,
    items,
    hasOlder,
    hasNewer: page.hasNewer,
    lastReadSeq: page.lastReadSeq ?? window.lastReadSeq
  };
};

/**
 * Reconciles a refetched latest page with what is cached (reconnect / invalidation):
 * - overlap with a live window → fresh copies replace cached ones, older loaded messages are kept;
 * - a historical window (hasNewer) → kept as is, only the read marker is refreshed;
 * - a gap (missed more than a page) → the latest page replaces the window.
 */
export const mergeRefresh = (existing: MessageWindow | undefined, latest: MessageWindow) => {
  if (!existing || existing.items.length === 0) {
    return latest;
  }
  if (existing.hasNewer) {
    return { ...existing, lastReadSeq: latest.lastReadSeq };
  }
  const latestFirst = firstSeq(latest);
  const existingLast = lastSeq(existing);
  if (latestFirst === null) {
    return latest;
  }
  if (existingLast !== null && latestFirst <= existingLast + 1) {
    const older = existing.items.filter((message) => (message.seq ?? 0) < latestFirst);
    return {
      items: [...older, ...latest.items],
      hasOlder: older.length > 0 ? existing.hasOlder : latest.hasOlder,
      hasNewer: false,
      lastReadSeq: latest.lastReadSeq
    };
  }
  return latest;
};

export const mapMessages = (
  window: MessageWindow,
  predicate: (message: ChatMessage) => boolean,
  update: (message: ChatMessage) => ChatMessage
): MessageWindow => {
  let changed = false;
  const items = window.items.map((message) => {
    if (!predicate(message)) {
      return message;
    }
    const next = update(message);
    if (next !== message) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...window, items } : window;
};

// Message patches ----------------------------------------------------------------------------------

export const applyEdit = (message: ChatMessage, event: ChatMessageUpdatedEvent): ChatMessage => ({
  ...message,
  body: event.body,
  text: event.text,
  mentions: event.mentions,
  isEdited: true,
  editedAt: event.editedAt
});

export const applyDeletion = (message: ChatMessage, deletedAt: string): ChatMessage =>
  message.isDeleted
    ? message
    : {
        ...message,
        isDeleted: true,
        deletedAt,
        body: null,
        text: "",
        attachments: [],
        reactions: [],
        mentions: []
      };

export const applyThreadSummary = (
  message: ChatMessage,
  summary: ThreadRootSummary
): ChatMessage =>
  message.replyCount === summary.replyCount && message.lastReplyAt === summary.lastReplyAt
    ? message
    : { ...message, replyCount: summary.replyCount, lastReplyAt: summary.lastReplyAt };

/**
 * Sets one emoji's total. `reactedByMe` follows the event when it is about the viewer, otherwise the
 * viewer's previous state is kept. A zero count removes the chip.
 */
export const setReaction = (
  reactions: readonly ReactionSummary[],
  emoji: string,
  count: number,
  reactedByMe: boolean | undefined
): ReactionSummary[] => {
  const index = reactions.findIndex((reaction) => reaction.emoji === emoji);
  if (count <= 0) {
    return index === -1 ? [...reactions] : reactions.filter((_, i) => i !== index);
  }
  if (index === -1) {
    return [...reactions, { emoji, count, reactedByMe: reactedByMe ?? false }];
  }
  return reactions.map((reaction, i) =>
    i === index ? { emoji, count, reactedByMe: reactedByMe ?? reaction.reactedByMe } : reaction
  );
};

export const applyReactionEvent = (
  message: ChatMessage,
  event: ChatReactionEvent,
  myId: string
): ChatMessage => ({
  ...message,
  reactions: setReaction(
    message.reactions,
    event.emoji,
    event.count,
    event.userId === myId ? event.added : undefined
  )
});

/** Optimistic local toggle (the server echo / response then sets the authoritative count). */
export const toggleReactionLocally = (message: ChatMessage, emoji: string, add: boolean) => {
  const current = message.reactions.find((reaction) => reaction.emoji === emoji);
  const count =
    (current?.count ?? 0) + (add ? (current?.reactedByMe ? 0 : 1) : current?.reactedByMe ? -1 : 0);
  return { ...message, reactions: setReaction(message.reactions, emoji, count, add) };
};
