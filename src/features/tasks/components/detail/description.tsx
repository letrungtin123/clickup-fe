import { cn } from "cn";
import { Check, CircleAlert, FileText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { prepareDoc } from "@/components/shared/rich-text/helpers";
import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { RichTextView } from "@/components/shared/rich-text/rich-text-view";
import { Spinner } from "@/components/ui/spinner";
import type { RichTextDoc } from "@/contracts/rich-text";
import type { TaskDetail } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";

import { useMentionSource, useUpdateTask } from "../../hooks";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Idle autosave (blur saves immediately); long enough to avoid a history entry per pause. */
const saveDelayMs = 4000;

/**
 * Description: rich text with @mentions, saved on blur and after a short idle pause. Server
 * refreshes never overwrite what is being typed (the editor only adopts external values when not
 * focused).
 */
export const DescriptionSection = ({ task }: { task: TaskDetail }) => {
  const session = useSessionContext();
  const update = useUpdateTask();
  const mutate = update.mutate;
  const mentionSource = useMentionSource(task.projectId);
  const [state, setState] = useState<SaveState>("idle");
  const pending = useRef<RichTextDoc | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(task.description ?? null));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  });

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const doc = pending.current;
    if (!doc) return;
    pending.current = null;
    const prepared = prepareDoc(doc, "description", { allowEmpty: true });
    if (!prepared.ok) {
      setState("error");
      return;
    }
    const next = prepared.text.trim() ? prepared.doc : null;
    const serialized = JSON.stringify(next);
    if (serialized === lastSaved.current) {
      setState((current) => (current === "dirty" ? "idle" : current));
      return;
    }
    setState("saving");
    mutate(
      { task: taskRef.current, patch: { description: next } },
      {
        onSuccess: () => {
          lastSaved.current = serialized;
          setState(pending.current ? "dirty" : "saved");
        },
        onError: () => setState("error")
      }
    );
  }, [mutate]);

  // Never lose an unsaved draft when the panel closes or switches task.
  useEffect(() => () => flush(), [flush]);

  // Adopt server changes (e.g. another user's edit) as the new baseline.
  const serverJson = JSON.stringify(task.description ?? null);
  useEffect(() => {
    if (!pending.current) lastSaved.current = serverJson;
  }, [serverJson]);

  const editable = task.capabilities.canEdit;

  return (
    <section aria-labelledby="task-description-heading" className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h3 id="task-description-heading" className="flex items-center gap-2 text-[13px] font-semibold">
          <FileText className="size-3.5 text-foreground-muted" aria-hidden="true" />
          Mô tả
        </h3>
        <SaveIndicator state={state} />
      </div>
      {editable ? (
        <RichTextEditor
          variant="description"
          value={task.description}
          placeholder="Thêm mô tả… Gõ @ để nhắc tên đồng đội"
          mentionSource={mentionSource}
          toolbar
          toolbarClassName="scrollbar-none flex-nowrap overflow-x-auto"
          onChange={(doc) => {
            pending.current = doc;
            setState("dirty");
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(flush, saveDelayMs);
          }}
          onBlur={() => flush()}
          className={cn(
            "rounded-lg border border-transparent px-2.5 py-2 transition-colors duration-150",
            "hover:border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25",
            "[&_[role=toolbar]]:opacity-0 [&_[role=toolbar]]:transition-opacity [&:focus-within_[role=toolbar]]:opacity-100 [&:hover_[role=toolbar]]:opacity-100 pointer-coarse:[&_[role=toolbar]]:opacity-100"
          )}
          contentClassName="min-h-16"
          aria-label="Mô tả công việc"
        />
      ) : task.description ? (
        <RichTextView doc={task.description} selfId={session.user.id} className="px-2.5 py-1" />
      ) : (
        <p className="px-2.5 text-[13px] text-foreground-subtle">Chưa có mô tả.</p>
      )}
    </section>
  );
};

const SaveIndicator = ({ state }: { state: SaveState }) => {
  if (state === "idle") return null;
  return (
    <span className="flex items-center gap-1 text-[11px] text-foreground-subtle" role="status" aria-live="polite">
      {state === "saving" ? (
        <>
          <Spinner className="size-3" />
          Đang lưu…
        </>
      ) : state === "dirty" ? (
        "Chưa lưu"
      ) : state === "saved" ? (
        <>
          <Check className="size-3 text-success" />
          Đã lưu
        </>
      ) : (
        <span className="flex items-center gap-1 text-danger">
          <CircleAlert className="size-3" />
          Không lưu được — sửa lại hoặc thử lại
        </span>
      )}
    </span>
  );
};
