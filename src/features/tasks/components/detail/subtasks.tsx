import { cn } from "cn";
import { ListTree } from "lucide-react";

import type { TaskDetail, TaskSummary } from "@/contracts/work";

import { useCreateTask } from "../../hooks";
import { useTaskPanel } from "../../use-task-panel";
import { QuickAdd } from "../quick-add";
import { AssigneesCell, DueCell, StatusCell } from "../task-cells";

const maxDepth = 7;

/** Direct subtasks with progress, status toggles, quick add and drill-in. */
export const SubtasksSection = ({ task }: { task: TaskDetail }) => {
  const { openTask } = useTaskPanel();
  const create = useCreateTask();
  const subtasks = task.subtasks;
  const done = subtasks.filter((item) => item.status.category !== "active").length;
  const total = Math.max(task.subtaskCount, subtasks.length);
  const depth = task.ancestors.length + 1;
  const canAdd = task.capabilities.canCreateSubtask && depth < maxDepth;
  const caps = task.capabilities;

  if (subtasks.length === 0 && !canAdd) return null;

  return (
    <section aria-labelledby="task-subtasks-heading" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 id="task-subtasks-heading" className="flex items-center gap-2 text-[13px] font-semibold">
          <ListTree className="size-3.5 text-foreground-muted" aria-hidden="true" />
          Việc con
        </h3>
        {total > 0 ? (
          <>
            <span className="text-xs text-foreground-muted tabular-nums">
              {done}/{total}
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Tiến độ việc con">
              <div className="h-full rounded-full bg-success transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
          </>
        ) : null}
      </div>
      {subtasks.length > 0 ? (
        <ul className="flex flex-col overflow-hidden rounded-lg border">
          {subtasks.map((subtask) => (
            <SubtaskRow key={subtask.id} task={subtask} editable={caps.canEdit} assignable={caps.canAssign} onOpen={() => openTask(subtask.id)} />
          ))}
        </ul>
      ) : null}
      {task.subtaskCount > subtasks.length ? (
        <p className="text-xs text-foreground-muted">Đang hiển thị {subtasks.length} việc con đầu tiên.</p>
      ) : null}
      {canAdd ? (
        <QuickAdd
          label="Thêm việc con"
          placeholder="Tên việc con… (Enter để tạo)"
          onCreate={(title) =>
            create.mutateAsync({
              projectId: task.projectId,
              input: { listId: task.listId, parentTaskId: task.id, title }
            })
          }
        />
      ) : task.capabilities.canCreateSubtask ? (
        <p className="text-xs text-foreground-subtle">Đã đạt độ sâu tối đa {maxDepth} cấp việc con.</p>
      ) : null}
    </section>
  );
};

const SubtaskRow = ({
  task,
  editable,
  assignable,
  onOpen
}: {
  task: TaskSummary;
  editable: boolean;
  assignable: boolean;
  onOpen: () => void;
}) => (
  <li
    className="group/sub flex h-9 cursor-default items-center gap-1.5 border-b px-1.5 last:border-b-0 hover:bg-surface-hover"
    onClick={onOpen}
  >
    <StatusCell task={task} editable={editable} />
    <span className="hidden shrink-0 font-mono text-[11px] text-foreground-subtle sm:inline">{task.key}</span>
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className={cn(
        "min-w-0 flex-1 truncate rounded text-left text-[13px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
        task.status.category !== "active" && "text-foreground-muted line-through decoration-foreground-subtle/60"
      )}
    >
      {task.title}
    </button>
    {task.subtaskCount > 0 ? (
      <span className="shrink-0 text-[11px] text-foreground-subtle tabular-nums">
        {task.subtaskCount - task.openSubtaskCount}/{task.subtaskCount}
      </span>
    ) : null}
    <AssigneesCell task={task} editable={assignable} max={2} />
    <DueCell task={task} editable={editable} showEmpty={false} />
  </li>
);
