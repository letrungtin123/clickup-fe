/**
 * Where a person on the ranking leads (PD-052): their "Điểm cá nhân" (/production/scores/person/:userId), or
 * "Bảng điểm của tôi" for your own row. A period other than the current one is kept (?period=YYYY-MM).
 */
export const personScoresPath = (userId: string, meId: string, period: string | null = null) => {
  const base =
    userId === meId
      ? "/production/scores"
      : `/production/scores/person/${encodeURIComponent(userId)}`;
  return period ? `${base}?period=${encodeURIComponent(period)}` : base;
};

/** The ranking ("Xếp hạng"), keeping a period other than the current one. */
export const boardPath = (period: string | null = null) =>
  period
    ? `/production/scores/board?period=${encodeURIComponent(period)}`
    : "/production/scores/board";
