import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { JobLeaderTabs as JobScopeTabCounts, JobListScope } from "@/contracts/production-jobs";

import { formatInteger } from "../../format";

const TabCount = ({ value }: { value: number | undefined }) =>
  value === undefined ? null : (
    <span className="min-w-5 rounded-full bg-muted px-1.5 text-center text-[11px] leading-4 font-semibold text-foreground-muted tabular-nums group-data-active/scope-tab:bg-brand-soft group-data-active/scope-tab:text-brand-text">
      {formatInteger(value)}
    </span>
  );

/**
 * PD-078 — "Tất cả" / "Tôi quản lý" line tabs of the Job list and Tổng quan, for holders of LEADER or ADMIN (the page
 * decides, `scopeTabsShown`): the `?scope=` of the page. "Tôi quản lý" = everything under the projects I own. Each tab
 * shows its count for the other filters applied (the API's `leaderTabs`; none while they load).
 */
export const JobScopeTabs = ({
  value,
  counts,
  onChange,
  title
}: {
  value: JobListScope;
  counts: JobScopeTabCounts | null | undefined;
  onChange: (scope: JobListScope) => void;
  /** Tooltip of "Tôi quản lý". */
  title?: string;
}) => (
  <Tabs value={value} onValueChange={(next) => onChange(next === "mine" ? "mine" : "all")}>
    <TabsList variant="line" aria-label="Phạm vi" className="h-9 gap-3">
      <TabsTrigger value="all" className="group/scope-tab flex-none px-0.5 max-sm:min-h-10">
        Tất cả <TabCount value={counts?.all} />
      </TabsTrigger>
      <TabsTrigger
        value="mine"
        title={title ?? "Mọi Job Code, task và subtask của các Project do bạn phụ trách"}
        className="group/scope-tab flex-none px-0.5 max-sm:min-h-10"
      >
        Tôi quản lý <TabCount value={counts?.mine} />
      </TabsTrigger>
    </TabsList>
  </Tabs>
);
