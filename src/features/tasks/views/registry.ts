import { KanbanSquare, List as ListIcon, Table2, type LucideIcon } from "lucide-react";
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

import type { List, Project } from "@/contracts/work";

/**
 * Work views (PD-003). The list route mounts `taskViews[view].component` with these props inside a
 * Suspense boundary whose fallback is `ViewSkeleton`. Replace the placeholder modules in place.
 */
export type TaskViewProps = {
  project: Project;
  list: List;
  /** Opens the right-hand detail panel (`?task=`). */
  openTask: (taskId: string) => void;
};

export type TaskViewKey = "list" | "board" | "table";

type TaskViewDefinition = {
  label: string;
  icon: LucideIcon;
  component: LazyExoticComponent<ComponentType<TaskViewProps>>;
};

export const taskViews: Record<TaskViewKey, TaskViewDefinition> = {
  list: { label: "Danh sách", icon: ListIcon, component: lazy(() => import("./list-view")) },
  board: { label: "Bảng", icon: KanbanSquare, component: lazy(() => import("./board-view")) },
  table: { label: "Bảng tính", icon: Table2, component: lazy(() => import("./table-view")) }
};

export const taskViewKeys = Object.keys(taskViews) as TaskViewKey[];

export const parseTaskView = (value: string | null): TaskViewKey =>
  value === "board" || value === "table" ? value : "list";
