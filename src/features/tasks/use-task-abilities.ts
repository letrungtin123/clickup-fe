import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import type { Project, ProjectAccessLevel, TaskSummary } from "@/contracts/work";
import { P, accessAtLeast } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks";
import { Copy, ExternalLink, Hash, PencilLine, Trash2 } from "lucide-react";

import { useDeleteTask } from "./hooks";
import type { RowMenuAction } from "./inline-editor-context";
import { taskHref } from "./use-task-panel";

export type TaskAbilities = {
  canEdit: boolean;
  canAssign: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canComment: boolean;
};

/**
 * UX gates for task actions in list contexts (summaries carry no capabilities). Project access +
 * RBAC, like the API; the detail panel uses the task's own `capabilities` instead.
 */
export const useTaskAbilities = (
  project: { myAccess: ProjectAccessLevel; capabilities?: Project["capabilities"] } | undefined
): TaskAbilities => {
  const { can } = usePermissions();
  return useMemo(() => {
    const submit = accessAtLeast(project?.myAccess, "submit");
    return {
      canEdit: submit && can(P.TaskUpdate),
      canAssign: submit && can(P.TaskAssign),
      canCreate: project?.capabilities?.canCreateTask ?? (submit && can(P.TaskCreate)),
      canDelete: submit && can(P.TaskDelete),
      canComment: submit && can(P.TaskComment)
    };
  }, [can, project?.myAccess, project?.capabilities?.canCreateTask]);
};

export const copyText = (text: string, success: string) => {
  void navigator.clipboard
    ?.writeText(text)
    .then(() => toast.success(success))
    .catch(() => toast.error("Không sao chép được"));
};

export const taskUrl = (task: Pick<TaskSummary, "id" | "projectId" | "listId">) =>
  `${window.location.origin}${taskHref(task)}`;

/** Row "…" menu actions shared by list rows, board cards, table rows. */
export const useRowMenuActions = (abilities: TaskAbilities, openTask: (taskId: string) => void) => {
  const removeTask = useDeleteTask().mutate;
  return useCallback(
    (task: TaskSummary, extra: { onRename?: () => void } = {}): RowMenuAction[] => [
      { key: "open", label: "Mở chi tiết", icon: ExternalLink, onSelect: () => openTask(task.id) },
      ...(extra.onRename && abilities.canEdit
        ? [{ key: "rename", label: "Đổi tên", icon: PencilLine, onSelect: extra.onRename }]
        : []),
      { key: "copy-link", label: "Sao chép liên kết", icon: Copy, onSelect: () => copyText(taskUrl(task), "Đã sao chép liên kết") },
      { key: "copy-key", label: `Sao chép mã ${task.key}`, icon: Hash, onSelect: () => copyText(task.key, `Đã sao chép ${task.key}`) },
      ...(abilities.canDelete
        ? [{ key: "delete", label: "Chuyển vào thùng rác", icon: Trash2, destructive: true, onSelect: () => removeTask(task) }]
        : [])
    ],
    [abilities.canDelete, abilities.canEdit, openTask, removeTask]
  );
};
