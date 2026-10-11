import { cn } from "cn";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Trash2,
  X
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatBytes,
  openAttachment,
  useAttachmentSource,
  useAttachmentUrl,
  type AttachmentLike,
  type UploadItem
} from "../../attachments";
import { relativeTime } from "../../time";

const FileTypeIcon = ({ mime, name }: { mime: string; name: string }) => {
  const props = { className: "size-4", "aria-hidden": true } as const;
  if (mime.startsWith("image/")) return <FileImage {...props} />;
  if (mime.startsWith("video/")) return <FileVideo {...props} />;
  if (mime.startsWith("audio/")) return <FileAudio {...props} />;
  if (/zip|rar|7z|tar|gzip/.test(mime) || /\.(zip|rar|7z|gz)$/i.test(name)) return <FileArchive {...props} />;
  if (/sheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/i.test(name)) return <FileSpreadsheet {...props} />;
  if (/pdf|word|text|document/.test(mime)) return <FileText {...props} />;
  return <File {...props} />;
};

/** Image thumbnail loaded through a short-lived signed URL. */
export const ImageThumb = ({
  attachment,
  onOpen,
  onDelete,
  size = "md"
}: {
  attachment: AttachmentLike;
  onOpen: () => void;
  onDelete?: (() => void) | undefined;
  size?: "sm" | "md";
}) => {
  const url = useAttachmentUrl(attachment.id);
  return (
    <div className={cn("group/thumb relative overflow-hidden rounded-lg border bg-muted", size === "md" ? "aspect-[4/3]" : "size-20")}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Xem ảnh ${attachment.fileName}`}
        className="block size-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {url.data ? (
          <img
            src={url.data}
            alt={attachment.fileName}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-200 group-hover/thumb:scale-[1.03] motion-reduce:transition-none"
          />
        ) : url.isError ? (
          <span className="flex size-full items-center justify-center text-foreground-subtle">
            <FileImage className="size-5" />
          </span>
        ) : (
          <Skeleton className="size-full rounded-none" />
        )}
      </button>
      {size === "md" ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pt-4 pb-1 text-[11px] text-white opacity-0 transition-opacity duration-150 group-hover/thumb:opacity-100">
          {attachment.fileName}
        </span>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          aria-label={`Xóa ${attachment.fileName}`}
          onClick={onDelete}
          className="absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-md bg-black/55 text-white opacity-0 outline-none group-hover/thumb:opacity-100 hover:bg-black/75 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-8 pointer-coarse:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
};

/** File row with type icon, size, uploader, download and optional delete. */
export const FileRow = ({
  attachment,
  onDelete,
  compact = false
}: {
  attachment: AttachmentLike;
  onDelete?: (() => void) | undefined;
  compact?: boolean;
}) => {
  const source = useAttachmentSource();
  return (
    <div className={cn("group/file flex items-center gap-2.5 rounded-lg border bg-surface px-2.5", compact ? "h-10" : "h-12")}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground-muted">
        <FileTypeIcon mime={attachment.mimeType} name={attachment.fileName} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => void openAttachment(attachment, source)}
          className="truncate rounded text-left text-[13px] font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          title={attachment.fileName}
        >
          {attachment.fileName}
        </button>
        {!compact ? (
          <span className="truncate text-[11px] text-foreground-subtle">
            {formatBytes(attachment.sizeBytes)}
            {attachment.uploadedBy ? ` · ${attachment.uploadedBy.displayName}` : ""} · {relativeTime(attachment.createdAt)}
          </span>
        ) : null}
      </span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Tải xuống ${attachment.fileName}`} onClick={() => void openAttachment(attachment, source)} />
          }
        >
          <Download />
        </TooltipTrigger>
        <TooltipContent>Tải xuống</TooltipContent>
      </Tooltip>
      {onDelete ? (
        <Button variant="ghost" size="icon-sm" aria-label={`Xóa ${attachment.fileName}`} onClick={onDelete} className="text-foreground-subtle hover:text-danger">
          <Trash2 />
        </Button>
      ) : null}
    </div>
  );
};

/** In-flight upload with progress (and retry hint on failure). */
export const UploadRow = ({ item, onRemove }: { item: UploadItem; onRemove: () => void }) => (
  <div
    className={cn(
      "flex h-12 items-center gap-2.5 rounded-lg border bg-surface px-2.5",
      item.status === "error" && "border-danger/40 bg-danger-soft/40"
    )}
  >
    {item.previewUrl ? (
      <img src={item.previewUrl} alt="" className="size-7 shrink-0 rounded-md object-cover" />
    ) : (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground-muted">
        <File className="size-4" aria-hidden="true" />
      </span>
    )}
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="truncate text-[13px] font-medium">{item.name}</span>
      {item.status === "error" ? (
        <span className="truncate text-[11px] text-danger">{item.error}</span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)} aria-label={`Đang tải ${item.name}`}>
            <span className="block h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${Math.max(4, item.progress * 100)}%` }} />
          </span>
          <span className="w-9 text-right text-[11px] text-foreground-subtle tabular-nums">{Math.round(item.progress * 100)}%</span>
        </span>
      )}
    </span>
    <Button variant="ghost" size="icon-sm" aria-label={item.status === "uploading" ? `Hủy tải ${item.name}` : `Bỏ ${item.name}`} onClick={onRemove}>
      <X />
    </Button>
  </div>
);

/** Full-size image viewer with previous / next and download. */
export const ImageLightbox = ({
  images,
  index,
  onIndexChange,
  onClose
}: {
  images: AttachmentLike[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) => {
  const current = index === null ? undefined : images[index];
  return (
    <Dialog open={current !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        mobileLayout="center"
        className="max-h-[92dvh] w-[min(64rem,94vw)] max-w-none gap-0 overflow-hidden bg-surface p-0 sm:max-w-none"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (index === null) return;
          if (event.key === "ArrowRight" && index < images.length - 1) onIndexChange(index + 1);
          if (event.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
          if (event.key === "Escape") onClose();
        }}
      >
        {current ? <LightboxBody attachment={current} position={`${(index ?? 0) + 1}/${images.length}`} onClose={onClose} /> : null}
        {current && index !== null && images.length > 1 ? (
          <>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Ảnh trước"
              disabled={index === 0}
              onClick={() => onIndexChange(index - 1)}
              className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full shadow-md"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Ảnh sau"
              disabled={index === images.length - 1}
              onClick={() => onIndexChange(index + 1)}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full shadow-md"
            >
              <ChevronRight />
            </Button>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const LightboxBody = ({ attachment, position, onClose }: { attachment: AttachmentLike; position: string; onClose: () => void }) => {
  const url = useAttachmentUrl(attachment.id);
  const source = useAttachmentSource();
  const [loaded, setLoaded] = useState<string | null>(null);
  return (
    <>
      <div className="flex h-11 items-center gap-2 border-b px-3">
        <DialogTitle className="min-w-0 flex-1 truncate text-sm">{attachment.fileName}</DialogTitle>
        <DialogDescription className="sr-only">Xem ảnh đính kèm</DialogDescription>
        <span className="text-xs text-foreground-muted tabular-nums">{position}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Tải xuống" onClick={() => void openAttachment(attachment, source)}>
          <Download />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Đóng" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="relative flex min-h-[40vh] items-center justify-center bg-canvas">
        {url.data ? (
          <img
            key={url.data}
            src={url.data}
            alt={attachment.fileName}
            onLoad={() => setLoaded(url.data ?? null)}
            className={cn(
              "max-h-[calc(92dvh-2.75rem)] max-w-full object-contain transition-opacity duration-200",
              loaded === url.data ? "opacity-100" : "opacity-0"
            )}
          />
        ) : null}
        {loaded !== url.data ? <Skeleton className="absolute inset-8 rounded-lg" /> : null}
      </div>
    </>
  );
};
