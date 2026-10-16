import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ChannelSort } from "./channels";

/**
 * Client-only chat state shared across the shell:
 * - which conversation is on screen and whether the viewer is at its live end (suppresses unread
 *   bumps for messages they are watching arrive);
 * - typing indicators (expire on their own);
 * - sidebar preferences.
 */

type ActiveConversation = {
  channelId: string | null;
  /** Viewer sees the newest messages (window at the live end, scrolled to the bottom, tab visible). */
  live: boolean;
};

export const useActiveChannelStore = create<
  ActiveConversation & {
    setActive: (channelId: string | null) => void;
    setLive: (channelId: string, live: boolean) => void;
  }
>()((set) => ({
  channelId: null,
  live: false,
  setActive: (channelId) => set({ channelId, live: false }),
  setLive: (channelId, live) =>
    set((state) => (state.channelId === channelId && state.live !== live ? { live } : state))
}));

// Typing -------------------------------------------------------------------------------------------

/** How long a typing signal stays visible (senders re-emit about every 3 s while typing). */
export const TYPING_TTL_MS = 6000;

type TypingState = {
  /** conversationKey → userId → expiry timestamp */
  byConversation: Record<string, Record<string, number>>;
  touch: (key: string, userId: string) => void;
  clear: (key: string, userId: string) => void;
  prune: () => void;
};

let pruneTimer: ReturnType<typeof setTimeout> | null = null;

export const useTypingStore = create<TypingState>()((set, get) => ({
  byConversation: {},
  touch: (key, userId) => {
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [key]: { ...state.byConversation[key], [userId]: Date.now() + TYPING_TTL_MS }
      }
    }));
    pruneTimer ??= setTimeout(() => {
      pruneTimer = null;
      get().prune();
    }, TYPING_TTL_MS + 50);
  },
  clear: (key, userId) =>
    set((state) => {
      const current = state.byConversation[key];
      if (!current?.[userId]) return state;
      const next = { ...current };
      delete next[userId];
      return { byConversation: { ...state.byConversation, [key]: next } };
    }),
  prune: () => {
    const now = Date.now();
    let nextExpiry = Infinity;
    set((state) => {
      const byConversation: TypingState["byConversation"] = {};
      for (const [key, users] of Object.entries(state.byConversation)) {
        const alive = Object.entries(users).filter(([, expiry]) => expiry > now);
        for (const [, expiry] of alive) nextExpiry = Math.min(nextExpiry, expiry);
        if (alive.length > 0) byConversation[key] = Object.fromEntries(alive);
      }
      return { byConversation };
    });
    if (nextExpiry !== Infinity) {
      pruneTimer ??= setTimeout(
        () => {
          pruneTimer = null;
          get().prune();
        },
        Math.max(50, nextExpiry - now + 50)
      );
    }
  }
}));

const noTypers: readonly string[] = [];

export const selectTypers = (key: string, excludeId: string) => (state: TypingState) => {
  const users = state.byConversation[key];
  if (!users) return noTypers;
  const ids = Object.keys(users).filter((id) => id !== excludeId);
  return ids.length === 0 ? noTypers : ids;
};

// Dialogs ------------------------------------------------------------------------------------------

export type ChatDialog = "create-channel" | "browse-channels" | "new-message";

/** A tab of the conversation settings dialog (same values as its SettingsTab). */
export type ConversationSettingsTab = "about" | "members" | "settings";

/** Conversation settings opened from a sidebar row's "…" (the open conversation keeps its own, in ChannelScreen). */
export const useChannelSettingsStore = create<{
  target: { channelId: string; tab: ConversationSettingsTab } | null;
  open: (channelId: string, tab: ConversationSettingsTab) => void;
  setTab: (tab: ConversationSettingsTab) => void;
  close: () => void;
}>()((set) => ({
  target: null,
  open: (channelId, tab) => set({ target: { channelId, tab } }),
  setTab: (tab) => set((state) => (state.target ? { target: { ...state.target, tab } } : state)),
  close: () => set({ target: null })
}));

/** App-wide chat dialogs, openable from the sidebar, the command palette and empty states. */
export const useChatDialogStore = create<{
  dialog: ChatDialog | null;
  open: (dialog: ChatDialog) => void;
  close: () => void;
}>()((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null })
}));

// Preferences --------------------------------------------------------------------------------------

type ChatPrefs = {
  channelSort: ChannelSort;
  setChannelSort: (sort: ChannelSort) => void;
};

export const useChatPrefs = create<ChatPrefs>()(
  persist(
    (set) => ({
      channelSort: "activity",
      setChannelSort: (channelSort) => set({ channelSort })
    }),
    { name: "nesso-work-chat", version: 1 }
  )
);
