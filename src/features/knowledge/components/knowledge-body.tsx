import { cn } from "cn";
import { ImageOff } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { RichTextView, type CustomNodeRenderer } from "@/components/shared/rich-text/rich-text-view";
import type { RichTextDocLike } from "@/components/shared/rich-text/helpers";
import { Skeleton } from "@/components/ui/skeleton";
import type { KnowledgeAttachment } from "@/contracts/knowledge";
import type { RichTextNode } from "@/contracts/rich-text";
import { AttachmentSourceContext, useAttachmentUrl, type AttachmentLike } from "@/features/tasks/attachments";
import { ImageLightbox } from "@/features/tasks/components/detail/attachment-tiles";

import { knowledgeAttachmentSource } from "../attachments";
import { bodyImageIds, knowledgeCellMinWidth } from "../model/body";
import "../knowledge.css";

const span = (value: unknown) => (typeof value === "number" && value > 1 ? value : undefined);

/** Unset columns read at the CSS minimum (7rem) when the table's total width is worked out. */
const unsetColumnWidth = 112;

/**
 * Column widths dragged in the editor (first row, colspans expanded) → a <colgroup> and the table width,
 * the same way the editor lays the table out. Null when no column has a width.
 */
const tableLayout = (node: RichTextNode) => {
  const widths: (number | null)[] = [];
  for (const cell of node.content?.[0]?.content ?? []) {
    const attrs = cell.attrs as { colspan?: unknown; colwidth?: unknown } | undefined;
    const list: unknown[] = Array.isArray(attrs?.colwidth) ? attrs.colwidth : [];
    for (let index = 0; index < (span(attrs?.colspan) ?? 1); index += 1) {
      const width = list[index];
      widths.push(typeof width === "number" && width > 0 ? Math.max(width, knowledgeCellMinWidth) : null);
    }
  }
  if (!widths.some((width) => width !== null)) return null;
  const total = widths.reduce<number>((sum, width) => sum + (width ?? unsetColumnWidth), 0);
  return { widths, style: widths.every((width) => width !== null) ? { width: `${total}px` } : { minWidth: `${total}px` } };
};

const hasWidth = (node: RichTextNode) => {
  const widths = (node.attrs as { colwidth?: unknown } | undefined)?.colwidth;
  return Array.isArray(widths) && widths.some((width) => typeof width === "number" && width > 0);
};

/**
 * Read-only body of a knowledge item: the shared rich text view plus the knowledge blocks — tables (in
 * their own horizontal scroller on phones, header row styled) and images (signed URL at runtime, tap to
 * open the lightbox).
 */
export const KnowledgeBodyView = ({
  doc,
  attachments,
  selfId,
  headingIdPrefix,
  className,
  empty
}: {
  doc: RichTextDocLike | null | undefined;
  /** Files of the item (names for the lightbox); images not found here still open. */
  attachments: readonly KnowledgeAttachment[];
  selfId?: string | null | undefined;
  headingIdPrefix?: string | undefined;
  className?: string | undefined;
  empty?: ReactNode;
}) => {
  const [viewing, setViewing] = useState<number | null>(null);
  const imageIds = useMemo(() => bodyImageIds(doc), [doc]);
  const images = useMemo<AttachmentLike[]>(
    () =>
      imageIds.map(
        (id) =>
          attachments.find((attachment) => attachment.id === id) ?? {
            id,
            commentId: null,
            fileName: "Ảnh",
            mimeType: "image/*",
            sizeBytes: 0,
            isImage: true,
            uploadedBy: null,
            createdAt: new Date(0).toISOString(),
            canDelete: false
          }
      ),
    [attachments, imageIds]
  );

  const open = useCallback((id: string) => setViewing(Math.max(0, imageIds.indexOf(id))), [imageIds]);

  const renderCustom = useCallback<CustomNodeRenderer>(
    (node, key, children) => {
      switch (node.type) {
        case "table": {
          const layout = tableLayout(node);
          return (
            <div key={key} className="kb-table-wrap" role="region" aria-label="Bảng" tabIndex={0}>
              <table style={layout?.style}>
                {layout ? (
                  <colgroup>
                    {layout.widths.map((width, index) => (
                      <col key={index} style={width ? { width: `${width}px` } : undefined} />
                    ))}
                  </colgroup>
                ) : null}
                <tbody>{children()}</tbody>
              </table>
            </div>
          );
        }
        case "tableRow":
          return <tr key={key}>{children()}</tr>;
        case "tableHeader":
        case "tableCell": {
          const Tag = node.type === "tableHeader" ? "th" : "td";
          return (
            <Tag
              key={key}
              colSpan={span(node.attrs?.colspan)}
              rowSpan={span(node.attrs?.rowspan)}
              data-colwidth={hasWidth(node) ? "" : undefined}
              scope={node.type === "tableHeader" ? "col" : undefined}
            >
              {children()}
            </Tag>
          );
        }
        case "image": {
          const id = typeof node.attrs?.attachmentId === "string" ? node.attrs.attachmentId : "";
          const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
          const width = typeof node.attrs?.width === "number" ? node.attrs.width : null;
          return id ? <BodyImage key={key} attachmentId={id} alt={alt} width={width} onOpen={() => open(id)} /> : null;
        }
        default:
          return undefined;
      }
    },
    [open]
  );

  return (
    <AttachmentSourceContext value={knowledgeAttachmentSource}>
      <RichTextView
        doc={doc}
        headingIdPrefix={headingIdPrefix}
        selfId={selfId}
        className={cn("kb-prose", className)}
        empty={empty}
        renderCustom={renderCustom}
      />
      <ImageLightbox images={images} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />
    </AttachmentSourceContext>
  );
};

const BodyImage = ({
  attachmentId,
  alt,
  width,
  onOpen
}: {
  attachmentId: string;
  alt: string;
  width: number | null;
  onOpen: () => void;
}) => {
  const url = useAttachmentUrl(attachmentId);
  return (
    <figure className="kb-image">
      <button
        type="button"
        onClick={onOpen}
        aria-label={alt ? `Xem ảnh: ${alt}` : "Xem ảnh"}
        className={cn(
          "block max-w-full overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // No width = "Rộng": the full text column, as in the editor.
          !width && "w-full"
        )}
        style={{ width: width ? `${width}px` : undefined }}
      >
        {url.data ? (
          <img src={url.data} alt={alt} loading="lazy" decoding="async" className="block h-auto w-full" />
        ) : url.isError ? (
          <span className="flex h-32 w-64 max-w-full items-center justify-center gap-2 text-xs text-foreground-subtle">
            <ImageOff className="size-4" aria-hidden="true" />
            Không tải được ảnh
          </span>
        ) : (
          <Skeleton className="h-48 w-80 max-w-full rounded-none" />
        )}
      </button>
    </figure>
  );
};
