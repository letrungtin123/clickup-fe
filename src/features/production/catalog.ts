/** Small pure helpers shared by the catalog pages. Unit tested in catalog.test.ts. */

/** Accent/case-insensitive form for Vietnamese search ("Đơn giá" ~ "don gia"). */
export const foldText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();

/** True when every word of `query` appears in one of `fields`. */
export const matchesQuery = (query: string, ...fields: (string | null | undefined)[]) => {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = foldText(fields.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
};

type Sortable = { id: string; sortOrder: number };

/** New sort orders (10, 20, …) for a reordered list; only rows whose value changes are returned. */
export const sortOrderChanges = <T extends Sortable>(ordered: readonly T[]) =>
  ordered.flatMap((item, index) => {
    const sortOrder = (index + 1) * 10;
    return item.sortOrder === sortOrder ? [] : [{ item, sortOrder }];
  });

/** Next sort order for an appended row. */
export const nextSortOrder = (items: readonly { sortOrder: number }[]) =>
  Math.min(10_000, (items.reduce((max, item) => Math.max(max, item.sortOrder), 0) || 0) + 10);

/** Active rows first (original order kept), archived ones hidden unless requested. */
export const visibleRows = <T extends { active: boolean }>(
  items: readonly T[],
  showArchived: boolean
) =>
  showArchived
    ? [...items].sort((a, b) => Number(b.active) - Number(a.active))
    : items.filter((item) => item.active);

/** Case-insensitive duplicate check used before the API's unique index answers 409. */
export const hasDuplicateName = <T extends { id: string; name: string }>(
  items: readonly T[],
  name: string,
  exceptId?: string | null
) => {
  const target = name.trim().toLocaleLowerCase("vi");
  return items.some(
    (item) => item.id !== exceptId && item.name.trim().toLocaleLowerCase("vi") === target
  );
};
