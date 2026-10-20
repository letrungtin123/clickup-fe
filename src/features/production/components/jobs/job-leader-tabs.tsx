import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { JobLeaderTabs as JobLeaderTabCounts } from "@/contracts/production-jobs";

import { formatInteger } from "../../format";
import type { JobLeaderTab } from "../../jobs-model";

const TabCount = ({ value }: { value: number | undefined }) =>
  value === undefined ? null : (
    <span className="min-w-5 rounded-full bg-muted px-1.5 text-center text-[11px] leading-4 font-semibold text-foreground-muted tabular-nums group-data-active/leader-tab:bg-brand-soft group-data-active/leader-tab:text-brand-text">
      {formatInteger(value)}
    </span>
  );

/**
 * PD-073 — "Tất cả" / "Tôi quản lý" line tabs of the job list, for holders of LEADER (the page decides): just the
 * `?leader=` filter (jobsModel `jobLeaderTabOf`). Each tab shows its job count for the other filters applied (facets
 * `leaderTabs`; none while they load). `value` null: a link names another leader (or "none") — no tab is selected,
 * its chip shows in the filter bar.
 */
export const JobLeaderTabs = ({
  value,
  counts,
  onChange
}: {
  value: JobLeaderTab | null;
  counts: JobLeaderTabCounts | null | undefined;
  onChange: (tab: JobLeaderTab) => void;
}) => (
  <Tabs value={value} onValueChange={(next) => onChange(next === "mine" ? "mine" : "all")}>
    <TabsList variant="line" aria-label="Phạm vi job" className="h-9 gap-3">
      <TabsTrigger value="all" className="group/leader-tab flex-none px-0.5 max-sm:min-h-10">
        Tất cả <TabCount value={counts?.all} />
      </TabsTrigger>
      <TabsTrigger value="mine" className="group/leader-tab flex-none px-0.5 max-sm:min-h-10">
        Tôi quản lý <TabCount value={counts?.mine} />
      </TabsTrigger>
    </TabsList>
  </Tabs>
);
