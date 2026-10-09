import { useCallback } from "react";
import { toast } from "sonner";

import type { TaskStatus, TaskSummary, UserRef } from "@/contracts/work";

import { confirmAction } from "./confirm-store";
import { useUpdateTask } from "./hooks";

type StatusRef = Pick<TaskStatus, "id" | "name" | "color" | "category">;

/** PD-007 WARN mode: completing a parent with open subtasks asks first. */
export const confirmParentCompletion = async (task: TaskSummary, status: StatusRef) => {
  if (status.category === "active" || task.status.category !== "active" || task.openSubtaskCount === 0) {
    return true;
  }
  return confirmAction({
    title: "Hoàn thành khi còn việc con?",
    description: `${task.key} còn ${task.openSubtaskCount} việc con chưa xong. Bạn vẫn muốn chuyển sang “${status.name}”?`,
    confirmLabel: "Vẫn hoàn thành",
    cancelLabel: "Để sau"
  });
};

export const toStatusRef = (status: StatusRef): TaskSummary["status"] => ({
  id: status.id,
  name: status.name,
  color: status.color,
  category: status.category
});

/** Field edits shared by rows, cards, table cells, the detail panel and My tasks. */
export const useTaskActions = () => {
  const update = useUpdateTask();
  const mutate = update.mutate;

  const changeStatus = useCallback(
    async (task: TaskSummary, status: StatusRef) => {
      if (status.id === task.status.id) return;
      if (!(await confirmParentCompletion(task, status))) return;
      mutate({ task, patch: { statusId: status.id }, optimistic: { status: toStatusRef(status) } });
    },
    [mutate]
  );

  const rename = useCallback(
    (task: TaskSummary, title: string) => {
      const next = title.trim();
      if (!next || next === task.title) return;
      if (next.length > 240) {
        toast.error("Tên công việc tối đa 240 ký tự.");
        return;
      }
      mutate({ task, patch: { title: next } });
    },
    [mutate]
  );

  const setPriority = useCallback(
    (task: TaskSummary, priority: TaskSummary["priority"]) => {
      if (priority !== task.priority) mutate({ task, patch: { priority } });
    },
    [mutate]
  );

  const setDates = useCallback(
    (task: TaskSummary, dates: { startAt?: string | null; dueAt?: string | null }) => {
      const startAt = dates.startAt === undefined ? task.startAt : dates.startAt;
      const dueAt = dates.dueAt === undefined ? task.dueAt : dates.dueAt;
      if (startAt && dueAt && new Date(dueAt) < new Date(startAt)) {
        toast.error("Hạn chót phải sau hoặc trùng ngày bắt đầu.");
        return;
      }
      mutate({ task, patch: dates });
    },
    [mutate]
  );

  const toggleAssignee = useCallback(
    (task: TaskSummary, user: UserRef) => {
      const assigned = task.assignees.some((entry) => entry.id === user.id);
      mutate({
        task,
        patch: { assignees: assigned ? { add: [], remove: [user.id] } : { add: [user.id], remove: [] } },
        optimistic: {
          assignees: assigned ? task.assignees.filter((entry) => entry.id !== user.id) : [...task.assignees, user]
        }
      });
    },
    [mutate]
  );

  return { changeStatus, rename, setPriority, setDates, toggleAssignee, pending: update.isPending };
};
