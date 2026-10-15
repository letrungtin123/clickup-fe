import { useSearchParams } from "react-router";

import { closeDayOfPeriod, kpiPeriodOfDay } from "@/contracts/production-scores";

import { todayIn } from "../format";
import { useProductionMe } from "../hooks";
import { closeDaysOf, isPeriod, upcomingCloseDayChange } from "./periods";

export type ScoresTab = "overview" | "settled";

/**
 * URL and settings state shared by "Bảng điểm của tôi" (/production/scores) and "Điểm cá nhân"
 * (/production/scores/person/:userId, PD-052): ?period=YYYY-MM (never after the current period) and
 * ?tab=settled, the KPI close days and the Khoán pay policy (PD-033; ALWAYS while /me loads).
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
  const tab: ScoresTab = params.get("tab") === "settled" ? "settled" : "overview";

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
    khoanPolicy: settings?.khoanPayPolicy ?? "ALWAYS",
    setTab: (next: ScoresTab) => update({ tab: next === "settled" ? "settled" : null }),
    setPeriod: (next: string) => update({ period: next === current ? null : next })
  };
};
