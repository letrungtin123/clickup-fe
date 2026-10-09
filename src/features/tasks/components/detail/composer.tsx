import { cn } from "cn";
import { Paperclip, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { isEmptyDoc } from "@/components/shared/rich-text/helpers";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/shared/rich-text/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RichTextDoc } from "@/contracts/rich-text";
import type { TaskDetail } from "@/contracts/work";
import { useInFlightGuard } from "@/hooks/use-in-flight-guard";
import { modKeyLabel } from "@/lib/keyboard";

import { useUploads } from "../../attachments";
import { useCreateComment, useMentionSource } from "../../hooks";
import { UploadRow } from "./attachment-tiles";

/** Unsent drafts survive switching tasks / closing the panel within the session. */
const drafts = new Map<string, RichTextDoc>();

type ComposerProps = {
  task: TaskDetail;
  parentCommentId?: string | undefined;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  onPosted?: () => void;
  onCancel?: () => void;
};

/** Comment / reply composer: rich text, @mentions, pasted or picked files (sent as attachmentIds). */
export const CommentComposer = ({
  task,
  parentCommentId,
  placeholder = "Viết bình luận… Gõ @ để nhắc tên",
  autoFocus = false,
  compact = false,
  onPosted,
  onCancel
}: ComposerProps) => {
  const draftKey = parentCommentId ? `${task.id}:${parentCommentId}` : task.id;
  const editor = useRef<RichTextEditorHandle | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [initial] = useState(() => drafts.get(draftKey) ?? null);
  const [empty, setEmpty] = useState(() => isEmptyDoc(initial));
  const latest = useRef<RichTextDoc | null>(initial);
  const uploads = useUploads(task.id, "comment");
  const create = useCreateComment(task.id);
  const guard = useInFlightGuard();
  const mentionSource = useMentionSource(task.projectId);

  useEffect(
    () => () => {
      const doc = latest.current;
      if (doc && !isEmptyDoc(doc)) drafts.set(draftKey, doc);
      else drafts.delete(draftKey);
    },
    [draftKey]
  );

  const send = (doc?: RichTextDoc) => {
    // A second Ctrl+Enter / click while the first post is in flight is ignored (BUG-WK-15).
    if (guard.active) return;
    const body = doc ?? editor.current?.getDoc();
    if (!body || isEmptyDoc(body)) {
      editor.current?.focus();
      return;
    }
    if (uploads.uploading) {
      toast("Đang tải tệp lên — gửi lại khi tải xong nhé.");
      return;
    }
    if (!guard.tryEnter()) return;
    const attachmentIds = uploads.items.flatMap((item) => (item.status === "done" && item.attachment ? [item.attachment.id] : []));
    create.mutate(
      { body, parentCommentId: parentCommentId ?? null, attachmentIds },
      {
        onSuccess: () => {
          editor.current?.clear();
          latest.current = null;
          drafts.delete(draftKey);
          uploads.clear();
          setEmpty(true);
          onPosted?.();
        },
        onSettled: guard.release
      }
    );
  };

  const failed = uploads.items.some((item) => item.status === "error");

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-surface shadow-xs transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25",
        compact && "rounded-lg"
      )}
    >
      <RichTextEditor
        ref={editor}
        variant="comment"
        value={initial}
        placeholder={placeholder}
        mentionSource={mentionSource}
        autoFocus={autoFocus}
        disabled={create.isPending}
        onSubmit={send}
        onChange={(doc) => {
          latest.current = doc;
          setEmpty(isEmptyDoc(doc));
        }}
        onPasteFiles={uploads.start}
        contentClassName={cn("px-3 py-2", compact ? "min-h-9 max-h-40" : "min-h-11 max-h-56")}
        aria-label={parentCommentId ? "Trả lời bình luận" : "Viết bình luận"}
      />
      {uploads.items.length > 0 ? (
        <div className="flex flex-col gap-1.5 px-2 pb-1.5">
          {uploads.items.map((item) =>
            item.status === "done" ? (
              <span key={item.id} className="inline-flex h-8 max-w-full items-center gap-2 self-start rounded-md border bg-muted/50 px-2 text-xs">
                {item.previewUrl ? <img src={item.previewUrl} alt="" className="size-5 rounded object-cover" /> : <Paperclip className="size-3.5 text-foreground-muted" />}
                <span className="truncate">{item.name}</span>
                <button
                  type="button"
                  aria-label={`Bỏ ${item.name}`}
                  onClick={() => uploads.remove(item.id)}
                  className="inline-flex size-5 items-center justify-center rounded text-foreground-subtle hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : (
              <UploadRow key={item.id} item={item} onRemove={() => uploads.remove(item.id)} />
            )
          )}
        </div>
      ) : null}
      <div className="flex items-center gap-1 px-1.5 pb-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Đính kèm tệp"
                onClick={() => fileInput.current?.click()}
                className="text-foreground-muted"
              />
            }
          >
            <Paperclip />
          </TooltipTrigger>
          <TooltipContent>Đính kèm tệp (hoặc dán / kéo thả)</TooltipContent>
        </Tooltip>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            uploads.start(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <span className="ml-1 hidden truncate text-[11px] text-foreground-subtle sm:inline">
          {failed ? "Có tệp tải lên lỗi — bỏ tệp đó rồi gửi lại" : `${modKeyLabel()} + Enter để gửi`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Hủy
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => send()}
            disabled={empty || create.isPending || uploads.uploading}
            aria-label={parentCommentId ? "Gửi trả lời" : "Gửi bình luận"}
          >
            {create.isPending ? <Spinner /> : <SendHorizontal />}
            {parentCommentId ? "Trả lời" : "Gửi"}
          </Button>
        </div>
      </div>
    </div>
  );
};
