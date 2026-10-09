import type { Placement } from "@/contracts/work";

/**
 * Drag & drop placement against the visible order of a group/column (PD-007 fractional ranks: the
 * server derives the rank from neighbours; `afterId` = right after that sibling, `beforeId` = right
 * before it). The dragged item itself is never used as a neighbour.
 */

export type DropPosition = "before" | "after";

/** `overId` null = dropped on the container itself (empty group / below the last item). */
export type DropTarget = { overId: string | null; position: DropPosition };

export const computeDropPlacement = (
  ordered: readonly { id: string }[],
  activeId: string,
  target: DropTarget
): Placement => {
  const siblings = ordered.filter((item) => item.id !== activeId);
  const index = target.overId ? siblings.findIndex((item) => item.id === target.overId) : -1;
  if (index === -1) {
    const last = siblings[siblings.length - 1];
    return last ? { afterId: last.id } : {};
  }
  if (target.position === "before") {
    const previous = siblings[index - 1];
    return { beforeId: siblings[index]?.id ?? null, ...(previous ? { afterId: previous.id } : {}) };
  }
  const next = siblings[index + 1];
  return { afterId: siblings[index]?.id ?? null, ...(next ? { beforeId: next.id } : {}) };
};

/** Index the dragged item would occupy in `ordered` (with itself removed) after the drop. */
export const dropIndex = (ordered: readonly { id: string }[], activeId: string, target: DropTarget) => {
  const siblings = ordered.filter((item) => item.id !== activeId);
  const index = target.overId ? siblings.findIndex((item) => item.id === target.overId) : -1;
  if (index === -1) return siblings.length;
  return target.position === "before" ? index : index + 1;
};

/** True when dropping would leave the item exactly where it is (same container). */
export const isNoopDrop = (ordered: readonly { id: string }[], activeId: string, target: DropTarget) => {
  const current = ordered.findIndex((item) => item.id === activeId);
  if (current === -1) return false;
  return dropIndex(ordered, activeId, target) === current;
};

/** Reordered copy with `item` placed at the drop target (used for optimistic updates). */
export const applyDrop = <T extends { id: string }>(ordered: readonly T[], item: T, target: DropTarget): T[] => {
  const index = dropIndex(ordered, item.id, target);
  const siblings = ordered.filter((entry) => entry.id !== item.id);
  return [...siblings.slice(0, index), item, ...siblings.slice(index)];
};

/** Before/after from the pointer position relative to the hovered element's vertical middle. */
export const positionFromRects = (
  pointerY: number,
  overRect: { top: number; height: number }
): DropPosition => (pointerY < overRect.top + overRect.height / 2 ? "before" : "after");
