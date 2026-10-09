import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragMoveEvent,
  type DragOverEvent
} from "@dnd-kit/core";

import type { TaskSummary } from "@/contracts/work";
import { createControlAwareSensors } from "@/lib/dnd-sensors";

import { positionFromRects } from "./placement";
import type { DropIndicator } from "./view-stores";

/**
 * Drag & drop plumbing shared by the List and Board views. Rows/cards are droppables (`kind: "row"`)
 * inside group/column droppables (`kind: "group"`); we show an insertion line instead of live
 * re-sorting, which stays robust with virtualized, paginated groups.
 */

export type DragData = { kind: "task"; task: TaskSummary; groupId: string };
export type DropData = { kind: "row" | "group"; groupId: string };

export const groupDroppableId = (groupId: string) => `group:${groupId}`;

const pointerClientY = (event: Event | null) => {
  if (!event) return 0;
  if ("clientY" in event && typeof event.clientY === "number") return event.clientY;
  if ("touches" in event) {
    const touches = (event as TouchEvent).touches;
    const changed = (event as TouchEvent).changedTouches;
    return touches[0]?.clientY ?? changed[0]?.clientY ?? 0;
  }
  return 0;
};

export const currentPointerY = (event: Pick<DragMoveEvent, "activatorEvent" | "delta">) =>
  pointerClientY(event.activatorEvent) + event.delta.y;

/** Rows win over their containing group; fall back to the nearest droppable. */
export const taskCollisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const rows = within.filter((collision) => !String(collision.id).startsWith("group:"));
  if (rows.length > 0) return rows;
  if (within.length > 0) return within;
  return closestCenter(args);
};

export const dropIndicatorFrom = (event: DragMoveEvent | DragOverEvent): DropIndicator | null => {
  const over = event.over;
  const data = over?.data.current as DropData | undefined;
  if (!over || !data) return null;
  if (data.kind === "group") return { groupId: data.groupId, overId: null, position: "after" };
  if (String(over.id) === String(event.active.id)) {
    return { groupId: data.groupId, overId: String(over.id), position: "before" };
  }
  return {
    groupId: data.groupId,
    overId: String(over.id),
    position: positionFromRects(currentPointerY(event), over.rect)
  };
};

/** Drag sensors for List/Board rows and cards (see lib/dnd-sensors). */
export const { MouseSensor: TaskMouseSensor, TouchSensor: TaskTouchSensor } =
  createControlAwareSensors(
    "button, a[href], input, textarea, select, [contenteditable='true'], [role='button'], [role='menuitem'], [data-no-drag]"
  );
