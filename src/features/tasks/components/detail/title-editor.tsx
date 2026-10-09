import { cn } from "cn";
import { useLayoutEffect, useRef, useState } from "react";

import type { TaskDetail } from "@/contracts/work";

import { useTaskActions } from "../../use-task-actions";

/** Inline title: Enter / blur saves, Escape reverts. Server updates apply while not editing. */
export const TitleEditor = ({ task }: { task: TaskDetail }) => {
  const actions = useTaskActions();
  const editable = task.capabilities.canEdit;
  const [draft, setDraft] = useState(task.title);
  const [editing, setEditing] = useState(false);
  const [synced, setSynced] = useState(task.title);
  if (!editing && synced !== task.title) {
    setSynced(task.title);
    setDraft(task.title);
  }
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  const commit = () => {
    setEditing(false);
    const next = draft.replace(/\s+/g, " ").trim();
    if (!next) {
      setDraft(task.title);
      return;
    }
    if (next !== task.title) actions.rename(task, next);
  };

  if (!editable) {
    return (
      <h2 id="task-detail-title" className="text-lg leading-snug font-semibold tracking-[-0.01em] break-words">
        {task.title}
      </h2>
    );
  }

  return (
    <h2 id="task-detail-title" className="m-0">
      <textarea
        ref={ref}
        value={draft}
        rows={1}
        maxLength={240}
        aria-label="Tên công việc"
        spellCheck={false}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value.replace(/\n/g, " "))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(task.title);
            setEditing(false);
            requestAnimationFrame(() => ref.current?.blur());
          }
        }}
        className={cn(
          "-mx-2 block w-[calc(100%+1rem)] resize-none overflow-hidden rounded-md bg-transparent px-2 py-1 text-lg leading-snug font-semibold tracking-[-0.01em] outline-none transition-colors duration-100",
          "hover:bg-surface-hover focus:bg-surface-hover focus:ring-2 focus:ring-ring/40"
        )}
      />
    </h2>
  );
};
