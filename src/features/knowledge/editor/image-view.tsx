import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { cn } from "cn";
import { ImageOff, Text, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { knowledgeBodySpec } from "@/contracts/rich-text";
import { useAttachmentUrl } from "@/features/tasks/attachments";

const sizes: readonly { label: string; width: number | null }[] = [
  { label: "Nhỏ", width: 320 },
  { label: "Vừa", width: 560 },
  { label: "Rộng", width: null }
];

const toolClass =
  "h-7 shrink-0 rounded-md px-2 text-xs font-medium text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-10 pointer-coarse:px-2.5";

/**
 * Image block inside the knowledge editor: the signed URL comes from the item's attachment (never stored
 * in the document). Selecting the image offers three widths (Rộng = the full text column, as in the
 * reading view), a description (alt text) and removal.
 */
export const KnowledgeImageView = ({ node, selected, updateAttributes, deleteNode, editor }: ReactNodeViewProps) => {
  const ids = useId();
  const attachmentId = typeof node.attrs.attachmentId === "string" ? node.attrs.attachmentId : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  const width = typeof node.attrs.width === "number" ? node.attrs.width : null;
  const url = useAttachmentUrl(attachmentId, Boolean(attachmentId));
  const editable = editor.isEditable;
  const [describing, setDescribing] = useState(false);
  const showTools = editable && (selected || describing);

  return (
    <NodeViewWrapper as="figure" className="kb-image group/image relative my-3" data-drag-handle="">
      <div
        className={cn(
          "relative max-w-full overflow-hidden rounded-lg border bg-muted align-top",
          width ? "inline-block" : "block w-full",
          selected && "ring-2 ring-brand ring-offset-2 ring-offset-background"
        )}
        style={{ width: width ? `${width}px` : undefined }}
      >
        {url.data ? (
          <img src={url.data} alt={alt} draggable={false} className="block h-auto w-full max-w-full" />
        ) : url.isError ? (
          <span className="flex h-32 w-64 max-w-full items-center justify-center gap-2 text-xs text-foreground-subtle">
            <ImageOff className="size-4" aria-hidden="true" />
            Không tải được ảnh
          </span>
        ) : (
          <Skeleton className="h-40 w-72 max-w-full rounded-none" />
        )}
      </div>
      {showTools ? (
        <div
          contentEditable={false}
          className="absolute top-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-0.5 overflow-x-auto rounded-lg border bg-surface-raised/95 p-0.5 shadow-md backdrop-blur scrollbar-none"
        >
          {sizes.map((size) => (
            <button
              key={size.label}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => updateAttributes({ width: size.width })}
              aria-pressed={width === size.width}
              className={cn(toolClass, width === size.width && "bg-brand-soft text-brand-text")}
            >
              {size.label}
            </button>
          ))}
          <button
            type="button"
            aria-expanded={describing}
            aria-controls={`${ids}-alt`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setDescribing((value) => !value)}
            className={cn(toolClass, "inline-flex items-center gap-1", (describing || alt) && "text-brand-text")}
          >
            <Text className="size-3.5" aria-hidden="true" />
            Mô tả
          </button>
          <button
            type="button"
            aria-label="Xoá ảnh khỏi nội dung"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => deleteNode()}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-10"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : null}
      {editable && describing ? (
        <figcaption contentEditable={false} className="mt-2 flex max-w-xl flex-col gap-1">
          <label htmlFor={`${ids}-alt`} className="text-xs font-medium text-foreground-muted">
            Mô tả ảnh <span className="font-normal text-foreground-subtle">(cho trình đọc màn hình và khi ảnh không tải được)</span>
          </label>
          <input
            id={`${ids}-alt`}
            value={alt}
            maxLength={knowledgeBodySpec.imageAltLength}
            autoFocus
            placeholder="Ví dụ: Sơ đồ 4 bước chỉnh màu"
            onChange={(event) => updateAttributes({ alt: event.target.value })}
            onBlur={() => setDescribing(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                setDescribing(false);
                editor.commands.focus();
              }
            }}
            className="h-8 w-full rounded-lg border bg-background px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 pointer-coarse:h-10"
          />
        </figcaption>
      ) : null}
    </NodeViewWrapper>
  );
};
