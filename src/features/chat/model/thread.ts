import type { ChatMessage, ThreadPage, ThreadRootSummary } from "@/contracts/chat";

import { applyThreadSummary } from "./window";

/** Cached thread: root + replies oldest → newest. `hasMore` = newer replies not loaded yet. */
export type ThreadState = {
  root: ChatMessage;
  items: ChatMessage[];
  nextCursor: string | null;
  hasMore: boolean;
};

export const THREAD_MAX = 500;

export const fromThreadPages = (pages: readonly ThreadPage[]): ThreadState | undefined => {
  const first = pages[0];
  const last = pages.at(-1);
  if (!first || !last) return undefined;
  const seen = new Set<string>();
  const items: ChatMessage[] = [];
  for (const page of pages) {
    for (const reply of page.items) {
      if (!seen.has(reply.id)) {
        seen.add(reply.id);
        items.push(reply);
      }
    }
  }
  return {
    root: last.root,
    items,
    nextCursor: last.pageInfo.nextCursor,
    hasMore: last.pageInfo.hasMore
  };
};

const byCreated = (a: ChatMessage, b: ChatMessage) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Live reply: appended only when the thread is fully loaded (otherwise "load more" fetches it). */
export const appendReply = (
  thread: ThreadState,
  reply: ChatMessage,
  summary: ThreadRootSummary | null
): ThreadState => {
  const root = summary ? applyThreadSummary(thread.root, summary) : thread.root;
  if (thread.hasMore) {
    return root === thread.root ? thread : { ...thread, root };
  }
  const exists = thread.items.some((item) => item.id === reply.id);
  const items = exists
    ? thread.items.map((item) => (item.id === reply.id ? reply : item))
    : [...thread.items, reply].sort(byCreated);
  return { ...thread, root, items: items.slice(-THREAD_MAX) };
};

export const mapThread = (
  thread: ThreadState,
  messageId: string,
  update: (message: ChatMessage) => ChatMessage
): ThreadState => {
  if (thread.root.id === messageId) {
    const root = update(thread.root);
    return root === thread.root ? thread : { ...thread, root };
  }
  let changed = false;
  const items = thread.items.map((item) => {
    if (item.id !== messageId) return item;
    const next = update(item);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? { ...thread, items } : thread;
};
