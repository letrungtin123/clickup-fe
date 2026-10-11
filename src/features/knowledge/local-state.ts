import type { RichTextDoc } from "@/contracts/rich-text";
import { onSessionEnd } from "@/lib/session-cleanup";

import { clearAllDrafts, sweepDrafts } from "./model/drafts";

/**
 * Knowledge state kept on this device outside the query cache, and its cleanup at sign-out (KB-SEC FE-02/03).
 * Signing out does not reload the page, so module-level state would otherwise reach the next person who signs
 * in on the same tab.
 */

/** Unsent comment drafts: survive closing the sheet / switching items, never another user's session. */
const commentDrafts = new Map<string, RichTextDoc>();

export const commentDraftKey = (userId: string, itemId: string, parentCommentId?: string | null) =>
  `${userId}:${itemId}${parentCommentId ? `:${parentCommentId}` : ""}`;

export const commentDraftStore = {
  get: (key: string) => commentDrafts.get(key) ?? null,
  set: (key: string, doc: RichTextDoc) => {
    commentDrafts.set(key, doc);
  },
  delete: (key: string) => {
    commentDrafts.delete(key);
  }
};

/** Explicit sign-out: unsent comments and local item drafts (all of this browser's knowledge drafts). */
export const clearKnowledgeLocalState = () => {
  commentDrafts.clear();
  clearAllDrafts();
};

let swept = false;
/** Once per page load (called from the shell): expired local drafts and old conflict copies go away. */
export const sweepKnowledgeDrafts = () => {
  if (swept) return;
  swept = true;
  sweepDrafts();
};

// Any end of the session drops unsent comments of this tab; "Đăng xuất" also removes the local item drafts
// (an expired session keeps them: the same person usually signs straight back in).
onSessionEnd((reason) => {
  if (reason === "signed-out") clearKnowledgeLocalState();
  else commentDrafts.clear();
});
