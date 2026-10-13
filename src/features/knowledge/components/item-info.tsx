import { cn } from "cn";
import {
  AlarmClock,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  Eye,
  Folder,
  GitCommitVertical,
  Lock,
  Tag,
  UserRound,
  UserRoundPen
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/components/shared/router-link";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import type { KnowledgeItemDetail } from "@/contracts/knowledge";
import { fullDateTime, relativeTime } from "@/features/tasks/time";

import { addMonths, dateToDay, describeDue, formatDay, todayDay } from "../model/dates";
import type { useItemFieldChange } from "../use-item-change";

type Change = ReturnType<typeof useItemFieldChange>["change"];

const Row = ({
  icon,
  label,
  children
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) => (
  <div className="grid grid-cols-[1.25rem_minmax(0,7.5rem)_minmax(0,1fr)] items-start gap-x-2 py-1.5 text-[13px] lg:grid-cols-[1.25rem_minmax(0,1fr)] lg:gap-y-0.5">
    <span
      className="flex h-5 items-center text-foreground-subtle [&_svg]:size-3.5"
      aria-hidden="true"
    >
      {icon}
    </span>
    <dt className="pt-px text-foreground-muted lg:text-xs">{label}</dt>
    <dd className="min-w-0 text-foreground lg:col-start-2">{children}</dd>
  </div>
);

/**
 * "Thông tin" panel of an item (PD-031 §09): owner, effective date, review date, tags, category, space,
 * version, follow count. On wide screens it sits in the right column; on phones it folds under the title.
 */
export const ItemInfoPanel = ({
  item,
  canEdit,
  change,
  className
}: {
  item: KnowledgeItemDetail;
  canEdit: boolean;
  change: Change;
  className?: string;
}) => {
  const today = todayDay();
  const reviewIn = item.reviewBy ? describeDue(item.reviewBy, today) : null;
  const categoryHref = item.category ? `/k/${item.spaceId}?cat=${item.category.id}` : null;

  return (
    <dl className={cn("flex flex-col", className)}>
      <Row icon={<UserRound />} label="Người phụ trách">
        {item.owner ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <UserAvatar user={item.owner} size="xs" />
            <span className="truncate">{item.owner.displayName}</span>
          </span>
        ) : (
          <span className="text-foreground-subtle">Chưa có</span>
        )}
      </Row>
      <Row icon={<CalendarCheck2 />} label="Hiệu lực từ">
        {item.effectiveFrom ? (
          <span className="tabular-nums">{formatDay(item.effectiveFrom)}</span>
        ) : (
          <span className="text-foreground-subtle">—</span>
        )}
      </Row>
      <Row
        icon={item.reviewDue ? <AlarmClock className="text-warning" /> : <CalendarClock />}
        label="Hạn rà soát"
      >
        {item.reviewBy ? (
          <span className="flex flex-col gap-1.5">
            <span className={cn("tabular-nums", item.reviewDue && "font-medium text-foreground")}>
              {formatDay(item.reviewBy)}
              {reviewIn ? (
                <span
                  className={cn(
                    "ml-1.5 text-xs",
                    item.reviewDue ? "text-warning" : "text-foreground-subtle"
                  )}
                >
                  ({reviewIn})
                </span>
              ) : null}
            </span>
            {item.reviewDue && canEdit ? (
              <Button
                variant="outline"
                size="xs"
                className="self-start"
                onClick={() =>
                  change({
                    patch: { reviewBy: addMonths(today, 6) },
                    title: "Xác nhận nội dung vẫn đúng?",
                    confirmLabel: "Dời hạn 6 tháng",
                    success: `Đã dời hạn rà soát tới ${formatDay(addMonths(today, 6))}`
                  })
                }
              >
                Vẫn đúng · dời 6 tháng
              </Button>
            ) : null}
          </span>
        ) : (
          <span className="text-foreground-subtle">—</span>
        )}
      </Row>
      <Row icon={<Folder />} label="Chuyên mục">
        {item.category && categoryHref ? (
          <Link
            to={categoryHref}
            className="rounded break-words outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.category.parent ? `${item.category.parent.name} › ` : ""}
            {item.category.name}
          </Link>
        ) : (
          <span className="text-foreground-subtle">Chưa phân loại</span>
        )}
      </Row>
      <Row icon={<BookOpen />} label="Kho">
        <Link
          to={`/k/${item.spaceId}`}
          className="inline-flex max-w-full items-center gap-1 rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate">{item.space.name}</span>
          {item.space.visibility === "private" ? (
            <Lock className="size-3 shrink-0 text-foreground-subtle" aria-label="Riêng tư" />
          ) : null}
        </Link>
      </Row>
      <Row icon={<Tag />} label="Tag">
        {item.tags.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <Link
                key={tag}
                to={`/k/${item.spaceId}?tag=${encodeURIComponent(tag)}`}
                title={`#${tag}`}
                className="inline-flex h-6 max-w-full items-center rounded-md bg-muted px-2 text-xs text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-8"
              >
                <span className="truncate">#{tag}</span>
              </Link>
            ))}
          </span>
        ) : (
          <span className="text-foreground-subtle">—</span>
        )}
      </Row>
      <Row icon={<GitCommitVertical />} label="Phiên bản">
        <span className="tabular-nums">v{item.version}</span>
        <span className="text-foreground-subtle">
          {" "}
          ·{" "}
          <time dateTime={item.updatedAt} title={fullDateTime(item.updatedAt)}>
            {relativeTime(item.updatedAt)}
          </time>
          {item.updatedBy ? ` · ${item.updatedBy.displayName}` : ""}
        </span>
      </Row>
      <Row icon={<UserRoundPen />} label="Tạo bởi">
        <span>{item.createdBy?.displayName ?? "—"}</span>
        <span className="text-foreground-subtle">
          {" "}
          · {formatDay(dateToDay(new Date(item.createdAt)))}
        </span>
      </Row>
      <Row icon={<Eye />} label="Theo dõi">
        <span>
          {item.followerCount} người{item.isFollowing ? " · có bạn" : ""}
        </span>
      </Row>
    </dl>
  );
};
