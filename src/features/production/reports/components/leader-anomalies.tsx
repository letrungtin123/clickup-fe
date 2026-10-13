import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "@/components/shared/router-link";

import { EmptyState, ErrorState, SkeletonRows } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import type { AnomalyKind } from "@/contracts/production-reports";

import {
  anomalyDescriptions,
  anomalyKindTitles,
  anomalyTabLabels,
  firstAnomalyKind,
  leaderAnomalyDays
} from "../anomalies";
import { useAnomalies } from "../hooks";
import { AnomalyKindTabs, AnomalyList } from "./anomalies";

const maxRows = 30;

/**
 * "Bất thường" tab of the Leader dashboard (SPEC Phase 5.5 "tab trong /dashboard của Leader"): the
 * unreviewed anomalies of the last 30 days — the API scopes them to the jobs the leader leads (ADMIN:
 * every job) — per kind, with "Đã xem" on each row and a link to the full page (/production/anomalies).
 */
export const LeaderAnomaliesPanel = ({
  timeZone,
  scope,
  note
}: {
  timeZone: string;
  /** "các job bạn phụ trách" / "mọi job". */
  scope: string;
  /** Extra line, e.g. why an Admin's leader pick does not narrow the list. */
  note?: string | undefined;
}) => {
  const list = useAnomalies(leaderAnomalyDays, false);
  const [picked, setPicked] = useState<AnomalyKind | null>(null);
  const data = list.data;
  const kind = picked ?? firstAnomalyKind(data?.counts);
  const items = (data?.items ?? []).filter((item) => item.kind === kind && !item.reviewed);
  const fullHref = `/production/anomalies?kind=${kind}`;

  return (
    <section
      aria-labelledby="leader-anomalies-title"
      className="min-w-0 rounded-xl border bg-surface shadow-xs"
    >
      <header className="flex flex-col gap-3 border-b px-4 pt-3 pb-2">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5">
            <h2 id="leader-anomalies-title" className="text-sm font-semibold">
              Bất thường {leaderAnomalyDays} ngày qua
            </h2>
            <p className="text-xs text-foreground-muted">
              Những điểm cần kiểm tra trên {scope}, chưa ai đánh dấu “Đã xem”.
              {note ? ` ${note}` : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="max-sm:min-h-10"
            render={<Link to={fullHref} />}
            nativeButton={false}
          >
            Mở trang Bất thường
            <ArrowUpRight />
          </Button>
        </div>
        <AnomalyKindTabs
          value={kind}
          onChange={setPicked}
          counts={data?.counts}
          loaded={data !== undefined}
        />
      </header>
      <div className="flex flex-col gap-0.5 border-b px-4 py-2.5">
        <h3 className="text-[13px] font-medium">{anomalyKindTitles[kind]}</h3>
        <p className="text-xs text-foreground-muted">
          {anomalyDescriptions[kind](data?.threshold ?? 0.15)}
        </p>
      </div>
      {list.isPending ? (
        <SkeletonRows rows={4} className="p-4" />
      ) : list.isError ? (
        <ErrorState
          size="sm"
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={ShieldCheck}
          title="Không có bất thường"
          description={`Không có mục "${anomalyTabLabels[kind].toLowerCase()}" nào chưa xem trong ${leaderAnomalyDays} ngày qua.`}
        />
      ) : (
        <>
          <AnomalyList
            kind={kind}
            items={items.slice(0, maxRows)}
            threshold={data?.threshold ?? 0.15}
            timeZone={timeZone}
          />
          {items.length > maxRows ? (
            <div className="border-t px-2 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-foreground-muted max-sm:min-h-10"
                render={<Link to={fullHref} />}
                nativeButton={false}
              >
                Xem tất cả {items.length} mục
                <ArrowUpRight />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};
