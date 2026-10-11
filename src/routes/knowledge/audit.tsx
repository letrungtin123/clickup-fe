import { FilterX, History, SearchX, ShieldOff } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import type { KnowledgeSpaceDetail } from "@/contracts/knowledge";
import { AuditExportButton } from "@/features/knowledge/components/audit/audit-export-button";
import { AuditFiltersBar } from "@/features/knowledge/components/audit/audit-filters";
import {
  AuditCards,
  LoadMoreFooter,
  AuditSkeleton,
  AuditTable
} from "@/features/knowledge/components/audit/audit-log";
import {
  activeAuditFilterCount,
  auditActorChoices,
  auditItemTitle,
  emptyAuditFilters,
  purgedItemIds,
  uniqueById,
  userNameResolver
} from "@/features/knowledge/components/audit/audit-view";
import { SpaceHeader } from "@/features/knowledge/components/space-header";
import { useKnowledgeAudit, useKnowledgeMembers } from "@/features/knowledge/hooks";
import type { SpaceUi } from "@/features/knowledge/model/access";
import type { AuditResolvers } from "@/features/knowledge/model/audit";
import { categoryPath } from "@/features/knowledge/model/categories";
import {
  parseAuditFilters,
  toAuditQuery,
  writeAuditFilters,
  type AuditFilters
} from "@/features/knowledge/model/filters";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { pagedErrorKind } from "@/lib/paging";

import { useKnowledgeSpaceOutlet } from "./space-context";

const description = "Mọi thay đổi trong kho được ghi lại theo thứ tự thời gian. Không ai sửa hay xoá được nhật ký.";

/**
 * /k/:spaceId/audit — "Nhật ký kho" (PD-031 §06, §09): every change of the space, filtered by person,
 * action type, item and time range (URL state), each row leading to the exact version. Space managers
 * and org admins only; members read the per-item history instead.
 */
export const KnowledgeAuditRoute = () => {
  const { space, ui } = useKnowledgeSpaceOutlet();
  if (!ui.canViewAudit) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <SpaceHeader space={space} ui={ui} title="Nhật ký kho" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EmptyState
            icon={ShieldOff}
            title="Chỉ Quản lý kho và Quản trị xem được nhật ký kho"
            description={
              // Per-item history is open to explicit members only (public readers get 403).
              space.myAccess
                ? "Bạn vẫn xem được lịch sử thay đổi của từng mục trong tab Lịch sử của mục đó."
                : "Lịch sử thay đổi của từng mục dành cho thành viên của kho."
            }
          />
        </div>
      </div>
    );
  }
  return <AuditScreen space={space} ui={ui} />;
};

const AuditScreen = ({ space, ui }: { space: KnowledgeSpaceDetail; ui: SpaceUi }) => {
  const breakpoint = useBreakpoint();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseAuditFilters(params), [params]);
  const query = useMemo(() => toAuditQuery(filters), [filters]);
  const audit = useKnowledgeAudit(space.id, query);
  const members = useKnowledgeMembers(space.id);

  const entries = useMemo(() => uniqueById(audit.data?.pages), [audit.data]);
  const people = useMemo(
    () => auditActorChoices((members.data?.items ?? []).map((member) => member.user), entries),
    [members.data, entries]
  );
  const resolvers = useMemo<AuditResolvers>(() => {
    const statusNames = new Map(space.statuses.map((status) => [status.id, status.name]));
    return {
      status: (id) => statusNames.get(id),
      category: (id) => categoryPath(space.categories, id) ?? undefined,
      user: userNameResolver(people)
    };
  }, [space.statuses, space.categories, people]);
  const purged = useMemo(() => purgedItemIds(entries), [entries]);
  const itemTitle = auditItemTitle(entries, filters.itemId);
  const filtered = activeAuditFilterCount(filters) > 0;
  const errorKind = pagedErrorKind(audit);

  const setFilters = useCallback(
    (next: AuditFilters) => setParams((current) => writeAuditFilters(current, next), { replace: true }),
    [setParams]
  );
  const loadMore = () => void audit.fetchNextPage();

  const logProps = {
    entries,
    spaceId: space.id,
    resolvers,
    purged,
    filteredItemId: filters.itemId,
    onFilterItem: (itemId: string) => setFilters({ ...filters, itemId })
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SpaceHeader
        space={space}
        ui={ui}
        title="Nhật ký kho"
        description={description}
        actions={
          <AuditExportButton
            spaceId={space.id}
            spaceName={space.name}
            query={query}
            disabled={!audit.isPending && entries.length === 0}
          />
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 md:px-6 md:py-5">
          <AuditFiltersBar
            filters={filters}
            onChange={setFilters}
            people={people}
            peopleLoading={members.isPending}
            itemTitle={itemTitle}
          />
          {audit.isPending ? (
            <AuditSkeleton cards={breakpoint === "mobile"} />
          ) : errorKind === "initial" ? (
            <ErrorState error={audit.error} onRetry={() => void audit.refetch()} retrying={audit.isFetching} />
          ) : entries.length === 0 ? (
            filtered ? (
              <EmptyState
                icon={SearchX}
                title="Không có thao tác khớp bộ lọc"
                description="Thử bỏ bớt điều kiện hoặc mở rộng khoảng thời gian."
                action={
                  <Button variant="outline" size="sm" onClick={() => setFilters(emptyAuditFilters)}>
                    <FilterX />
                    Xoá lọc
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={History}
                title="Chưa có thao tác nào"
                description="Tạo, sửa, đổi trạng thái, xoá mục hay đổi thành viên kho đều được ghi lại ở đây."
              />
            )
          ) : (
            <>
              <p className="text-xs text-foreground-muted" aria-live="polite">
                {audit.hasNextPage
                  ? `${entries.length} thao tác gần nhất${filtered ? " khớp bộ lọc" : ""}`
                  : `${entries.length} thao tác${filtered ? " khớp bộ lọc" : ""}`}
              </p>
              {breakpoint === "mobile" ? (
                <AuditCards {...logProps} />
              ) : (
                <AuditTable {...logProps} compact={breakpoint === "tablet"} />
              )}
              <LoadMoreFooter
                hasMore={audit.hasNextPage}
                loading={audit.isFetchingNextPage}
                failed={errorKind === "next"}
                onLoad={loadMore}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
