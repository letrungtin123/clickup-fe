const combiningMarks = new RegExp("[\\u0300-\\u036f]", "g");

/** Lowercase without Vietnamese diacritics ("Trần" → "tran", "Đức" → "duc"). */
export const fold = (value: string) =>
  value.normalize("NFD").replace(combiningMarks, "").replace(/đ/gi, "d").toLowerCase();

/** People whose first / last name starts with the query come first (server order otherwise). */
export const rankPeople = <T extends { displayName: string; email: string | null }>(
  people: readonly T[],
  query: string
): T[] => {
  const needle = fold(query.trim());
  if (!needle) return [...people];
  const score = (person: T) => {
    const words = fold(person.displayName).split(/\s+/);
    if (words.some((word) => word.startsWith(needle))) return 0;
    if ((person.email ?? "").toLowerCase().startsWith(needle)) return 1;
    return 2;
  };
  return people
    .map((person, index) => ({ person, index, rank: score(person) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.person);
};
