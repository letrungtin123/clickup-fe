import { Paperclip, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { TaskDetail } from "@/contracts/work";

import type { useUploads } from "../../attachments";
import { useDeleteAttachment } from "../../attachment-actions";
import { FileRow, ImageLightbox, ImageThumb, UploadRow } from "./attachment-tiles";

type Uploads = ReturnType<typeof useUploads>;

export const AttachmentsSection = ({
  task,
  uploads,
  canUpload
}: {
  task: TaskDetail;
  uploads: Uploads;
  canUpload: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const remove = useDeleteAttachment(task);
  const images = task.attachments.filter((attachment) => attachment.isImage);
  const files = task.attachments.filter((attachment) => !attachment.isImage);
  const pending = uploads.items.filter((item) => item.status !== "done");
  const empty = task.attachments.length === 0 && pending.length === 0;
  // Row counters (attachmentCount) include files attached through comments; the list does not.
  // (The detail lists at most 100 files, so the difference is only meaningful below that.)
  const inComments = task.attachments.length < 100 ? Math.max(0, task.attachmentCount - task.attachments.length) : 0;

  if (empty && !canUpload) return null;

  return (
    <section aria-labelledby="task-attachments-heading" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 id="task-attachments-heading" className="flex items-center gap-2 text-[13px] font-semibold">
          <Paperclip className="size-3.5 text-foreground-muted" aria-hidden="true" />
          Tệp đính kèm
        </h3>
        {/* The count is the list below; files sent with comments live in the timeline (WK-54). */}
        {task.attachments.length > 0 ? (
          <span className="text-xs text-foreground-muted tabular-nums">{task.attachments.length}</span>
        ) : null}
        {inComments > 0 ? (
          <span className="text-[11px] text-foreground-subtle tabular-nums">· {inComments} trong bình luận</span>
        ) : null}
        {canUpload ? (
          <>
            <Button variant="ghost" size="xs" className="ml-auto text-foreground-muted" onClick={() => inputRef.current?.click()}>
              <Upload />
              Tải lên
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                uploads.start(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </>
        ) : null}
      </div>

      {empty ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-[13px] text-foreground-muted outline-none transition-colors duration-150 hover:border-border-strong hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Upload className="size-4" aria-hidden="true" />
          Kéo thả tệp vào đây hoặc bấm để chọn
          <span className="text-[11px] text-foreground-subtle">Ảnh hiển thị xem trước · tối đa 50 MB mỗi tệp</span>
        </button>
      ) : null}

      {pending.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {pending.map((item) => (
            <UploadRow key={item.id} item={item} onRemove={() => uploads.remove(item.id)} />
          ))}
        </div>
      ) : null}

      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((attachment, index) => (
            <ImageThumb
              key={attachment.id}
              attachment={attachment}
              onOpen={() => setViewing(index)}
              onDelete={attachment.canDelete ? () => void remove(attachment) : undefined}
            />
          ))}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {files.map((attachment) => (
            <FileRow key={attachment.id} attachment={attachment} onDelete={attachment.canDelete ? () => void remove(attachment) : undefined} />
          ))}
        </div>
      ) : null}

      <ImageLightbox images={images} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />
    </section>
  );
};
