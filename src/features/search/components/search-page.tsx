import { useInfiniteQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowRight,
  BookOpenText,
  FolderKanban,
  Hash,
  ListTodo,
  MessageSquare,
  Search,
  SearchX,
  Users,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import { Link } from "@/components/shared/router-link";

import { ColorDot } from "@/components/shared/color-dot";
import { ProjectIcon } from "@/components/shared/project-icon";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { StatusPill } from "@/components/shared/task-meta";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { SearchGroup } from "@/contracts/search";
import { useSessionContext } from "@/features/auth/hooks";
import { chatApi } from "@/features/chat/api";
import { useOpenDm } from "@/features/chat/hooks/use-channels";
import { chatKeys } from "@/features/chat/keys";
import { useDebouncedValue, useGlobalSearch } from "@/features/command/search-api";
import { ImportanceBadge, KnowledgeStatusChip } from "@/features/knowledge/components/badges";
import { useKnowledgePermissions } from "@/features/knowledge/hooks";

import {
  countByGroup,
  excerptAround,
  groupLabels,
  isSearchTab,
  mapSearchResults,
  messageHref,
  searchTabs,
  type SearchItem,
  type SearchTab
} from "../model";
import { Highlight } from "./highlight";

const groupIcons: Record<SearchGroup, LucideIcon> = {
  tasks: ListTodo,
  knowledge: BookOpenText,
  messages: MessageSquare,
  projects: FolderKanban,
  lists: Hash,
  people: Users
};

const order: SearchGroup[] = ["tasks", "knowledge", "messages", "projects", "lists", "people"];

/** `/search?q=&tab=` — full results with tabs, keyboard navigation (↑/↓, Enter) and highlights. */
export const SearchPage = () => {
  const [params, setParams] = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const rawTab = params.get("tab");
  const tab: SearchTab = isSearchTab(rawTab) ? rawTab : "all";
  const [input, setInput] = useState(urlQ);
  const debounced = useDebouncedValue(input.trim(), 250);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const tablistRef = useRef<HTMLDivElement | null>(null);
  // "Tri thức" only for people who can see the knowledge base (knowledge.view).
  const knowledgeVisible = useKnowledgePermissions().view;
  const tabs = searchTabs.filter((entry) => entry.value !== "knowledge" || knowledgeVisible);

  // Phones scroll the tab row: keep the active tab (deep links, keyboard) in view.
  useEffect(() => {
    tablistRef.current
      ?.querySelector<HTMLElement>("[aria-selected=true]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  // Mirror the debounced term into the URL (shareable, back/forward friendly).
  useEffect(() => {
    if (debounced === urlQ.trim()) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (debounced) next.set("q", debounced);
        else next.delete("q");
        return next;
      },
      { replace: true }
    );
  }, [debounced, setParams, urlQ]);

  const q = urlQ.trim();
  const setTab = (next: SearchTab) =>
    setParams(
      (current) => {
        const value = new URLSearchParams(current);
        if (next === "all") value.delete("tab");
        else value.set("tab", next);
        return value;
      },
      { replace: true }
    );

  // All groups (counts for the tabs + the "Tất cả" overview).
  const overview = useGlobalSearch(q, undefined, 8);
  const items = useMemo(() => mapSearchResults(overview.data), [overview.data]);
  const counts = useMemo(() => countByGroup(items), [items]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const nodes = Array.from(
      resultsRef.current?.querySelectorAll<HTMLElement>("[data-search-result]") ?? []
    );
    if (nodes.length === 0) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowUp" && index <= 0) {
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }
    const next =
      nodes[
        index === -1 ? 0 : Math.min(nodes.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))
      ];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  return (
    <div className="flex h-full flex-col" onKeyDown={onKeyDown}>
      <header className="flex flex-col gap-3 border-b px-4 pt-4 md:px-6 md:pt-5">
        <h1 className="sr-only">Tìm kiếm</h1>
        <div className="relative mx-auto w-full max-w-3xl">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            autoFocus
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              knowledgeVisible
                ? "Tìm công việc, tri thức, tin nhắn, dự án, mọi người…"
                : "Tìm công việc, tin nhắn, dự án, danh sách, mọi người…"
            }
            aria-label="Từ khóa tìm kiếm"
            className="h-11 w-full rounded-xl border bg-surface pr-10 pl-10 text-[15px] shadow-xs outline-none placeholder:text-foreground-subtle focus-visible:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/30"
          />
          {overview.isFetching ? (
            <Spinner className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-foreground-subtle" />
          ) : null}
        </div>
        <div
          role="tablist"
          ref={tablistRef}
          aria-label="Nhóm kết quả"
          className="mx-auto -mb-px flex w-full max-w-3xl gap-1 overflow-x-auto scrollbar-none"
        >
          {tabs.map((entry) => {
            const active = entry.value === tab;
            const count = entry.value === "all" ? items.length : counts[entry.value];
            return (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(entry.value)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium outline-none pointer-coarse:h-10 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-foreground-muted hover:text-foreground"
                )}
              >
                {entry.label}
                {q.length >= 2 && overview.data && count > 0 ? (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] leading-4 text-foreground-muted tabular-nums">
                    {count}
                    {entry.value !== "all" && count >= 8 ? "+" : ""}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </header>

      <div ref={resultsRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-2 py-4 md:px-4">
          {q.length < 2 ? (
            <EmptyState
              icon={Search}
              title="Tìm trong toàn bộ không gian làm việc"
              description={`Nhập ít nhất 2 ký tự. Kết quả chỉ gồm những gì bạn có quyền xem: công việc, ${knowledgeVisible ? "tri thức, " : ""}tin nhắn trong các cuộc trò chuyện của bạn, dự án, danh sách và đồng nghiệp.`}
            />
          ) : tab === "all" ? (
            <Overview q={q} query={overview} items={items} onTab={setTab} />
          ) : tab === "messages" ? (
            <MessageResults q={q} />
          ) : (
            <GroupResults q={q} group={tab} />
          )}
        </div>
      </div>
    </div>
  );
};

const Overview = ({
  q,
  query,
  items,
  onTab
}: {
  q: string;
  query: ReturnType<typeof useGlobalSearch>;
  items: SearchItem[];
  onTab: (tab: SearchTab) => void;
}) => {
  if (query.isPending || (query.isDebouncing && !query.data)) return <ResultsSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (items.length === 0) return <NoResults q={q} />;
  return (
    <div className="flex flex-col gap-6">
      {order.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        const Icon = groupIcons[group];
        return (
          <section key={group} aria-label={groupLabels[group]} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 px-3 pb-1">
              <Icon className="size-3.5 text-foreground-muted" aria-hidden="true" />
              <h2 className="text-xs font-semibold tracking-wide text-foreground-muted uppercase">
                {groupLabels[group]}
              </h2>
              {groupItems.length >= 8 || group === "messages" ? (
                <button
                  type="button"
                  onClick={() => onTab(group)}
                  className="ml-auto inline-flex items-center gap-1 rounded text-xs text-foreground-muted outline-none pointer-coarse:-my-2.5 pointer-coarse:py-2.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Xem tất cả <ArrowRight className="size-3" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <ul className="flex flex-col gap-0.5">
              {groupItems.map((item) => (
                <li key={`${item.group}:${item.id}`}>
                  <ResultRow item={item} q={q} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
};

const GroupResults = ({ q, group }: { q: string; group: Exclude<SearchGroup, "messages"> }) => {
  const query = useGlobalSearch(q, [group], 20);
  const items = useMemo(() => mapSearchResults(query.data), [query.data]);
  if (query.isPending || (query.isDebouncing && !query.data)) return <ResultsSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (items.length === 0) return <NoResults q={q} />;
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={`${item.group}:${item.id}`}>
          <ResultRow item={item} q={q} />
        </li>
      ))}
      {items.length >= 20 ? (
        <li className="px-3 pt-3 text-xs text-foreground-subtle">
          Hiển thị 20 kết quả phù hợp nhất. Thêm từ khóa để thu hẹp.
        </li>
      ) : null}
    </ul>
  );
};

/** Messages tab pages through /chat/search (newest first). */
const MessageResults = ({ q }: { q: string }) => {
  const query = useInfiniteQuery({
    queryKey: chatKeys.search(q),
    queryFn: ({ signal, pageParam }) =>
      chatApi.search({ q, limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.pageInfo.hasMore ? page.pageInfo.nextCursor : null),
    enabled: q.length >= 2,
    staleTime: 15_000
  });
  const hits = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (query.isPending) return <ResultsSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (hits.length === 0) return <NoResults q={q} />;
  return (
    <ul className="flex flex-col gap-0.5">
      {hits.map((hit) => (
        <li key={hit.messageId}>
          <ResultRow
            q={q}
            item={{
              group: "messages",
              id: hit.messageId,
              href: messageHref(hit),
              title: hit.text,
              meta: "",
              hit: { ...hit, channelKind: hit.channelKind }
            }}
          />
        </li>
      ))}
      {query.hasNextPage ? (
        <li className="flex justify-center py-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? <Spinner /> : null}
            Tải thêm tin nhắn
          </Button>
        </li>
      ) : null}
    </ul>
  );
};

const rowClass =
  "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring";

const ResultRow = ({ item, q }: { item: SearchItem; q: string }) => {
  const session = useSessionContext();
  const openDm = useOpenDm();
  switch (item.group) {
    case "tasks":
      return (
        <Link to={item.href} className={rowClass} data-search-result>
          <span className="mt-0.5 hidden w-16 shrink-0 font-mono text-xs text-foreground-muted sm:inline">
            <Highlight text={item.key} query={q} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* Phones: the key moves to the meta line and the title gets two lines. */}
            <span
              className={cn(
                "line-clamp-2 text-sm font-medium break-words sm:line-clamp-1",
                item.hit.completedAt && "text-foreground-muted line-through"
              )}
            >
              <Highlight text={item.title} query={q} />
            </span>
            <span className="truncate text-xs text-foreground-muted">
              <span className="font-mono sm:hidden">
                <Highlight text={item.key} query={q} />
                {" · "}
              </span>
              {item.meta}
            </span>
          </span>
          <StatusPill status={item.hit.status} size="xs" className="max-w-32" />
        </Link>
      );
    case "messages": {
      const direct = item.hit.channelKind === "dm" || item.hit.channelKind === "group_dm";
      return (
        <Link to={item.href} className={rowClass} data-search-result>
          {item.hit.author ? (
            <UserAvatar user={item.hit.author} size="md" className="mt-0.5" />
          ) : (
            <span className="mt-0.5 flex size-8 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="size-4 text-foreground-muted" aria-hidden="true" />
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
              <span className="font-medium text-foreground">
                {item.hit.author?.displayName ?? "Hệ thống"}
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate">
                {direct ? "Tin nhắn trực tiếp" : `#${item.hit.channelName ?? "kênh"}`}
              </span>
              {item.hit.threadRootId ? <span className="shrink-0">· trong chuỗi</span> : null}
              <span className="ml-auto shrink-0 tabular-nums">
                {format(new Date(item.hit.createdAt), "HH:mm, dd/MM/yyyy", { locale: vi })}
              </span>
            </span>
            <span className="line-clamp-3 text-sm whitespace-pre-line">
              <Highlight text={excerptAround(item.title, q, 140)} query={q} />
            </span>
          </span>
        </Link>
      );
    }
    case "projects":
      return (
        <Link to={item.href} className={rowClass} data-search-result>
          <ProjectIcon color={item.hit.color} icon={null} name={item.hit.name} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">
              <Highlight text={item.title} query={q} />
            </span>
            <span className="text-xs text-foreground-muted">
              <span className="font-mono">{item.key}</span> · {item.meta}
            </span>
          </span>
        </Link>
      );
    case "knowledge": {
      const retired = item.hit.status.group === "retired";
      return (
        <Link to={item.href} className={rowClass} data-search-result>
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
            <BookOpenText className="size-4" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className={cn(
                "line-clamp-2 text-sm font-medium break-words sm:line-clamp-1",
                retired && "text-foreground-muted"
              )}
            >
              <Highlight text={item.title} query={q} />
            </span>
            {item.hit.summary ? (
              <span className="line-clamp-2 text-xs text-foreground-muted">
                <Highlight text={item.hit.summary} query={q} />
              </span>
            ) : null}
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 pt-0.5 text-xs text-foreground-subtle">
              <span className="truncate">{item.hit.spaceName}</span>
              <ImportanceBadge importance={item.hit.importance} size="xs" />
              {/* Phones hide the status column: a retired item must still say so. */}
              {retired ? (
                <KnowledgeStatusChip
                  status={item.hit.status}
                  size="xs"
                  className="max-w-32 sm:hidden"
                />
              ) : null}
            </span>
          </span>
          <KnowledgeStatusChip
            status={item.hit.status}
            size="xs"
            className="max-w-32 max-sm:hidden"
          />
        </Link>
      );
    }
    case "lists":
      return (
        <Link to={item.href} className={rowClass} data-search-result>
          <ColorDot color="gray" variant="ring" className="mt-1.5 mx-1" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">
              <Highlight text={item.title} query={q} />
            </span>
            <span className="truncate text-xs text-foreground-muted">{item.meta}</span>
          </span>
        </Link>
      );
    case "people": {
      const self = item.user.id === session.user.id;
      return (
        <button
          type="button"
          className={rowClass}
          data-search-result
          disabled={self || openDm.isPending}
          onClick={() => openDm.mutate([item.user.id])}
        >
          <UserAvatar user={item.user} size="md" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">
              <Highlight text={item.title} query={q} />
              {self ? <span className="font-normal text-foreground-muted"> (bạn)</span> : null}
            </span>
            <span className="truncate text-xs text-foreground-muted">
              <Highlight text={item.meta} query={q} />
            </span>
          </span>
          {!self ? (
            <span className="self-center text-xs font-medium text-brand-text">Nhắn tin</span>
          ) : null}
        </button>
      );
    }
  }
};

const ResultsSkeleton = () => (
  <div className="flex flex-col gap-1" aria-hidden="true">
    {Array.from({ length: 6 }, (_, index) => (
      <div key={index} className="flex items-center gap-3 px-3 py-2.5">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5" style={{ width: `${40 + ((index * 23) % 45)}%` }} />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    ))}
  </div>
);

const NoResults = ({ q }: { q: string }) => (
  <EmptyState
    icon={SearchX}
    title={`Không tìm thấy kết quả cho “${q}”`}
    description="Thử từ khóa ngắn hơn, kiểm tra chính tả, hoặc chuyển sang nhóm kết quả khác."
  />
);
