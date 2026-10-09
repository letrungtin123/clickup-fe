import { cn } from "cn";
import { ChevronLeft, ChevronRight, Download, ImageOff } from "lucide-react";
import { memo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ChatAttachment } from "@/contracts/chat";

import { fetchAttachmentUrl, useAttachmentUrl } from "../hooks/use-attachments";
import { formatBytes } from "../model/files";
import { FileTypeIcon } from "./file-type-icon";

/** Images inline (signed URLs, lightbox on click) and other files as download chips. */
export const MessageAttachments = memo(function MessageAttachments({
  attachments,
  compact = false
}: {
  attachments: readonly ChatAttachment[];
  compact?: boolean;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const images = attachments.filter((attachment) => attachment.isImage);
  const files = attachments.filter((attachment) => !attachment.isImage);
  if (attachments.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {images.length > 0 ? (
        <div className={cn("flex flex-wrap gap-1.5", images.length === 1 && "block")}>
          {images.map((image, index) => (
            <InlineImage
              key={image.id}
              attachment={image}
              single={images.length === 1}
              compact={compact}
              onOpen={() => setLightbox(index)}
            />
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {files.map((file) => (
            <FileChip key={file.id} attachment={file} />
          ))}
        </div>
      ) : null}
      <Lightbox images={images} index={lightbox} onIndexChange={setLightbox} />
    </div>
  );
});

const InlineImage = ({
  attachment,
  single,
  compact,
  onOpen
}: {
  attachment: ChatAttachment;
  single: boolean;
  compact: boolean;
  onOpen: () => void;
}) => {
  const url = useAttachmentUrl(attachment.id);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Single images keep their aspect ratio (bounded); several images become square tiles.
  const box = single
    ? compact
      ? "max-w-[min(100%,16rem)]"
      : "max-w-[min(100%,24rem)]"
    : compact
      ? "size-24"
      : "size-32";

  if (url.isError || (url.data === null && !url.isPending) || failed) {
    return (
      <button
        type="button"
        onClick={() => {
          setFailed(false);
          void url.refetch();
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/40 px-3 text-xs text-foreground-muted outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          single ? "h-24 w-56" : box
        )}
      >
        <ImageOff className="size-4" aria-hidden="true" />
        <span className="max-w-full truncate">{attachment.fileName}</span>
        <span>Bấm để tải lại</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Xem ảnh ${attachment.fileName}`}
      className={cn(
        "relative block overflow-hidden rounded-lg border bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        box,
        single && "w-fit"
      )}
    >
      {!loaded ? (
        <Skeleton className={cn("rounded-none", single ? "h-40 w-56" : "absolute inset-0")} />
      ) : null}
      {url.data ? (
        <img
          src={url.data}
          alt={attachment.fileName}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "transition-opacity duration-200",
            single
              ? cn("block h-auto w-auto max-w-full", compact ? "max-h-48" : "max-h-72")
              : "size-full object-cover",
            loaded ? "opacity-100" : "absolute size-0 opacity-0"
          )}
        />
      ) : (
        <span className={cn("block", single ? "h-40 w-56" : "size-full")} />
      )}
    </button>
  );
};

const FileChip = ({ attachment }: { attachment: ChatAttachment }) => {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const url = await fetchAttachmentUrl(attachment.id);
      if (!url) {
        toast.error("Tệp không còn khả dụng.");
        return;
      }
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noopener";
      link.download = attachment.fileName;
      document.body.append(link);
      link.click();
      link.remove();
    } catch {
      toast.error("Không tải được tệp. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void download()}
      className="group/file flex max-w-72 min-w-48 items-center gap-2.5 rounded-lg border bg-surface px-2.5 py-2 text-left shadow-xs outline-none transition-colors duration-150 hover:border-border-strong hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Tải xuống ${attachment.fileName}, ${formatBytes(attachment.sizeBytes)}`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-text">
        <FileTypeIcon mimeType={attachment.mimeType} fileName={attachment.fileName} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium">{attachment.fileName}</span>
        <span className="text-xs text-foreground-muted">{formatBytes(attachment.sizeBytes)}</span>
      </span>
      {busy ? (
        <Spinner className="size-3.5 text-foreground-muted" />
      ) : (
        <Download
          className="size-3.5 text-foreground-subtle transition-colors group-hover/file:text-foreground"
          aria-hidden="true"
        />
      )}
    </button>
  );
};

const Lightbox = ({
  images,
  index,
  onIndexChange
}: {
  images: readonly ChatAttachment[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) => {
  const current = index === null ? undefined : images[index];
  const url = useAttachmentUrl(current?.id ?? "none", Boolean(current));
  const step = (delta: number) => {
    if (index === null || images.length < 2) return;
    onIndexChange((index + delta + images.length) % images.length);
  };
  return (
    <Dialog open={index !== null} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent
        className="flex max-h-[92vh] w-auto max-w-[min(96vw,72rem)] flex-col gap-3 bg-surface p-3 sm:max-w-[min(96vw,72rem)]"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") step(1);
          if (event.key === "ArrowLeft") step(-1);
        }}
      >
        <div className="flex items-center gap-2 pr-8">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm">{current?.fileName}</DialogTitle>
          <DialogDescription className="sr-only">
            Ảnh đính kèm{images.length > 1 ? ` ${(index ?? 0) + 1} trên ${images.length}` : ""}
          </DialogDescription>
          {current ? (
            <span className="text-xs text-foreground-muted">{formatBytes(current.sizeBytes)}</span>
          ) : null}
          {url.data ? (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <a href={url.data} target="_blank" rel="noopener noreferrer" download={current?.fileName} />
              }
            >
              <Download />
              Tải xuống
            </Button>
          ) : null}
        </div>
        <div className="relative flex min-h-48 items-center justify-center">
          {url.data ? (
            <img
              src={url.data}
              alt={current?.fileName ?? ""}
              className="max-h-[78vh] max-w-full rounded-md object-contain"
            />
          ) : (
            <Spinner className="size-5 text-foreground-muted" />
          )}
          {images.length > 1 ? (
            <>
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full shadow-md"
                onClick={() => step(-1)}
                aria-label="Ảnh trước"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full shadow-md"
                onClick={() => step(1)}
                aria-label="Ảnh sau"
              >
                <ChevronRight />
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
