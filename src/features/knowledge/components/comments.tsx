import { cn } from "cn";
import {
  CircleCheckBig,
  CircleDashed,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  PencilLine,
  Reply,
  SendHorizontal,
  Trash2,
  X
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { isEmptyDoc, prepareDoc } from "@/components/shared/rich-text/helpers";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/shared/rich-text/rich-text-editor";
import { RichTextView } from "@/components/shared/rich-text/rich-text-view";
import { SegmentedControl } from "@/components/shared/radio-controls";
import { LoadMoreError } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { KnowledgeComment, KnowledgeItemDetail, KnowledgeSpace } from "@/contracts/knowledge";
import type { RichTextDoc } from "@/contracts/rich-text";
import { useSessionContext } from "@/features/auth/hooks";
import { AttachmentSourceContext } from "@/features/tasks/attachments";
import { FileRow, ImageLightbox, ImageThumb, UploadRow } from "@/features/tasks/components/detail/attachment-tiles";
import { confirmAction } from "@/features/tasks/confirm-store";
import { fullDateTime, relativeTime } from "@/features/tasks/time";
import { useInFlightGuard } from "@/hooks/use-in-flight-guard";
import { modKeyLabel } from "@/lib/keyboard";
import { pagedErrorKind } from "@/lib/paging";
import { qk } from "@/lib/query-keys";

import { knowledgeApi } from "../api";
import { scrollWithin } from "../editor/scroll";
import { commentDraftKey, commentDraftStore } from "../local-state";
import { knowledgeAttachmentSource, useKnowledgeUploads } from "../attachments";
import { knowledgeErrorMessage } from "../errors";
import {
  useCreateKnowledgeComment,
  useDeleteKnowledgeComment,
  useKnowledgeComments,
  useKnowledgeReplies,
  useResolveKnowledgeComment,
  useUpdateKnowledgeComment
} from "../hooks";
import { useKnowledgeMentionSource } from "../use-mention-source";


type Filter = "all" | "open";

/**
 * Comments and replies of an item (PD-031 §07): rich text, @mentions, attachments; root comments can be
 * marked "Đã xử lý" (feedback handled) and filtered to "Chưa xử lý".
 */
export const KnowledgeComments = ({
  item,
  space,
  focusCommentId,
  showHeading = true,
  className
}: {
  item: KnowledgeItemDetail;
  space: Pick<KnowledgeSpace, "id" | "visibility" | "capabilities" | "archivedAt">;
  /** From a notification / e-mail link (?comment=): scrolled into view and highlighted. */
  focusCommentId?: string | null;
  /** Off inside the "Bình luận" tab (the tab already names it). */
  showHeading?: boolean;
  className?: string;
}) => {
  const comments = useKnowledgeComments(item.id);
  const [filter, setFilter] = useState<Filter>("all");
  const all = useMemo(() => {
    const seen = new Set<string>();
    return (comments.data?.pages ?? []).flatMap((page) => page.items).filter((comment) => !seen.has(comment.id) && Boolean(seen.add(comment.id)));
  }, [comments.data]);
  const open = all.filter((comment) => comment.resolvedAt === null);
  const visible = filter === "open" ? open : all;
  const errorKind = pagedErrorKind(comments);
  // Archived space: read-only (also before a stale item detail refetches its capabilities).
  const canComment = item.capabilities.canComment && item.deletedAt === null && space.archivedAt === null;
  const replyThread = useReplyThread(item.id, focusCommentId, all, comments.isPending);

  return (
    <AttachmentSourceContext value={knowledgeAttachmentSource}>
      <section aria-labelledby="kb-comments-heading" className={cn("kb-touch flex flex-col gap-4", className)}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="kb-comments-heading" className={cn("flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]", !showHeading && "sr-only")}>
            <MessageSquare className="size-4 text-foreground-muted" aria-hidden="true" />
            Bình luận
            <span className="text-[13px] font-normal text-foreground-subtle tabular-nums">{item.commentCount}</span>
          </h2>
          {comments.isFetching && !comments.isPending ? <Spinner className="size-3 text-foreground-subtle" /> : null}
          <SegmentedControl
            aria-label="Lọc bình luận"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Tất cả" },
              { value: "open", label: `Chưa xử lý${item.openCommentCount > 0 ? ` (${item.openCommentCount})` : ""}` }
            ]}
            // Segments sized by their label (equal halves clip "Chưa xử lý (n)" on phones); 40 px on touch.
            className="ml-auto [&>button]:flex-auto pointer-coarse:[&>button]:h-10"
          />
        </div>

        {canComment ? (
          <CommentComposer item={item} space={space} placeholder="Góp ý, hỏi đáp… Gõ @ để nhắc tên" />
        ) : (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-foreground-muted">
            {item.deletedAt ? "Mục đang ở thùng rác nên không bình luận được." : "Bạn chỉ xem được bình luận của mục này."}
          </p>
        )}

        {comments.isPending ? (
          <CommentsSkeleton />
        ) : errorKind === "initial" ? (
          <div role="alert" className="flex items-center gap-2 text-[13px] text-foreground-muted">
            {knowledgeErrorMessage(comments.error, "Không tải được bình luận.")}
            <Button variant="ghost" size="xs" onClick={() => void comments.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
            {filter === "open" && all.length > 0 ? (
              <CircleCheckBig className="size-5 text-success" aria-hidden="true" />
            ) : (
              <MessageSquarePlus className="size-5 text-foreground-subtle" aria-hidden="true" />
            )}
            <p className="text-[13px] text-foreground-muted">
              {filter === "open" && all.length > 0
                ? "Mọi góp ý đã được xử lý."
                : "Chưa có bình luận. Góp ý giúp nội dung luôn đúng và đủ."}
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-1">
            {visible.map((comment) => (
              <CommentItem
                key={comment.id}
                item={item}
                space={space}
                comment={comment}
                canReply={canComment}
                focused={comment.id === focusCommentId}
                focusReplyId={replyThread === comment.id ? (focusCommentId ?? null) : null}
              />
            ))}
          </ol>
        )}
        {comments.hasNextPage ? (
          errorKind === "next" ? (
            <LoadMoreError onRetry={() => void comments.fetchNextPage()} retrying={comments.isFetchingNextPage} />
          ) : (
            <Button variant="ghost" size="sm" className="self-center text-foreground-muted" onClick={() => void comments.fetchNextPage()} disabled={comments.isFetchingNextPage}>
              {comments.isFetchingNextPage ? <Spinner /> : null}
              Tải bình luận cũ hơn
            </Button>
          )
        ) : null}
      </section>
    </AttachmentSourceContext>
  );
};

/**
 * A deep link to a reply (?comment=<replyId>, from "trả lời" notifications): the root comment whose
 * replies hold it, so that thread opens and the reply is scrolled to. Replies are fetched (and cached for
 * the thread) only for loaded roots that have replies.
 */
const useReplyThread = (itemId: string, focusId: string | null | undefined, roots: readonly KnowledgeComment[], loading: boolean) => {
  const client = useQueryClient();
  const [thread, setThread] = useState<string | null>(null);
  const isRoot = Boolean(focusId && roots.some((comment) => comment.id === focusId));
  const candidates = roots.filter((comment) => comment.replyCount > 0).map((comment) => comment.id);
  const candidateKey = candidates.join(",");
  useEffect(() => {
    if (!focusId || loading || isRoot || !candidateKey) return undefined;
    let cancelled = false;
    void Promise.all(
      candidateKey.split(",").map(async (commentId) => {
        const page = await client.fetchQuery({
          queryKey: qk.knowledge.replies(itemId, commentId),
          queryFn: ({ signal }) => knowledgeApi.replies(itemId, commentId, signal),
          staleTime: 30_000
        });
        return page.items.some((reply) => reply.id === focusId) ? commentId : null;
      })
    )
      .then((found) => {
        if (!cancelled) setThread(found.find((id) => id !== null) ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [candidateKey, client, focusId, isRoot, itemId, loading]);
  return isRoot ? null : thread;
};

const CommentsSkeleton = () => (
  <div className="flex flex-col gap-4" aria-hidden="true">
    {[0, 1].map((index) => (
      <div key={index} className="flex gap-3">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3" style={{ width: `${70 - index * 20}%` }} />
        </div>
      </div>
    ))}
  </div>
);

// --- One comment ----------------------------------------------------------------------------------

const CommentItem = memo(function CommentItem({
  item,
  space,
  comment,
  canReply,
  isReply = false,
  focused = false,
  focusReplyId = null
}: {
  item: KnowledgeItemDetail;
  space: Pick<KnowledgeSpace, "id" | "visibility" | "capabilities">;
  comment: KnowledgeComment;
  canReply: boolean;
  isReply?: boolean;
  focused?: boolean;
  /** Deep link to one of this comment's replies: the thread opens and the reply is scrolled to. */
  focusReplyId?: string | null;
}) {
  const session = useSessionContext();
  const rowRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (focused && rowRef.current) scrollWithin(rowRef.current, "center");
  }, [focused]);
  const [editing, setEditing] = useState(false);
  const [showReplies, setShowReplies] = useState(Boolean(focusReplyId));
  const [linkedReply, setLinkedReply] = useState(focusReplyId);
  if (focusReplyId !== linkedReply) {
    setLinkedReply(focusReplyId);
    if (focusReplyId) setShowReplies(true);
  }
  const [replying, setReplying] = useState(false);
  const remove = useDeleteKnowledgeComment(item.id);
  const resolve = useResolveKnowledgeComment(item.id);
  const author = comment.author;
  const self = author?.id === session.user.id;
  const resolved = comment.resolvedAt !== null;

  const onDelete = () =>
    void confirmAction({
      title: "Xoá bình luận?",
      description:
        comment.replyCount > 0
          ? `Bình luận và ${comment.replyCount} trả lời sẽ bị xoá. Nội dung gốc vẫn được giữ trong nhật ký kho.`
          : "Bình luận sẽ bị xoá khỏi mục. Nội dung gốc vẫn được giữ trong nhật ký kho.",
      confirmLabel: "Xoá",
      destructive: true
    }).then((ok) => {
      if (ok) remove.mutate(comment, { onError: (error) => toast.error(knowledgeErrorMessage(error, "Không xoá được bình luận.")) });
    });

  return (
    <li
      ref={rowRef}
      className={cn(
        "flex gap-3",
        isReply ? "py-1.5" : "rounded-xl px-1 py-2.5",
        resolved && !isReply && "opacity-80",
        focused && "bg-brand-soft/40 ring-2 ring-brand/30",
        focused && isReply && "rounded-lg px-1.5"
      )}
    >
      {author ? (
        <UserAvatar user={author} size={isReply ? "sm" : "md"} className="mt-0.5" />
      ) : (
        <span className={cn("mt-0.5 shrink-0 rounded-full bg-muted", isReply ? "size-6" : "size-8")} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          <span className="text-[13px] font-semibold">{author?.displayName ?? "Người dùng đã rời"}</span>
          <time dateTime={comment.createdAt} title={fullDateTime(comment.createdAt)} className="text-foreground-subtle">
            {relativeTime(comment.createdAt)}
          </time>
          {comment.editedAt ? (
            <span className="text-foreground-subtle" title={`Đã sửa lúc ${fullDateTime(comment.editedAt)}`}>
              (đã chỉnh sửa)
            </span>
          ) : null}
          {resolved && !isReply ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success"
              title={comment.resolvedBy ? `${comment.resolvedBy.displayName} · ${fullDateTime(comment.resolvedAt ?? comment.createdAt)}` : undefined}
            >
              <CircleCheckBig className="size-3" aria-hidden="true" />
              Đã xử lý
            </span>
          ) : null}
        </div>
        {editing ? (
          <CommentEditor item={item} space={space} comment={comment} onDone={() => setEditing(false)} />
        ) : (
          <div className={cn("rounded-xl rounded-tl-sm border px-3 py-2", self ? "bg-brand-soft/40" : "bg-surface")}>
            <RichTextView doc={comment.body} compact selfId={session.user.id} />
            <CommentAttachments comment={comment} />
          </div>
        )}
        {!editing ? (
          <div className="-ml-1.5 flex flex-wrap items-center gap-0.5 text-xs">
            {!isReply && canReply ? (
              <Button variant="ghost" size="xs" className="text-foreground-muted" onClick={() => setReplying((value) => !value)}>
                <Reply />
                Trả lời
              </Button>
            ) : null}
            {!isReply && comment.canResolve ? (
              <Button
                variant="ghost"
                size="xs"
                className={cn("text-foreground-muted", !resolved && "hover:text-success")}
                disabled={resolve.isPending}
                onClick={() =>
                  resolve.mutate(
                    { commentId: comment.id, resolved: !resolved },
                    { onError: (error) => toast.error(knowledgeErrorMessage(error, "Không cập nhật được góp ý.")) }
                  )
                }
              >
                {resolved ? <CircleDashed /> : <CircleCheckBig />}
                {resolved ? "Mở lại" : "Đã xử lý"}
              </Button>
            ) : null}
            {comment.canEdit ? (
              <Button variant="ghost" size="xs" className="text-foreground-muted" onClick={() => setEditing(true)}>
                <PencilLine />
                Sửa
              </Button>
            ) : null}
            {comment.canDelete ? (
              <Button variant="ghost" size="xs" className="text-foreground-muted hover:text-danger" disabled={remove.isPending} onClick={onDelete}>
                <Trash2 />
                Xoá
              </Button>
            ) : null}
            {!isReply && comment.replyCount > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-brand-text"
                aria-expanded={showReplies}
                onClick={() => setShowReplies((value) => !value)}
              >
                <MessageSquare />
                {showReplies ? "Ẩn trả lời" : `${comment.replyCount} trả lời`}
              </Button>
            ) : null}
          </div>
        ) : null}
        {!isReply && (showReplies || replying) && comment.replyCount > 0 ? (
          <Replies item={item} space={space} comment={comment} focusId={focusReplyId} />
        ) : null}
        {replying ? (
          <div className="mt-1">
            <CommentComposer
              item={item}
              space={space}
              parentCommentId={comment.id}
              placeholder={`Trả lời ${author?.displayName ?? ""}…`}
              autoFocus
              compact
              onPosted={() => {
                setReplying(false);
                setShowReplies(true);
              }}
              onCancel={() => setReplying(false)}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
});

const Replies = ({
  item,
  space,
  comment,
  focusId
}: {
  item: KnowledgeItemDetail;
  space: Pick<KnowledgeSpace, "id" | "visibility" | "capabilities">;
  comment: KnowledgeComment;
  focusId: string | null;
}) => {
  const replies = useKnowledgeReplies(item.id, comment.id, true);
  if (replies.isPending) {
    return (
      <div className="flex flex-col gap-2 border-l-2 pl-3" aria-hidden="true">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
    );
  }
  if (replies.isError) {
    return (
      <p className="text-xs text-foreground-muted" role="alert">
        Không tải được trả lời.{" "}
        <button type="button" className="text-brand-text hover:underline" onClick={() => void replies.refetch()}>
          Thử lại
        </button>
      </p>
    );
  }
  return (
    <ol className="flex flex-col border-l-2 pl-3">
      {replies.data.items.map((reply) => (
        <CommentItem key={reply.id} item={item} space={space} comment={reply} canReply={false} isReply focused={reply.id === focusId} />
      ))}
    </ol>
  );
};

const CommentAttachments = ({ comment }: { comment: KnowledgeComment }) => {
  const [viewing, setViewing] = useState<number | null>(null);
  if (comment.attachments.length === 0) return null;
  const images = comment.attachments.filter((attachment) => attachment.isImage);
  const files = comment.attachments.filter((attachment) => !attachment.isImage);
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {images.map((attachment, index) => (
            <ImageThumb key={attachment.id} attachment={attachment} size="sm" onOpen={() => setViewing(index)} />
          ))}
        </div>
      ) : null}
      {files.map((attachment) => (
        <FileRow key={attachment.id} attachment={attachment} compact />
      ))}
      <ImageLightbox images={images} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />
    </div>
  );
};

const CommentEditor = ({
  item,
  space,
  comment,
  onDone
}: {
  item: KnowledgeItemDetail;
  space: Pick<KnowledgeSpace, "id" | "visibility">;
  comment: KnowledgeComment;
  onDone: () => void;
}) => {
  const update = useUpdateKnowledgeComment(item.id);
  const mentionSource = useKnowledgeMentionSource(space);
  const [doc, setDoc] = useState<RichTextDoc | null>(null);
  const guard = useInFlightGuard();
  const save = (next?: RichTextDoc) => {
    const prepared = prepareDoc(next ?? doc ?? comment.body, "comment");
    if (!prepared.ok || !guard.tryEnter()) return;
    update.mutate(
      { commentId: comment.id, body: prepared.doc },
      {
        onSuccess: onDone,
        onError: (error) => toast.error(knowledgeErrorMessage(error, "Không lưu được bình luận.")),
        onSettled: guard.release
      }
    );
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border bg-surface focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
      <RichTextEditor
        variant="comment"
        value={comment.body}
        autoFocus
        mentionSource={mentionSource}
        onChange={setDoc}
        onSubmit={save}
        contentClassName="px-3 py-2"
        aria-label="Sửa bình luận"
      />
      <div className="flex justify-end gap-1 px-1.5 pb-1.5">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Hủy
        </Button>
        <Button size="sm" onClick={() => save()} disabled={update.isPending}>
          {update.isPending ? <Spinner /> : null}
          Lưu
        </Button>
      </div>
    </div>
  );
};

// --- Composer -------------------------------------------------------------------------------------

/** Comment / reply composer: rich text, @mentions, pasted or picked files (sent as attachmentIds). */
const CommentComposer = ({
  item,
  space,
  parentCommentId,
  placeholder,
  autoFocus = false,
  compact = false,
  onPosted,
  onCancel
}: {
  item: KnowledgeItemDetail;
  space: Pick<KnowledgeSpace, "id" | "visibility">;
  parentCommentId?: string;
  placeholder: string;
  autoFocus?: boolean;
  compact?: boolean;
  onPosted?: () => void;
  onCancel?: () => void;
}) => {
  const session = useSessionContext();
  // Per user: an unsent draft never reaches the next person signing in on this tab (KB-SEC FE-02).
  const draftKey = commentDraftKey(session.user.id, item.id, parentCommentId);
  const editor = useRef<RichTextEditorHandle | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [initial] = useState(() => commentDraftStore.get(draftKey));
  const [empty, setEmpty] = useState(() => isEmptyDoc(initial));
  const latest = useRef<RichTextDoc | null>(initial);
  const uploads = useKnowledgeUploads(item.id, "comment");
  const create = useCreateKnowledgeComment(item.id);
  const guard = useInFlightGuard();
  const mentionSource = useKnowledgeMentionSource(space);

  useEffect(
    () => () => {
      const doc = latest.current;
      if (doc && !isEmptyDoc(doc)) commentDraftStore.set(draftKey, doc);
      else commentDraftStore.delete(draftKey);
    },
    [draftKey]
  );

  const send = (doc?: RichTextDoc) => {
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
    const attachmentIds = uploads.items.flatMap((entry) => (entry.status === "done" && entry.attachment ? [entry.attachment.id] : []));
    create.mutate(
      { body, parentCommentId: parentCommentId ?? null, attachmentIds },
      {
        onSuccess: () => {
          editor.current?.clear();
          latest.current = null;
          commentDraftStore.delete(draftKey);
          uploads.clear();
          setEmpty(true);
          onPosted?.();
        },
        onError: (error) => toast.error(knowledgeErrorMessage(error, "Không gửi được bình luận.")),
        onSettled: guard.release
      }
    );
  };

  const failed = uploads.items.some((entry) => entry.status === "error");

  return (
    <div
      // The whole composer (with "Gửi") comes back into view when the on-screen keyboard opens.
      data-keep-visible=""
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
        contentClassName={cn("px-3 py-2", compact ? "min-h-9 max-h-40" : "min-h-12 max-h-56")}
        aria-label={parentCommentId ? "Trả lời bình luận" : "Viết bình luận"}
      />
      {uploads.items.length > 0 ? (
        <div className="flex flex-col gap-1.5 px-2 pb-1.5">
          {uploads.items.map((entry) =>
            entry.status === "done" ? (
              <span key={entry.id} className="inline-flex h-8 max-w-full items-center gap-2 self-start rounded-md border bg-muted/50 px-2 text-xs">
                {entry.previewUrl ? <img src={entry.previewUrl} alt="" className="size-5 rounded object-cover" /> : <Paperclip className="size-3.5 text-foreground-muted" />}
                <span className="truncate">{entry.name}</span>
                <button
                  type="button"
                  aria-label={`Bỏ ${entry.name}`}
                  onClick={() => uploads.remove(entry.id)}
                  className="inline-flex size-5 items-center justify-center rounded text-foreground-subtle hover:bg-muted hover:text-foreground pointer-coarse:size-8"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : (
              <UploadRow key={entry.id} item={entry} onRemove={() => uploads.remove(entry.id)} />
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
