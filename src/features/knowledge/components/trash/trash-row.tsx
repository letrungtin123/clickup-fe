import { cn } from "cn";
import { ArchiveRestore, Folder, Hourglass, Info, Trash2 } from "lucide-react";
import { Link } from "@/components/shared/router-link";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  knowledgeLimits,
  type KnowledgeCategory,
  type KnowledgeTrashedItem
} from "@/contracts/knowledge";
import { fullDateTime, relativeTime } from "@/features/tasks/time";

import { ImportanceBadge } from "../badges";
import { purgeCountdown, trashCategoryLabel } from "./trash-view";

/** One trashed item: what it was, where it lived, who deleted it and when it is purged for good. */
export const TrashRow = ({
  item,
  spaceId,
  categories,
  canRestore,
  canPurge,
  restoring,
  purging,
  onRestore,
  onPurge
}: {
  item: KnowledgeTrashedItem;
  spaceId: string;
  categories: readonly KnowledgeCategory[];
  canRestore: boolean;
  canPurge: boolean;
  restoring: boolean;
  purging: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) => {
  const category = trashCategoryLabel(categories, item.categoryId);
  const countdown = purgeCountdown(item.purgeAt);
  const busy = restoring || purging;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-3.5 py-3 sm:flex-nowrap sm:px-4">
      {/* Phones: the text takes the whole first line and the actions wrap below it. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 max-sm:basis-full">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={`/k/${spaceId}/i/${item.id}`}
            className="min-w-0 truncate rounded text-sm font-medium text-foreground underline-offset-2 outline-none pointer-coarse:-my-2.5 pointer-coarse:py-2.5 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.title}
          </Link>
          <ImportanceBadge importance={item.importance} size="xs" />
        </div>
        {item.summary?.trim() ? (
          <p className="line-clamp-1 text-[13px] text-foreground-muted">{item.summary}</p>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-muted">
          <span
            className="inline-flex min-w-0 items-center gap-1"
            title="Chuyên mục cũ: khôi phục sẽ đưa mục về đây"
          >
            <Folder className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
            <span className="truncate">{category ?? "Chuyên mục đã xoá"}</span>
          </span>
          <span aria-hidden="true" className="text-foreground-subtle">
            ·
          </span>
          <span className="inline-flex min-w-0 items-center gap-1">
            {item.deletedBy ? (
              <>
                <UserAvatar user={item.deletedBy} size="xs" className="size-4 text-[8px]" />
                <span className="max-w-40 truncate">{item.deletedBy.displayName}</span>
              </>
            ) : null}
            <time
              dateTime={item.deletedAt}
              title={fullDateTime(item.deletedAt)}
              className="shrink-0"
            >
              đã xoá {relativeTime(item.deletedAt)}
            </time>
          </span>
          <span aria-hidden="true" className="text-foreground-subtle">
            ·
          </span>
          <time
            dateTime={item.purgeAt}
            title={`Tự xoá vĩnh viễn lúc ${fullDateTime(item.purgeAt)}`}
            className={cn(
              "inline-flex items-center gap-1",
              countdown.urgent && "font-medium text-danger"
            )}
          >
            <Hourglass className="size-3.5 shrink-0" aria-hidden="true" />
            {countdown.label}
          </time>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {canRestore ? (
          <Button variant="outline" size="sm" onClick={onRestore} disabled={busy}>
            {restoring ? <Spinner /> : <ArchiveRestore />}
            Khôi phục
          </Button>
        ) : null}
        {canPurge ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-foreground-muted hover:bg-danger-soft hover:text-danger"
            onClick={onPurge}
            disabled={busy}
          >
            {purging ? <Spinner /> : <Trash2 />}
            Xoá vĩnh viễn
          </Button>
        ) : null}
        {/* Only case today: approval step on and the item was published (members cannot restore it). */}
        {!canRestore && !canPurge ? (
          <span
            className="text-xs text-foreground-subtle"
            title="Kho bật bước duyệt: mục đã ban hành chỉ Quản lý kho khôi phục được."
          >
            Chỉ Quản lý kho khôi phục được
          </span>
        ) : null}
      </div>
    </li>
  );
};

/** "Giữ 30 ngày" explanation above the list. */
export const TrashRetentionNote = ({ canPurge }: { canPurge: boolean }) => (
  <div
    role="note"
    className="flex items-start gap-2.5 rounded-xl border bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground-muted"
  >
    <Info className="mt-0.5 size-4 shrink-0 text-brand-text" aria-hidden="true" />
    <p>
      Mục trong thùng rác được giữ {knowledgeLimits.trashRetentionDays} ngày rồi tự xoá vĩnh viễn.
      Khôi phục đưa mục về đúng chuyên mục cũ.{" "}
      {canPurge
        ? "Nhật ký của mục vẫn được giữ sau khi xoá vĩnh viễn."
        : "Chỉ Quản lý kho có quyền xoá tri thức mới xoá vĩnh viễn được."}
    </p>
  </div>
);

export const TrashSkeleton = () => (
  <div className="overflow-hidden rounded-xl border bg-surface" aria-hidden="true">
    {[0, 1, 2, 3].map((index) => (
      <div key={index} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-3.5" style={{ width: `${35 + index * 9}%` }} />
          <Skeleton className="h-3" style={{ width: `${55 - index * 6}%` }} />
        </div>
        <Skeleton className="h-7 w-24 rounded-md max-sm:hidden" />
      </div>
    ))}
  </div>
);
