import { createContext, useContext } from "react";

import type { TaskSummary } from "@/contracts/work";

export type InlineEditorKind = "status" | "priority" | "assignees" | "due" | "start" | "menu";

export type RowMenuAction = {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type InlineEditorRequest = {
  kind: InlineEditorKind;
  task: TaskSummary;
  anchor: HTMLElement;
  /** Only for kind "menu". */
  actions?: RowMenuAction[];
};

/**
 * One popover per view edits any cell (status, priority, assignees, dates, row menu). Rows stay
 * plain buttons — no per-row popover roots — which keeps large virtualized lists light.
 */
export const InlineEditorContext = createContext<((request: InlineEditorRequest) => void) | null>(null);

export const useInlineEditor = () => useContext(InlineEditorContext);
