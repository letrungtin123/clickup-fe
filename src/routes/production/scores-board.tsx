import { Navigate, useLocation } from "react-router";

import { teamTabSearch } from "@/features/production/scores/person-link";

/**
 * /production/scores/board — the retired ranking ("Xếp hạng"). PD-069: everyone's points live in "Bảng điểm → Toàn đội";
 * old links and bookmarks land there (/production/scores?tab=team), keeping the period, the team and the ADMIN people
 * filter (?period=&team=&tag=&cf.<key>=). Whoever lacks "Xem điểm người khác" gets "Bảng điểm" (the tab is hidden).
 */
export const ProductionScoreBoardRoute = () => {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: "/production/scores", search: teamTabSearch(location.search) }}
      replace
    />
  );
};
