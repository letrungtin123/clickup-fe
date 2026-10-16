import { cn } from "cn";
import { Ellipsis, History, MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type {
  ProductionComment,
  ProductionTimelinePage,
  TaskLog
} from "@/contracts/production-jobs";
import { useSessionContext } from "@/features/auth/hooks";

import { foldText } from "../../catalog";
import { productionErrorMessage } from "../../errors";
import { useProductionAccess, useProductionMe } from "../../hooks";
import { useLogNames } from "../../job-log-hooks";
import { useCommentMutations, useProductionTimeline } from "../../jobs-hooks";
import type { TimelineEntity } from "../../jobs-api";
import {
  describeJobEdit,
  describeTaskLog,
  formatDateTime,
  insertMention,
  logTaskLabel,
  logTone,
  mentionAt,
  mentionedIds,
  repeatsLineLog,
  type LogNames,
  type Segment
} from "../../jobs-model";
import type { Person } from "../../people";
import { ConfirmDialog } from "../settings-kit";
import { logIcons, logToneBorder, logToneBubble } from "./log-icons";

type TimelineItem = ProductionTimelinePage["items"][number];
type Filter = "all" | "comments";

const itemTime = (item: TimelineItem) =>
  item.kind === "comment" ? item.comment.createdAt : item.log.createdAt;
const itemKey = (item: TimelineItem) =>
  item.kind === "comment" ? `c:${item.comment.id}` : `l:${item.log.id}`;

/**
 * Comments and task history interleaved, newest first (PLAN §8). History rows are Vietnamese
 * sentences built from the task logs; in a job timeline "#N" opens that task.
 */
export const ProductionTimeline = ({
  entity,
  id,
  people,
  mentionable,
  readOnly = false,
  onOpenTask,
  hiddenTaskIds,
  className
}: {
  entity: TimelineEntity;
  id: string;
  /** People that can be mentioned / resolved by id. */
  people: { people: Person[]; nameOf: (id: string) => string | undefined };
  /** Only people who can read this timeline may be mentioned (canSeeTask / canSeeJob). */
  mentionable?: ((personId: string) => boolean) | undefined;
  /** Archived job: comments can be read but not added, edited or deleted (the API refuses). */
  readOnly?: boolean;
  onOpenTask?: ((taskId: string) => void) | undefined;
  /** Job timeline: the job's subtasks — their status / assignment / create / delete rows repeat their line's (PD-044). */
  hiddenTaskIds?: ReadonlySet<string> | undefined;
  className?: string | undefined;
}) => {
  const timeline = useProductionTimeline(entity, id);
  const me = useProductionMe();
  const [filter, setFilter] = useState<Filter>("all");
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const names = useLogNames(people.nameOf, timeZone);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const list: TimelineItem[] = [];
    for (const page of timeline.data?.pages ?? []) {
      for (const item of page.items) {
        const key = itemKey(item);
        if (item.kind === "log" && hiddenTaskIds && repeatsLineLog(item.log, hiddenTaskIds))
          continue;
        if (!seen.has(key)) {
          seen.add(key);
          list.push(item);
        }
      }
    }
    return list.sort((a, b) => new Date(itemTime(b)).getTime() - new Date(itemTime(a)).getTime());
  }, [timeline.data, hiddenTaskIds]);
  const visible = filter === "comments" ? items.filter((item) => item.kind === "comment") : items;

  return (
    <section
      aria-label="Bình luận và lịch sử"
      className={cn("flex min-h-0 flex-col gap-3", className)}
    >
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <MessageSquare className="size-3.5 text-foreground-muted" aria-hidden="true" />
          Hoạt động
        </h3>
        {timeline.isFetching && !timeline.isPending ? (
          <Spinner className="size-3 text-foreground-subtle" />
        ) : null}
        <SegmentedControl<Filter>
          aria-label="Lọc hoạt động"
          size="sm"
          value={filter}
          onChange={setFilter}
          // min-w-fit: on touch the control's min-w-10 lets flex-1 split it evenly, which squeezed
          // "Bình luận" into its padding.
          className="ml-auto max-sm:[&_button]:min-h-9 [&_button]:min-w-fit"
          options={[
            { value: "all", label: "Tất cả" },
            { value: "comments", label: "Bình luận" }
          ]}
        />
      </div>

      {readOnly ? (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-foreground-muted">
          Job đã lưu trữ — không thêm bình luận được.
        </p>
      ) : (
        <CommentComposer
          entity={entity}
          id={id}
          people={
            mentionable ? people.people.filter((person) => mentionable(person.id)) : people.people
          }
        />
      )}

      {timeline.isPending ? (
        <div className="flex flex-col gap-4 py-2" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="size-7 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3" style={{ width: `${75 - index * 12}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : timeline.isError ? (
        <div role="alert" className="flex items-center gap-2 text-[13px] text-foreground-muted">
          Không tải được hoạt động.
          <Button variant="ghost" size="xs" onClick={() => void timeline.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-3 text-[13px] text-foreground-subtle">
          {filter === "comments"
            ? "Chưa có bình luận. Hãy là người đầu tiên trao đổi."
            : "Chưa có hoạt động."}
        </p>
      ) : (
        <ol className="flex flex-col">
          {visible.map((item) =>
            item.kind === "comment" ? (
              <CommentRow
                key={itemKey(item)}
                comment={item.comment}
                timeZone={timeZone}
                readOnly={readOnly}
              />
            ) : (
              <LogRow key={itemKey(item)} log={item.log} names={names} onOpenTask={onOpenTask} />
            )
          )}
        </ol>
      )}
      {timeline.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-foreground-muted"
          onClick={() => void timeline.fetchNextPage()}
          disabled={timeline.isFetchingNextPage}
        >
          {timeline.isFetchingNextPage ? <Spinner className="size-3" /> : <History />}
          Tải hoạt động cũ hơn
        </Button>
      ) : null}
    </section>
  );
};

const LogRow = ({
  log,
  names,
  onOpenTask
}: {
  log: TaskLog;
  names: LogNames;
  onOpenTask?: ((taskId: string) => void) | undefined;
}) => {
  const Icon = logIcons[log.action];
  const segments = describeTaskLog(log, names);
  const jobEdit = log.action === "JOB" ? describeJobEdit(log, names) : null;
  // Job-level rows (action JOB) have no task to open.
  const taskId = log.taskId;
  const taskLabel = logTaskLabel(log);
  // QC asking for rework, quantity requests and their decisions (PD-044) stand out.
  const tone = logTone(log);
  return (
    <li className="relative flex gap-3 py-2 pl-0.5">
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-foreground-muted",
          logToneBubble[tone ?? "none"]
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {jobEdit && jobEdit.changes.length > 1 ? (
          // A job edit touching several fields: one line per change reads better than a long run.
          <>
            <p className="text-[13px] leading-relaxed text-foreground-muted">
              <span className="font-medium text-foreground">
                {log.user?.displayName ?? "Hệ thống"}
              </span>{" "}
              {jobEdit.verb}:
            </p>
            <ul className="flex flex-col gap-0.5 text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {jobEdit.changes.map((change) => (
                <li key={change} className="flex gap-1.5">
                  <span aria-hidden="true" className="text-foreground-subtle">
                    ·
                  </span>
                  <span className="min-w-0">{change}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-foreground-muted [overflow-wrap:anywhere]">
            <span className="font-medium text-foreground">
              {log.user?.displayName ?? "Hệ thống"}
            </span>{" "}
            {segments.map((segment, index) =>
              taskLabel !== null && segment.text === taskLabel && onOpenTask && taskId ? (
                <button
                  key={index}
                  type="button"
                  onClick={() => onOpenTask(taskId)}
                  // Inline in a sentence: exempt from the phone min-height of `touchTargets`, which
                  // would otherwise push the following line 40px down.
                  className="rounded font-semibold text-brand-text underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-0!"
                >
                  {segment.text}
                </button>
              ) : (
                <SegmentText key={index} segment={segment} />
              )
            )}
          </p>
        )}
        {log.note ? (
          <p
            className={cn(
              "rounded-lg border-l-2 bg-muted/60 px-2.5 py-1.5 text-[13px] whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]",
              logToneBorder[tone ?? "none"]
            )}
          >
            {log.note}
          </p>
        ) : null}
        <time dateTime={log.createdAt} className="text-[11px] text-foreground-subtle">
          {formatDateTime(log.createdAt, names.timeZone, true)}
        </time>
      </div>
    </li>
  );
};

/**
 * One piece of a history sentence (describeTaskLog): strong names / values, toned warnings; a shortened value (a long
 * "Link chia việc", PD-045) carries the full one as its tooltip.
 */
export const SegmentText = ({ segment }: { segment: Segment }) => (
  <span
    title={segment.title}
    className={cn(
      segment.strong && "font-medium text-foreground",
      segment.tone === "danger" && "font-medium text-danger",
      segment.tone === "warning" && "font-medium text-warning",
      segment.tone === "success" && "font-medium text-success"
    )}
  >
    {segment.text}
  </span>
);

/** Highlights "@Name" tokens of the comment's mentions. */
const CommentBody = ({ body }: { body: string }) => {
  const parts = body.split(/(@[\p{L}\p{N}_.-]+(?: [\p{Lu}][\p{L}\p{N}_.-]*)*)/u);
  return (
    <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((part, index) =>
        part.startsWith("@") ? (
          <span key={index} className="rounded bg-brand-soft px-0.5 font-medium text-brand-text">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </p>
  );
};

const CommentRow = ({
  comment,
  timeZone,
  readOnly
}: {
  comment: ProductionComment;
  timeZone: string;
  readOnly: boolean;
}) => {
  const session = useSessionContext();
  const access = useProductionAccess();
  const mutations = useCommentMutations();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirm, setConfirm] = useState(false);
  const canEdit = comment.canEdit && !readOnly;
  const canDelete = (comment.canEdit || access.isAdmin) && !readOnly;
  const mine = comment.author?.id === session.user.id;

  const save = () => {
    const body = draft.trim();
    if (!body || body === comment.body) {
      setEditing(false);
      return;
    }
    mutations.edit.mutate(
      { commentId: comment.id, body },
      {
        onSuccess: () => setEditing(false),
        onError: (error) => toast.error(productionErrorMessage(error))
      }
    );
  };

  return (
    <li className="flex gap-3 py-2.5">
      {comment.author ? (
        <UserAvatar user={comment.author} size="sm" className="mt-0.5" />
      ) : (
        <span className="mt-0.5 size-6 shrink-0 rounded-full bg-muted" aria-hidden="true" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">
            {comment.author?.displayName ?? "Người dùng"}
            {mine ? <span className="font-normal text-foreground-muted"> (bạn)</span> : null}
          </span>
          <time
            dateTime={comment.createdAt}
            className="shrink-0 text-[11px] text-foreground-subtle"
          >
            {formatDateTime(comment.createdAt, timeZone)}
            {comment.editedAt ? " · đã sửa" : ""}
          </time>
          {canEdit || canDelete ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="ml-auto"
                    aria-label="Tùy chọn bình luận"
                  />
                }
              >
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {canEdit ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setDraft(comment.body);
                      setEditing(true);
                    }}
                  >
                    <Pencil />
                    Sửa
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
                    <Trash2 />
                    Xóa
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <Textarea
              autoFocus
              value={draft}
              maxLength={5000}
              rows={3}
              aria-label="Sửa bình luận"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  save();
                }
                if (event.key === "Escape") setEditing(false);
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Hủy
              </Button>
              <Button size="sm" onClick={save} disabled={mutations.edit.isPending}>
                {mutations.edit.isPending ? <Spinner /> : null}
                Lưu
              </Button>
            </div>
          </div>
        ) : (
          <CommentBody body={comment.body} />
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Xóa bình luận?"
        description="Bình luận sẽ bị xóa khỏi job/task. Không thể hoàn tác."
        confirmLabel="Xóa"
        destructive
        pending={mutations.remove.isPending}
        onConfirm={() =>
          mutations.remove.mutate(comment.id, {
            onSuccess: () => {
              setConfirm(false);
              toast.success("Đã xóa bình luận");
            },
            onError: (error) => toast.error(productionErrorMessage(error))
          })
        }
      />
    </li>
  );
};

/** Most people the @mention list offers at once (it scrolls); the whole production team fits. */
const MENTION_MAX = 50;

/** Plain-text composer with @mentions of production people (Ctrl/⌘+Enter sends). */
const CommentComposer = ({
  entity,
  id,
  people
}: {
  entity: TimelineEntity;
  id: string;
  people: Person[];
}) => {
  const session = useSessionContext();
  const mutations = useCommentMutations();
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState("");
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Map<string, string>>(new Map());

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = foldText(mention.query);
    // Who is already @mentioned in this comment is not offered again (owner, 2026-10-16).
    const already = new Set(mentionedIds(text, picked));
    return people
      .filter(
        (person) =>
          person.id !== session.user.id &&
          !already.has(person.id) &&
          (!q || foldText(`${person.displayName} ${person.email ?? ""}`).includes(q))
      )
      .slice(0, MENTION_MAX);
  }, [mention, people, session.user.id, text, picked]);

  // Keyboard navigation keeps the highlighted person visible inside the scrolling list (not the page).
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[active] as HTMLElement | undefined;
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [active, matches]);

  const refreshMention = (value: string, caret: number) => {
    setMention(mentionAt(value, caret));
    setActive(0);
  };

  const choose = (person: Person) => {
    const element = ref.current;
    if (!mention || !element) return;
    const next = insertMention(
      text,
      mention.start,
      element.selectionStart ?? text.length,
      person.displayName
    );
    setText(next.text);
    setPicked((current) => new Map(current).set(person.id, person.displayName));
    setMention(null);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(next.caret, next.caret);
    });
  };

  const send = () => {
    const body = text.trim();
    if (!body) return;
    mutations.add.mutate(
      { entity, id, body, mentionedUserIds: mentionedIds(body, picked) },
      {
        onSuccess: () => {
          setText("");
          setPicked(new Map());
        },
        onError: (error) => toast.error(productionErrorMessage(error))
      }
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && matches.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive(
          (index) => (index + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const person = matches[active];
        if (person) choose(person);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="relative flex flex-col gap-2 rounded-xl border bg-surface p-2 shadow-xs focus-within:border-ring">
      <Textarea
        ref={ref}
        value={text}
        rows={2}
        maxLength={5000}
        placeholder="Viết bình luận… gõ @ để nhắc tên"
        aria-label="Bình luận"
        className="min-h-14 resize-none border-0 bg-transparent p-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
        onChange={(event) => {
          setText(event.target.value);
          refreshMention(
            event.target.value,
            event.target.selectionStart ?? event.target.value.length
          );
        }}
        onKeyDown={onKeyDown}
        onClick={(event) => refreshMention(text, event.currentTarget.selectionStart ?? text.length)}
        onBlur={() => window.setTimeout(() => setMention(null), 150)}
      />
      {mention && matches.length > 0 ? (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Nhắc tên"
          className="absolute top-full right-2 left-2 z-20 mt-1 flex max-h-64 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-lg bg-popover p-1 shadow-lg ring-1 ring-foreground/10"
        >
          {matches.map((person, index) => (
            <li key={person.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(person)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] outline-none max-sm:min-h-10",
                  index === active ? "bg-surface-hover" : "hover:bg-surface-hover"
                )}
              >
                <UserAvatar user={person} size="xs" />
                <span className="truncate">{person.displayName}</span>
                {person.email ? (
                  <span className="ml-auto truncate text-xs text-foreground-subtle">
                    {person.email}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-2">
        <span className="hidden text-[11px] text-foreground-subtle sm:inline">
          Ctrl + Enter để gửi
        </span>
        <Button
          size="sm"
          className="ml-auto"
          onClick={send}
          disabled={!text.trim() || mutations.add.isPending}
        >
          {mutations.add.isPending ? <Spinner /> : <Send />}
          Gửi
        </Button>
      </div>
    </div>
  );
};
