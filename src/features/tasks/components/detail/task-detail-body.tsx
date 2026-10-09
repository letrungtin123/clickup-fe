import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Lock, Upload } from "lucide-react";
import { useCallback, useRef, useState, type DragEvent } from "react";

import type { Attachment, TaskDetail } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";
import { qk } from "@/lib/query-keys";

import { useUploads } from "../../attachments";
import { reconcileTask } from "../../cache";
import { markLocalTaskMutation } from "../../local-mutations";
import { ConfirmHost } from "../confirm-host";
import { InlineEditorHost } from "../inline-editor-host";
import { AttachmentsSection } from "./attachments-section";
import { CommentComposer } from "./composer";
import { DescriptionSection } from "./description";
import { DetailProperties } from "./properties";
import { SubtasksSection } from "./subtasks";
import { TimelineSection } from "./timeline";
import { TitleEditor } from "./title-editor";

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

/** Scrollable detail body + docked comment composer. Lazy-loaded by TaskDetailPanel. */
const TaskDetailBody = ({ task }: { task: TaskDetail }) => {
  const client = useQueryClient();
  const session = useSessionContext();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const caps = task.capabilities;
  const canUpload = caps.canEdit || caps.canComment;
  const [dragDepth, setDragDepth] = useState(0);

  const onUploaded = useCallback(
    (attachment: Attachment) => {
      const detail = client.getQueryData<TaskDetail>(qk.task(attachment.taskId));
      if (!detail || detail.attachments.some((item) => item.id === attachment.id)) return;
      markLocalTaskMutation(attachment.taskId);
      const next = { ...detail, attachments: [attachment, ...detail.attachments], attachmentCount: detail.attachmentCount + 1 };
      client.setQueryData(qk.task(attachment.taskId), next);
      reconcileTask(client, next, { selfId: session.user.id });
    },
    [client, session.user.id]
  );
  const uploads = useUploads(task.id, "task", onUploaded);

  const scrollToEnd = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));

  return (
    <InlineEditorHost>
      <ConfirmHost />
      <div
        className="absolute inset-0 flex flex-col"
        onDragEnter={(event) => {
          if (canUpload && hasFiles(event)) setDragDepth((depth) => depth + 1);
        }}
        onDragLeave={(event) => {
          if (canUpload && hasFiles(event)) setDragDepth((depth) => Math.max(0, depth - 1));
        }}
        onDragOver={(event) => {
          if (canUpload && hasFiles(event)) event.preventDefault();
        }}
        onDrop={(event) => {
          setDragDepth(0);
          if (!canUpload || event.defaultPrevented || !hasFiles(event)) return;
          event.preventDefault();
          uploads.start(Array.from(event.dataTransfer.files));
        }}
      >
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-6 px-5 pt-5 pb-6">
            <div className="flex flex-col gap-3">
              <TitleEditor task={task} />
              {!caps.canEdit ? (
                <p className="flex items-center gap-1.5 text-xs text-foreground-muted">
                  <Lock className="size-3" aria-hidden="true" />
                  Bạn đang xem ở chế độ chỉ đọc.
                </p>
              ) : null}
              <DetailProperties task={task} />
            </div>
            <DescriptionSection key={task.id} task={task} />
            <SubtasksSection task={task} />
            <AttachmentsSection task={task} uploads={uploads} canUpload={canUpload} />
          </div>
          <TimelineSection task={task} />
        </div>
        {caps.canComment ? (
          <div className="shrink-0 border-t bg-surface/95 px-4 pt-3 pb-[max(0.75rem,var(--safe-bottom))] backdrop-blur">
            <CommentComposer key={task.id} task={task} onPosted={scrollToEnd} />
          </div>
        ) : (
          <p className="shrink-0 border-t px-5 py-3 text-xs text-foreground-muted">Bạn không có quyền bình luận trong công việc này.</p>
        )}
        <div
          aria-hidden={dragDepth === 0}
          className={cn(
            "pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-brand bg-brand-soft/80 backdrop-blur-sm transition-opacity duration-150",
            dragDepth > 0 ? "opacity-100" : "opacity-0"
          )}
        >
          <span className="flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-medium shadow-md">
            <Upload className="size-4 text-brand-text" />
            Thả tệp để đính kèm vào {task.key}
          </span>
        </div>
      </div>
    </InlineEditorHost>
  );
};

export default TaskDetailBody;
