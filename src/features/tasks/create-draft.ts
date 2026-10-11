import { isEmptyDoc, type RichTextDocLike } from "@/components/shared/rich-text/helpers";
import type { TaskPriority } from "@/contracts/work";

/** What the "+ Công việc" dialog holds before it is submitted. */
export type CreateTaskDraft = {
  title: string;
  description: RichTextDocLike | null;
  statusId: string | undefined;
  priority: TaskPriority;
  assigneeIds: readonly string[];
  startAt: string | null;
  dueAt: string | null;
};

/**
 * Has the person put anything into the dialog that closing would throw away (P3)? Whitespace-only
 * text and an empty description do not count; any picked property does.
 */
export const isCreateTaskDraftDirty = (draft: CreateTaskDraft, initialStatusId?: string) =>
  draft.title.trim() !== "" ||
  !isEmptyDoc(draft.description) ||
  draft.assigneeIds.length > 0 ||
  draft.priority !== "normal" ||
  draft.startAt !== null ||
  draft.dueAt !== null ||
  (draft.statusId !== undefined && draft.statusId !== initialStatusId);
