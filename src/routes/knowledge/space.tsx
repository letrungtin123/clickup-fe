import { cn } from "cn";
import {
  BookOpenText,
  ChevronDown,
  Clock3,
  FilePlus2,
  Folder,
  Inbox,
  Layers,
  Pin,
  SearchX
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Link } from "@/components/shared/router-link";

import { EmptyState, ErrorState, LoadMoreError } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import type { KnowledgeItemSummary, KnowledgeSpaceDetail } from "@/contracts/knowledge";
import { useSessionContext } from "@/features/auth/hooks";
import { ImportanceBadge, KnowledgeStatusChip } from "@/features/knowledge/components/badges";
import {
  CategoryTree,
  type CategorySelection
} from "@/features/knowledge/components/category-tree";
import { ItemFilterBar } from "@/features/knowledge/components/item-filters";
import { ArchivedSpaceNotice } from "@/features/knowledge/components/settings/archived-notice";
import { KnowledgeItemList, ListSkeleton } from "@/features/knowledge/components/item-list";
import { SpaceHeader } from "@/features/knowledge/components/space-header";
import { useKnowledgeItems } from "@/features/knowledge/hooks";
import { categoryPath } from "@/features/knowledge/model/categories";
import {
  hasNarrowingFilters,
  parseSpaceFilters,
  toItemQuery,
  writeSpaceFilters,
  type SpaceFilters
} from "@/features/knowledge/model/filters";
import { relativeTime } from "@/features/tasks/time";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useMediaQuery } from "@/hooks/use-media-query";
import { canAutoLoadNextPage, pagedErrorKind } from "@/lib/paging";

import { useKnowledgeSpaceOutlet } from "./space-context";

/**
 * /k/:spaceId — category tree on the left (a sheet on narrow screens), search / filters / sort, the
 * "Đã ghim" and "Mới cập nhật" blocks, then every matching item (table on wide screens, cards on phones).
 */
export const KnowledgeSpaceRoute = () => {
  const { space, ui } = useKnowledgeSpaceOutlet();
  const session = useSessionContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseSpaceFilters(params), [params]);
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const phone = useBreakpoint() === "mobile";
  const query = useMemo(
    () => toItemQuery(filters, { selfId: session.user.id }),
    [filters, session.user.id]
  );
  const items = useKnowledgeItems(space.id, query);
  const list = useMemo(() => {
    const seen = new Set<string>();
    return (items.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
  }, [items.data]);
  const errorKind = pagedErrorKind(items);
  const narrowed = hasNarrowingFilters(filters);

  const setFilters = useCallback(
    (next: SpaceFilters) =>
      setParams((current) => writeSpaceFilters(current, next), { replace: true }),
    [setParams]
  );
  const selectCategory = (category: CategorySelection) => setFilters({ ...filters, category });
  const newItemHref = `/k/${space.id}/new${filters.category && filters.category !== "none" ? `?cat=${filters.category}` : ""}`;

  const categoryLabel =
    filters.category === null
      ? "Tất cả mục"
      : filters.category === "none"
        ? "Chưa phân loại"
        : (categoryPath(space.categories, filters.category) ?? "Chuyên mục");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SpaceHeader
        space={space}
        ui={ui}
        actions={
          ui.canCreateItem ? (
            <Button size="sm" onClick={() => void navigate(newItemHref)}>
              <FilePlus2 />
              <span className="max-sm:sr-only">Mục mới</span>
            </Button>
          ) : null
        }
      />
      <div className="flex min-h-0 flex-1">
        {wide ? (
          <aside
            aria-label="Chuyên mục"
            className="w-64 shrink-0 overflow-y-auto border-r bg-canvas/40 px-2 py-3"
          >
            <CategoryTree
              space={space}
              canManage={ui.canManageCategories}
              selected={filters.category}
              onSelect={selectCategory}
            />
          </aside>
        ) : null}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 md:px-6 md:py-5">
            {ui.readOnly ? <ArchivedSpaceNotice space={space} canRestore={ui.canArchive} /> : null}
            {wide ? null : (
              <CategorySheetButton
                space={space}
                canManage={ui.canManageCategories}
                label={categoryLabel}
                selected={filters.category}
                onSelect={selectCategory}
              />
            )}
            <ItemFilterBar space={space} filters={filters} onChange={setFilters} compact={phone} />

            {!narrowed ? <Highlights space={space} /> : null}

            <section aria-labelledby="kb-items-heading" className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <h2 id="kb-items-heading" className="text-[15px] font-semibold tracking-[-0.01em]">
                  {narrowed
                    ? filters.category !== null && !filters.q.trim()
                      ? categoryLabel
                      : "Kết quả"
                    : "Tất cả mục"}
                </h2>
                {items.data ? (
                  <span className="text-xs text-foreground-subtle">
                    {list.length}
                    {items.hasNextPage ? "+" : ""} mục
                  </span>
                ) : null}
              </div>

              {items.isPending ? (
                <ListSkeleton cards={phone} />
              ) : errorKind === "initial" ? (
                <ErrorState
                  error={items.error}
                  onRetry={() => void items.refetch()}
                  retrying={items.isFetching}
                />
              ) : list.length === 0 ? (
                narrowed ? (
                  <EmptyState
                    icon={SearchX}
                    title={
                      filters.category !== null && !filters.q.trim()
                        ? "Chuyên mục chưa có mục nào"
                        : "Không có mục khớp bộ lọc"
                    }
                    description="Thử bỏ bớt điều kiện lọc hoặc tìm bằng từ khoá khác."
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setParams(new URLSearchParams(), { replace: true })}
                      >
                        Xem tất cả mục
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={BookOpenText}
                    title="Kho chưa có mục nào"
                    description={
                      ui.canCreateItem
                        ? "Viết mục đầu tiên: một quy trình, chính sách hay hướng dẫn mà cả nhóm cần tra cứu."
                        : "Khi có mục được ban hành, chúng sẽ hiện ở đây."
                    }
                    action={
                      ui.canCreateItem ? (
                        <Button size="sm" onClick={() => void navigate(newItemHref)}>
                          <FilePlus2 />
                          Mục mới
                        </Button>
                      ) : undefined
                    }
                  />
                )
              ) : (
                <>
                  <KnowledgeItemList
                    spaceId={space.id}
                    items={list}
                    categories={space.categories}
                    showCategory={filters.category === null}
                    cards={phone}
                    hasMore={Boolean(items.hasNextPage)}
                    loadingMore={items.isFetchingNextPage}
                    onLoadMore={() => {
                      if (canAutoLoadNextPage(items)) void items.fetchNextPage();
                    }}
                  />
                  {errorKind === "next" ? (
                    <LoadMoreError
                      onRetry={() => void items.fetchNextPage()}
                      retrying={items.isFetchingNextPage}
                    />
                  ) : null}
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Narrow screens: the category tree opens in a sheet from a button showing the current category. */
const CategorySheetButton = ({
  space,
  canManage,
  label,
  selected,
  onSelect
}: {
  space: KnowledgeSpaceDetail;
  canManage: boolean;
  label: string;
  selected: CategorySelection;
  onSelect: (selection: CategorySelection) => void;
}) => {
  const [open, setOpen] = useState(false);
  const Icon = selected === null ? Layers : selected === "none" ? Inbox : Folder;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex h-10 w-full items-center gap-2 rounded-lg border bg-surface px-3 text-left text-[13px] shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
        <span className="text-foreground-subtle">Chuyên mục:</span>
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[80dvh] gap-0 overflow-y-auto rounded-t-2xl p-0 pb-(--safe-bottom)"
        >
          <span
            aria-hidden="true"
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong"
          />
          <SheetHeader className="sr-only">
            <SheetTitle>Chọn chuyên mục</SheetTitle>
            <SheetDescription>Lọc mục theo chuyên mục</SheetDescription>
          </SheetHeader>
          <div className="px-2 pt-1 pb-3">
            <CategoryTree
              space={space}
              canManage={canManage}
              selected={selected}
              onSelect={(selection) => {
                onSelect(selection);
                setOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

/** "Đã ghim" and "Mới cập nhật" blocks on top of an unfiltered space. */
const Highlights = ({ space }: { space: KnowledgeSpaceDetail }) => {
  const pinned = useKnowledgeItems(space.id, { pinned: "true", limit: 8 });
  const recent = useKnowledgeItems(space.id, { limit: 6 });
  const pinnedItems = pinned.data?.pages[0]?.items ?? [];
  // Only worth a block when the full list is long enough for the newest changes to get lost.
  const recentItems = space.itemCount > 8 ? (recent.data?.pages[0]?.items ?? []).slice(0, 4) : [];
  if (pinnedItems.length === 0 && recentItems.length === 0) return null;
  return (
    <div
      className={cn(
        "grid gap-4",
        pinnedItems.length > 0 &&
          recentItems.length > 0 &&
          "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
      )}
    >
      {pinnedItems.length > 0 ? (
        <section aria-labelledby="kb-pinned" className="flex min-w-0 flex-col gap-2.5">
          <h2
            id="kb-pinned"
            className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.06em] text-foreground-subtle uppercase"
          >
            <Pin className="size-3.5 rotate-45" aria-hidden="true" />
            Đã ghim
          </h2>
          <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
            {pinnedItems.map((item) => (
              <li key={item.id} className="w-[78%] shrink-0 snap-start md:w-auto">
                <PinnedCard spaceId={space.id} item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {recentItems.length > 0 ? (
        <section aria-labelledby="kb-recent" className="flex min-w-0 flex-col gap-2.5">
          <h2
            id="kb-recent"
            className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.06em] text-foreground-subtle uppercase"
          >
            <Clock3 className="size-3.5" aria-hidden="true" />
            Mới cập nhật
          </h2>
          <ul className="overflow-hidden rounded-xl border bg-surface shadow-xs">
            {recentItems.map((item) => (
              <li key={item.id} className="border-b last:border-b-0">
                <Link
                  to={`/k/${space.id}/i/${item.id}`}
                  className="flex min-w-0 items-center gap-3 px-3.5 py-2.5 outline-none transition-colors hover:bg-surface-hover/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {item.updatedBy ? (
                    <UserAvatar user={item.updatedBy} size="sm" />
                  ) : (
                    <span className="size-6 shrink-0 rounded-full bg-muted" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">{item.title}</span>
                    <span className="truncate text-[11px] text-foreground-subtle">
                      {item.updatedBy?.displayName ?? "Ai đó"} · v{item.version} ·{" "}
                      {relativeTime(item.updatedAt)}
                    </span>
                  </span>
                  <KnowledgeStatusChip
                    status={item.status}
                    size="xs"
                    className="max-w-28 max-sm:hidden"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};

const PinnedCard = ({ spaceId, item }: { spaceId: string; item: KnowledgeItemSummary }) => (
  <Link
    to={`/k/${spaceId}/i/${item.id}`}
    className="relative flex h-full flex-col gap-1.5 overflow-hidden rounded-xl border bg-surface p-3.5 shadow-xs outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-brand/70" />
    <span className="line-clamp-2 text-[14px] leading-snug font-semibold tracking-[-0.01em] wrap-break-word">
      {item.title}
    </span>
    {item.summary ? (
      <span className="line-clamp-2 text-[12px] leading-relaxed text-foreground-muted wrap-break-word">
        {item.summary}
      </span>
    ) : null}
    <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
      <ImportanceBadge importance={item.importance} size="xs" />
      <KnowledgeStatusChip status={item.status} size="xs" />
    </span>
  </Link>
);
