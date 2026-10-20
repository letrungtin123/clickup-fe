/**
 * Where a person of "Toàn đội" leads (PD-052, PD-069): their "Điểm cá nhân" (/production/scores/person/:userId), or
 * "Bảng điểm của tôi" for your own row. A period other than the current one is kept (?period=YYYY-MM).
 */
export const personScoresPath = (userId: string, meId: string, period: string | null = null) => {
  const base =
    userId === meId
      ? "/production/scores"
      : `/production/scores/person/${encodeURIComponent(userId)}`;
  return period ? `${base}?period=${encodeURIComponent(period)}` : base;
};

/** "Bảng điểm của tôi", keeping a period other than the current one. */
export const myScoresPath = (period: string | null = null) =>
  period ? `/production/scores?period=${encodeURIComponent(period)}` : "/production/scores";

/**
 * "Bảng điểm → Toàn đội" (PD-069), keeping a period other than the current one and, optionally, the team filter.
 * Replaces the retired ranking (/production/scores/board, which now redirects here).
 */
export const teamScoresPath = (period: string | null = null, teamId: string | null = null) => {
  const params = new URLSearchParams({ tab: "team" });
  if (period) params.set("period", period);
  if (teamId) params.set("team", teamId);
  return `/production/scores?${params.toString()}`;
};

/**
 * The retired ranking's query (/production/scores/board?…) as the "Toàn đội" tab's: `tab=team` plus the period, the
 * team and the ADMIN people filter (nothing else).
 */
export const teamTabSearch = (search: string) => {
  const previous = new URLSearchParams(search);
  const next = new URLSearchParams({ tab: "team" });
  for (const [name, value] of previous) {
    if (name === "period" || name === "team" || name === "tag" || name.startsWith("cf.")) {
      next.append(name, value);
    }
  }
  return `?${next.toString()}`;
};
