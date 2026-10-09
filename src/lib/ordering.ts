import type { Placement } from "@/contracts/work";

/** Returns a copy of `items` with the element at `from` moved to index `to`. */
export const moveItem = <T>(items: readonly T[], from: number, to: number): T[] => {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) {
    next.splice(to, 0, moved);
  }
  return next;
};

/**
 * Neighbour-based placement for the element `id` in an already reordered array (contract: the server
 * derives the rank; `afterId` = right after that sibling, `beforeId` = right before it).
 */
export const placementFor = <T extends { id: string }>(
  ordered: readonly T[],
  id: string
): Placement | null => {
  const index = ordered.findIndex((item) => item.id === id);
  if (index === -1 || ordered.length < 2) {
    return null;
  }
  return {
    afterId: ordered[index - 1]?.id ?? null,
    beforeId: ordered[index + 1]?.id ?? null
  };
};
