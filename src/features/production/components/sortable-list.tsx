import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

import { moveItem } from "@/lib/ordering";

export type DragHandleProps = {
  label: string;
  disabled?: boolean;
};

type SortableListProps<T extends { id: string }> = {
  items: readonly T[];
  onReorder: (ordered: T[]) => void;
  renderItem: (item: T, handle: (props: DragHandleProps) => ReactNode) => ReactNode;
  disabled?: boolean;
  "aria-label": string;
  className?: string;
  itemClassName?: string | ((item: T) => string);
};

/**
 * Vertical drag-and-drop list (pointer + keyboard: focus the grip, Space, arrows, Space) used to
 * order processes, shifts, statuses and custom fields.
 */
export const SortableList = <T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  disabled = false,
  className,
  itemClassName,
  ...aria
}: SortableListProps<T>) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(moveItem(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul {...aria} className={cn("divide-y", className)}>
          {items.map((item) => (
            <SortableRow
              key={item.id}
              id={item.id}
              disabled={disabled}
              className={typeof itemClassName === "function" ? itemClassName(item) : itemClassName}
            >
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
};

const SortableRow = ({
  id,
  disabled,
  className,
  children
}: {
  id: string;
  disabled: boolean;
  className?: string | undefined;
  children: (handle: (props: DragHandleProps) => ReactNode) => ReactNode;
}) => {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id,
    disabled
  });
  const handle = ({ label, disabled: handleDisabled }: DragHandleProps) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled || handleDisabled}
      className="inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-foreground-subtle outline-none hover:bg-surface-hover hover:text-foreground-muted focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-3.5" aria-hidden="true" />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative bg-surface",
        isDragging && "z-10 rounded-lg shadow-lg ring-1 ring-brand/30",
        className
      )}
    >
      {children(handle)}
    </li>
  );
};
