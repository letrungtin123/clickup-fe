import { cn } from "cn";
import {
  ArrowRightLeft,
  CalendarClock,
  CircleDot,
  Flag,
  History,
  MessageSquare,
  Paperclip,
  PencilLine,
  Plus,
  Reply,
  RotateCcw,
  Trash2,
  UserMinus,
  UserPlus,
  CheckCircle2,
  Undo2,
  type LucideIcon
} from "lucide-react";
import { memo, useMemo, useState } from "react";

import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { RichTextView } from "@/components/shared/rich-text/rich-text-view";
import { prepareDoc } from "@/components/shared/rich-text/helpers";
import { SegmentedControl } from "@/components/shared/radio-controls";
import { PriorityFlag, StatusPill } from "@/components/shared/task-meta";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { RichTextDoc } from "@/contracts/rich-text";
import type { Activity, Comment, TaskDetail, TimelineItem } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";
import { useProject } from "@/features/projects/hooks";

import { describeActivity, type ActivityIcon, type ActivityPart } from "../../activity";
import { confirmAction } from "../../confirm-store";
import { formatDayMonth, formatFullDate } from "../../due";
import { useDeleteComment, useMentionSource, useReplies, useTaskTimeline, useUpdateComment, useUserNames } from "../../hooks";
import { fullDateTime, relativeTime } from "../../time";
import { FileRow, ImageLightbox, ImageThumb } from "./attachment-tiles";
import { CommentComposer } from "./composer";

const activityIcons: Record<ActivityIcon, LucideIcon> = {
  created: Plus,
  edit: PencilLine,
  status: CircleDot,
  reopen: RotateCcw,
  priority: Flag,
  date: CalendarClock,
  assign: UserPlus,
  unassign: UserMinus,
  move: ArrowRightLeft,
  attach: Paperclip,
  delete: Trash2,
  restore: Undo2,
  done: CheckCircle2,
  other: History
};

type Filter = "all" | "comments";

const itemKey = (item: TimelineItem) => (item.kind === "comment" ? `c:${item.comment.id}` : `a:${item.activity.id}`);

/**
 * Unified timeline (spec §25): comments and structured activity, loaded newest page first and shown
 * oldest → newest with "load older" on top.
 */
export const TimelineSection = ({ task }: { task: TaskDetail }) => {
  const timeline = useTaskTimeline(task.id);
  const [filter, setFilter] = useState<Filter>("all");
  const project = useProject(task.projectId);
  const nameOf = useUserNames(task.projectId, task.assignees);
  const lists = project.data?.lists;
  const resolveList = useMemo(() => {
    const names = new Map((lists ?? []).map((list) => [list.id, list.name]));
    return (id: string) => names.get(id);
  }, [lists]);
  const manage = project.data?.myAccess === "manage";

  const items = useMemo(() => {
    const seen = new Set<string>();
    const ordered: TimelineItem[] = [];
    for (const page of timeline.data?.pages ?? []) {
      for (const item of page.items) {
        const key = itemKey(item);
        if (!seen.has(key)) {
          seen.add(key);
          ordered.push(item);
        }
      }
    }
    // Oldest → newest. Events written in one transaction share a timestamp: keep creation first.
    const time = (item: TimelineItem) => new Date(item.kind === "comment" ? item.comment.createdAt : item.activity.createdAt).getTime();
    const weight = (item: TimelineItem) => (item.kind === "activity" && item.activity.action === "TASK_CREATED" ? 0 : 1);
    const chronological = ordered.reverse().sort((a, b) => time(a) - time(b) || weight(a) - weight(b));
    // Collapse bursts of description saves by the same person (autosave) into one entry.
    return chronological.filter((item, index) => {
      const next = chronological[index + 1];
      return !(
        item.kind === "activity" &&
        item.activity.action === "TASK_DESCRIPTION_CHANGED" &&
        next?.kind === "activity" &&
        next.activity.action === "TASK_DESCRIPTION_CHANGED" &&
        next.activity.actor?.id === item.activity.actor?.id &&
        time(next) - time(item) < 10 * 60_000
      );
    });
  }, [timeline.data]);
  const visible = filter === "comments" ? items.filter((item) => item.kind === "comment") : items;

  return (
    <section aria-labelledby="task-timeline-heading" className="flex flex-col gap-3 border-t px-5 pt-5 pb-4">
      <div className="flex items-center gap-2">
        <h3 id="task-timeline-heading" className="flex items-center gap-2 text-[13px] font-semibold">
          <MessageSquare className="size-3.5 text-foreground-muted" aria-hidden="true" />
          Hoạt động
        </h3>
        {timeline.isFetching && !timeline.isPending ? <Spinner className="size-3 text-foreground-subtle" /> : null}
        <SegmentedControl
          aria-label="Lọc hoạt động"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Tất cả" },
            { value: "comments", label: "Bình luận" }
          ]}
          className="ml-auto"
        />
      </div>

      {timeline.isPending ? (
        <TimelineSkeleton />
      ) : timeline.isError ? (
        <div className="flex items-center gap-2 text-[13px] text-foreground-muted" role="alert">
          Không tải được hoạt động.
          <Button variant="ghost" size="xs" onClick={() => void timeline.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : (
        <>
          {timeline.hasNextPage ? (
            <Button
              variant="ghost"
              size="xs"
              className="self-start text-foreground-muted"
              onClick={() => void timeline.fetchNextPage()}
              disabled={timeline.isFetchingNextPage}
            >
              {timeline.isFetchingNextPage ? <Spinner className="size-3" /> : <History />}
              Tải hoạt động cũ hơn
            </Button>
          ) : null}
          {visible.length === 0 ? (
            <p className="py-2 text-[13px] text-foreground-subtle">
              {filter === "comments" ? "Chưa có bình luận. Hãy là người đầu tiên trao đổi." : "Chưa có hoạt động."}
            </p>
          ) : (
            <ol className="flex flex-col">
              {visible.map((item) =>
                item.kind === "comment" ? (
                  <CommentItem key={itemKey(item)} task={task} comment={item.comment} manage={manage} />
                ) : (
                  <ActivityRow key={itemKey(item)} activity={item.activity} resolveUser={nameOf} resolveList={resolveList} />
                )
              )}
            </ol>
          )}
        </>
      )}
    </section>
  );
};

const TimelineSkeleton = () => (
  <div className="flex flex-col gap-4" aria-hidden="true">
    {[0, 1, 2].map((index) => (
      <div key={index} className="flex gap-3">
        <Skeleton className="size-7 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3" style={{ width: `${70 - index * 15}%` }} />
        </div>
      </div>
    ))}
  </div>
);

// --- Activity ------------------------------------------------------------------------------------

const ActivityRow = memo(function ActivityRow({
  activity,
  resolveUser,
  resolveList
}: {
  activity: Activity;
  resolveUser: (id: string) => string | undefined;
  resolveList: (id: string) => string | undefined;
}) {
  const session = useSessionContext();
  const sentence = describeActivity(activity, { resolveUser, resolveList });
  const Icon = activityIcons[sentence.icon];
  const actor = activity.actor ? (activity.actor.id === session.user.id ? "Bạn" : activity.actor.displayName) : "Hệ thống";
  return (
    <li className="relative flex gap-3 py-1.5 text-xs text-foreground-muted">
      <span className="relative z-[1] mt-px flex size-7 shrink-0 items-center justify-center">
        <span className="flex size-5 items-center justify-center rounded-full border bg-background text-foreground-subtle">
          <Icon className="size-3" aria-hidden="true" />
        </span>
      </span>
      <p className="min-w-0 flex-1 leading-6">
        <span className="font-medium text-foreground">{actor}</span>{" "}
        {sentence.parts.map((part, index) => (
          <ActivityPartView key={index} part={part} />
        ))}
        <span aria-hidden="true"> · </span>
        <time dateTime={activity.createdAt} title={fullDateTime(activity.createdAt)} className="whitespace-nowrap text-foreground-subtle">
          {relativeTime(activity.createdAt)}
        </time>
      </p>
    </li>
  );
});

const ActivityPartView = ({ part }: { part: ActivityPart }) => {
  switch (part.kind) {
    case "text":
      return <>{part.text}</>;
    case "strong":
      return <span className="font-medium text-foreground">“{part.text}”</span>;
    case "status":
      return <StatusPill status={{ name: part.name, color: part.color ?? "gray" }} size="xs" className="mx-0.5 align-middle" />;
    case "priority":
      return <PriorityFlag priority={part.priority} showLabel className="mx-0.5 align-middle text-xs text-foreground" />;
    case "date":
      return (
        <time dateTime={part.iso} title={formatFullDate(part.iso)} className="font-medium text-foreground">
          {formatDayMonth(part.iso)}
        </time>
      );
    case "user":
      return <span className="font-medium text-foreground">{part.name}</span>;
    case "file":
      return <span className="font-medium break-all text-foreground">{part.name}</span>;
    default:
      return null;
  }
};

// --- Comments ------------------------------------------------------------------------------------

const CommentItem = memo(function CommentItem({
  task,
  comment,
  manage,
  isReply = false
}: {
  task: TaskDetail;
  comment: Comment;
  manage: boolean;
  isReply?: boolean;
}) {
  const session = useSessionContext();
  const [editing, setEditing] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replying, setReplying] = useState(false);
  const remove = useDeleteComment(task.id);
  const canDelete = comment.canEdit || manage;
  const canReply = !isReply && task.capabilities.canComment;
  const author = comment.author;
  const self = author?.id === session.user.id;

  return (
    <li className={cn("flex gap-3", isReply ? "py-1.5" : "py-2.5")}>
      {author ? (
        <UserAvatar user={author} size={isReply ? "sm" : "md"} className="mt-0.5" />
      ) : (
        <span className="mt-0.5 size-8 shrink-0 rounded-full bg-muted" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="text-[13px] font-semibold">{author?.displayName ?? "Người dùng đã rời"}</span>
          <time dateTime={comment.createdAt} title={fullDateTime(comment.createdAt)} className="text-foreground-subtle">
            {relativeTime(comment.createdAt)}
          </time>
          {comment.editedAt ? (
            <span className="text-foreground-subtle" title={`Đã sửa lúc ${fullDateTime(comment.editedAt)}`}>
              (đã chỉnh sửa)
            </span>
          ) : null}
        </div>
        {editing ? (
          <CommentEditor task={task} comment={comment} onDone={() => setEditing(false)} />
        ) : (
          <div className={cn("rounded-lg rounded-tl-sm border px-3 py-2", self ? "bg-brand-soft/40" : "bg-surface")}>
            <RichTextView doc={comment.body} compact selfId={session.user.id} />
            <CommentAttachments comment={comment} />
          </div>
        )}
        {!editing ? (
          <div className="flex items-center gap-0.5 text-xs">
            {canReply ? (
              <Button variant="ghost" size="xs" className="text-foreground-muted" onClick={() => setReplying((value) => !value)}>
                <Reply />
                Trả lời
              </Button>
            ) : null}
            {comment.canEdit ? (
              <Button variant="ghost" size="xs" className="text-foreground-muted" onClick={() => setEditing(true)}>
                <PencilLine />
                Sửa
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-foreground-muted hover:text-danger"
                disabled={remove.isPending}
                onClick={() =>
                  void confirmAction({
                    title: "Xóa bình luận?",
                    description: comment.replyCount > 0 ? `Bình luận và ${comment.replyCount} phản hồi sẽ bị xóa.` : "Bình luận sẽ bị xóa khỏi công việc.",
                    confirmLabel: "Xóa",
                    destructive: true
                  }).then((ok) => ok && remove.mutate(comment))
                }
              >
                <Trash2 />
                Xóa
              </Button>
            ) : null}
            {!isReply && comment.replyCount > 0 ? (
              <Button variant="ghost" size="xs" className="text-brand-text" onClick={() => setShowReplies((value) => !value)} aria-expanded={showReplies}>
                <MessageSquare />
                {showReplies ? "Ẩn phản hồi" : `${comment.replyCount} phản hồi`}
              </Button>
            ) : null}
          </div>
        ) : null}
        {!isReply && (showReplies || replying) ? (
          <Replies task={task} comment={comment} manage={manage} show={showReplies || replying} />
        ) : null}
        {replying ? (
          <div className="mt-1">
            <CommentComposer
              task={task}
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

const Replies = ({ task, comment, manage, show }: { task: TaskDetail; comment: Comment; manage: boolean; show: boolean }) => {
  const replies = useReplies(task.id, comment.id, show);
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
        Không tải được phản hồi.{" "}
        <button type="button" className="text-brand-text hover:underline" onClick={() => void replies.refetch()}>
          Thử lại
        </button>
      </p>
    );
  }
  if (replies.data.items.length === 0) return null;
  return (
    <ol className="flex flex-col border-l-2 pl-3">
      {replies.data.items.map((reply) => (
        <CommentItem key={reply.id} task={task} comment={reply} manage={manage} isReply />
      ))}
    </ol>
  );
};

const CommentEditor = ({ task, comment, onDone }: { task: TaskDetail; comment: Comment; onDone: () => void }) => {
  const update = useUpdateComment(task.id);
  const mentionSource = useMentionSource(task.projectId);
  const [doc, setDoc] = useState<RichTextDoc | null>(null);
  const save = (next?: RichTextDoc) => {
    const prepared = prepareDoc(next ?? doc ?? comment.body, "comment");
    if (!prepared.ok) return;
    update.mutate({ commentId: comment.id, body: prepared.doc }, { onSuccess: onDone });
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-surface focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
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

const CommentAttachments = ({ comment }: { comment: Comment }) => {
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
