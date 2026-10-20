import { useSearchParams } from "react-router";

import { closeDayOfPeriod, kpiPeriodOfDay } from "@/contracts/production-scores";

import { todayIn } from "../format";
import { useProductionMe } from "../hooks";
import { closeDaysOf, isPeriod, upcomingCloseDayChange } from "./periods";

export type ScoresTab = "overview" | "settled" | "team";

const tabOf = (value: string | null): ScoresTab =>
  value === "settled" ? "settled" : value === "team" ? "team" : "overview";

/** Filters only "Toàn đội" uses (team, ADMIN people filter): dropped when another tab is chosen. */
const isTeamParam = (name: string) => name === "team" || name === "tag" || name.startsWith("cf.");

/**
 * URL and settings state shared by "Bảng điểm của tôi" (/production/scores) and "Điểm cá nhân"
 * (/production/scores/person/:userId, PD-052): ?period=YYYY-MM (never after the current period),
 * ?tab=settled | team ("Toàn đội", PD-069 — /production/scores only) and the KPI close days.
 */
export const useScoresPageState = () => {
  const me = useProductionMe();
  const [params, setParams] = useSearchParams();

  const settings = me.data?.settings;
  const closeDays = closeDaysOf(settings);
  const today = todayIn(settings?.timezone ?? "Asia/Ho_Chi_Minh");
  const current = kpiPeriodOfDay(today, closeDays);
  const requested = params.get("period");
  const period = isPeriod(requested) && requested <= current ? requested : current;
  const tab = tabOf(params.get("tab"));

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );

  return {
    closeDays,
    today,
    current,
    period,
    tab,
    closeDay: closeDayOfPeriod(closeDays, current),
    change: upcomingCloseDayChange(closeDays, current),
    setTab: (next: ScoresTab) =>
      setParams(
        (previous) => {
          const result = new URLSearchParams(previous);
          if (next === "overview") result.delete("tab");
          else result.set("tab", next);
          if (next !== "team") {
            for (const name of [...result.keys()]) if (isTeamParam(name)) result.delete(name);
          }
          return result;
        },
        { replace: true }
      ),
    setPeriod: (next: string) => update({ period: next === current ? null : next })
  };
};
