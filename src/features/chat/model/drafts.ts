import { create } from "zustand";

import type { RichTextDoc } from "@/contracts/rich-text";

/**
 * Unsent composer drafts per conversation (channel or thread), kept while the app is open. Memory
 * only on purpose: drafts never outlive the session on a shared browser.
 */
type DraftState = {
  drafts: Record<string, RichTextDoc>;
  setDraft: (key: string, doc: RichTextDoc | null) => void;
};

const MAX_DRAFTS = 50;

export const useDraftStore = create<DraftState>()((set) => ({
  drafts: {},
  setDraft: (key, doc) =>
    set((state) => {
      if (!doc && !(key in state.drafts)) return state;
      const drafts = { ...state.drafts };
      delete drafts[key];
      if (doc) {
        drafts[key] = doc;
        const keys = Object.keys(drafts);
        for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_DRAFTS))) {
          delete drafts[stale];
        }
      }
      return { drafts };
    })
}));
