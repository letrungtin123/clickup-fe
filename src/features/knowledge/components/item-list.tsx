import { cn } from "cn";
import { CalendarClock, MessageSquare, Paperclip, Tag } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { KnowledgeCategory, KnowledgeItemSummary } from "@/contracts/knowledge";
import { fullDateTime, relativeTime } from "@/features/tasks/time";

import { categoryPath } from "../model/categories";
import { formatDay } from "../model/dates";
import { ImportanceBadge, KnowledgeStatusChip, PinnedMark, ReviewDueBadge } from "./badges";

type ListProps = {
  spaceId: string;
  items: readonly KnowledgeItemSummary[];
  categories: readonly KnowledgeCategory[];
  /** Show the category path under the title (when not filtering by one category). */
  showCategory: boolean;
  /** Render as cards (phones) instead of the table. */
  cards: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  /** Called when the end of the list scrolls into view (stop calling it after a failed page). */
  onLoadMore: () => void;
};

/**
 * Items of a space: a clean table on wide screens (title + summary line, importance, status, owner,
 * updated, review date) and cards on phones. Every row is one link (open in a new tab works). Retired
 * items are muted; items due for review carry the "Tới hạn rà soát" badge.
 */
export const KnowledgeItemList = ({
  spaceId,
  items,
  categories,
  showCategory,
  cards,
  hasMore,
  loadingMore,
  onLoadMore
}: ListProps) => {
  const sentinel = useRef<HTMLDivElement | null>(null);
  const loadMore = useRef(onLoadMore);
  useEffect(() => {
    loadMore.current = onLoadMore;
  });
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore.current();
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, items.length]);

  const pathOf = (item: KnowledgeItemSummary) => (showCategory ? categoryPath(categories, item.categoryId) : null);

  return (
    <>
      {cards ? (
        <ul className="flex flex-col gap-2.5" aria-label="Danh sách mục">
          {items.map((item) => (
            <li key={item.id}>
              <ItemCard spaceId={spaceId} item={item} category={pathOf(item)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-surface shadow-xs">
          <div
            aria-hidden="true"
            className={cn(
              gridColumns,
              "border-b bg-muted/40 px-4 py-2.5 text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase"
            )}
          >
            <span>Tiêu đề</span>
            <span>Mức quan trọng</span>
            <span>Trạng thái</span>
            <span className="hidden xl:block">Phụ trách</span>
            <span>Cập nhật</span>
            <span className="hidden 2xl:block">Rà soát</span>
          </div>
          <ul aria-label="Danh sách mục">
            {items.map((item) => (
              <ItemRow key={item.id} spaceId={spaceId} item={item} category={pathOf(item)} />
            ))}
          </ul>
        </div>
      )}
      <div ref={sentinel} aria-hidden="true" />
      {loadingMore ? <ListSkeleton cards={cards} rows={2} /> : null}
    </>
  );
};

const retiredClass = "text-foreground-muted";

/** Title column flexible; the rest fixed. Owner from xl, review date from 2xl (else a badge under the title). */
const gridColumns =
  "grid grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_6.5rem] items-start gap-x-3 xl:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_10rem_6.5rem] 2xl:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_10rem_6.5rem_8rem]";

const itemHref = (spaceId: string, itemId: string) => `/k/${spaceId}/i/${itemId}`;

const updatedTitle = (item: KnowledgeItemSummary) =>
  item.updatedBy ? `${fullDateTime(item.updatedAt)} · ${item.updatedBy.displayName}` : fullDateTime(item.updatedAt);

const ItemRow = ({ spaceId, item, category }: { spaceId: string; item: KnowledgeItemSummary; category: string | null }) => {
  const retired = item.status.group === "retired";
  return (
    <li className="border-b last:border-b-0">
      <Link
        to={itemHref(spaceId, item.id)}
        className={cn(
          gridColumns,
          "group/row px-4 py-3 outline-none transition-colors duration-100 hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        )}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {item.pinned ? <PinnedMark /> : null}
            <span
              title={item.title}
              className={cn(
                "min-w-0 truncate text-[14px] font-medium tracking-[-0.005em] underline-offset-2 group-hover/row:underline group-hover/row:decoration-border-strong",
                retired && retiredClass
              )}
            >
              {item.title}
            </span>
          </div>
          {item.summary ? (
            <p className={cn("line-clamp-1 text-[13px] text-foreground-muted", retired && "text-foreground-subtle")}>
              {item.summary}
            </p>
          ) : null}
          <ItemMeta item={item} category={category} className="mt-0.5" />
        </div>
        <span className="pt-0.5">
          <ImportanceBadge importance={item.importance} size="xs" showNormal />
        </span>
        <span className="min-w-0 pt-0.5">
          <KnowledgeStatusChip status={item.status} size="xs" />
        </span>
        <span className="hidden min-w-0 pt-0.5 xl:block">
          {item.owner ? (
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-foreground-muted">
              <UserAvatar user={item.owner} size="xs" />
              <span className="truncate">{item.owner.displayName}</span>
            </span>
          ) : (
            <span className="text-[13px] text-foreground-subtle">—</span>
          )}
        </span>
        <time dateTime={item.updatedAt} title={updatedTitle(item)} className="block truncate pt-1 text-[13px] text-foreground-muted">
          {relativeTime(item.updatedAt)}
        </time>
        <span className="hidden pt-0.5 2xl:block">
          {item.reviewDue ? (
            <ReviewDueBadge size="xs" />
          ) : item.reviewBy ? (
            <span className="flex items-center gap-1 pt-0.5 text-[13px] text-foreground-muted tabular-nums">
              <CalendarClock className="size-3.5 text-foreground-subtle" aria-hidden="true" />
              {formatDay(item.reviewBy)}
            </span>
          ) : (
            <span className="text-[13px] text-foreground-subtle">—</span>
          )}
        </span>
      </Link>
    </li>
  );
};

/** Tags, category, counters and (when the review column is hidden) the review badge. */
const ItemMeta = ({ item, category, className }: { item: KnowledgeItemSummary; category: string | null; className?: string }) => {
  const hasMeta = Boolean(category) || item.tags.length > 0 || item.openCommentCount > 0 || item.attachmentCount > 0;
  if (!hasMeta && !item.reviewDue) return null;
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-foreground-subtle", className)}>
      {category ? <span className="max-w-full truncate">{category}</span> : null}
      {item.tags.length > 0 ? (
        <span className="inline-flex max-w-full min-w-0 items-center gap-1">
          <Tag className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {item.tags.slice(0, 3).join(", ")}
            {item.tags.length > 3 ? ` +${item.tags.length - 3}` : ""}
          </span>
        </span>
      ) : null}
      {item.openCommentCount > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-foreground-muted" title={`${item.openCommentCount} góp ý chưa xử lý`}>
          <MessageSquare className="size-3" aria-hidden="true" />
          {item.openCommentCount}
        </span>
      ) : null}
      {item.attachmentCount > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1" title={`${item.attachmentCount} tệp đính kèm`}>
          <Paperclip className="size-3" aria-hidden="true" />
          {item.attachmentCount}
        </span>
      ) : null}
      {item.reviewDue ? <ReviewDueBadge size="xs" className="2xl:hidden" /> : null}
    </div>
  );
};

const ItemCard = ({ spaceId, item, category }: { spaceId: string; item: KnowledgeItemSummary; category: string | null }) => {
  const retired = item.status.group === "retired";
  return (
    <Link
      to={itemHref(spaceId, item.id)}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-surface p-3.5 shadow-xs outline-none transition-colors active:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring",
        retired && "bg-muted/40"
      )}
    >
      <div className="flex items-start gap-2">
        {item.pinned ? <PinnedMark className="mt-1" /> : null}
        <span className={cn("line-clamp-2 min-w-0 flex-1 text-[15px] leading-snug font-semibold tracking-[-0.01em] wrap-break-word", retired && retiredClass)}>
          {item.title}
        </span>
      </div>
      {item.summary ? <p className="line-clamp-2 text-[13px] leading-relaxed text-foreground-muted">{item.summary}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <ImportanceBadge importance={item.importance} size="xs" />
        <KnowledgeStatusChip status={item.status} size="xs" />
        {item.reviewDue ? <ReviewDueBadge size="xs" /> : null}
      </div>
      <div className="flex min-w-0 items-center gap-2 border-t pt-2 text-[12px] text-foreground-subtle">
        {item.owner ? <UserAvatar user={item.owner} size="xs" /> : null}
        <span className="min-w-0 flex-1 truncate">
          {category ? `${category} · ` : ""}cập nhật {relativeTime(item.updatedAt)}
        </span>
        {item.openCommentCount > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1" title={`${item.openCommentCount} góp ý chưa xử lý`}>
            <MessageSquare className="size-3.5" aria-hidden="true" />
            {item.openCommentCount}
          </span>
        ) : null}
      </div>
    </Link>
  );
};

export const ListSkeleton = ({ cards, rows = 6 }: { cards: boolean; rows?: number }) =>
  cards ? (
    <div className="flex flex-col gap-2.5" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-xl border bg-surface p-3.5">
          <Skeleton className="h-4" style={{ width: `${60 + ((index * 17) % 30)}%` }} />
          <Skeleton className="h-3 w-full" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="overflow-hidden rounded-xl border bg-surface" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5" style={{ width: `${45 + ((index * 13) % 35)}%` }} />
            <Skeleton className="h-3" style={{ width: `${30 + ((index * 7) % 30)}%` }} />
          </div>
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
