import { clearDraft, draftKey } from "./model/drafts";

/** /k/:spaceId/i/:itemId/edit — the editor of an existing item. */
export const itemEditPath = (spaceId: string, itemId: string) =>
  `/k/${encodeURIComponent(spaceId)}/i/${encodeURIComponent(itemId)}/edit`;

/**
 * A new item was just saved as a draft so its first image could be uploaded (files belong to an item).
 * The open editor keeps working in place — uploads may still be running, so there is no route change and
 * no remount — but from now on:
 * - the address bar shows the item's edit URL, so a reload reopens this item (and its local draft)
 *   instead of an empty "Mục mới" form. The history entry is replaced, keeping the router's own state
 *   (key, index), so back / forward and the leave guard keep working;
 * - the new-item draft of the space is dropped: the autosave continues under the item's key (based on
 *   version 1).
 * Returns the item's draft key.
 */
export const adoptAutoDraft = ({ userId, spaceId, itemId }: { userId: string; spaceId: string; itemId: string }) => {
  clearDraft(draftKey(userId, { spaceId }));
  const path = itemEditPath(spaceId, itemId);
  try {
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.replaceState(window.history.state, "", path);
    }
  } catch {
    // A sandboxed frame may refuse history changes: the editor still works, only a reload loses the URL.
  }
  return draftKey(userId, { itemId });
};
