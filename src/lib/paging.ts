/**
 * Error state of a cursor-paged (infinite) query (BUG-WK-01). TanStack keeps loaded pages when a later
 * page or a background refetch fails, but flags the whole query as errored — screens must only replace
 * their content when nothing was loaded.
 *
 * - "none":    no error;
 * - "initial": the first page failed — nothing to show, render the full error state;
 * - "next":    the next page failed — keep the rows, show an inline "Thử lại" where more would load;
 * - "refresh": a background refetch failed — keep the rows (the next refetch / event recovers).
 */
export type PagedErrorKind = "none" | "initial" | "next" | "refresh";

export const pagedErrorKind = (query: {
  isError: boolean;
  data: unknown;
  isFetchNextPageError: boolean;
}): PagedErrorKind => {
  if (!query.isError) return "none";
  if (query.data === undefined) return "initial";
  return query.isFetchNextPageError ? "next" : "refresh";
};

/** Auto-loading (scroll near the end) must stop after a failed page, or it retries in a tight loop. */
export const canAutoLoadNextPage = (query: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
}) => query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError;
