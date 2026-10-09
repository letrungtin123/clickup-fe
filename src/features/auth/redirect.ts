type LocationLike = { pathname: string; search: string; hash?: string };

/** Only same-app absolute paths are allowed as post-login targets (no open redirects). */
export const safeReturnPath = (value: unknown): string | null => {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return null;
  }
  if (value.startsWith("/login")) {
    return null;
  }
  return value;
};

/** `/login?next=<current path>` (the path survives reloads, unlike router state). */
export const loginPath = (location: LocationLike) => {
  const current = `${location.pathname}${location.search}${location.hash ?? ""}`;
  const next = safeReturnPath(current);
  return next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";
};
