/** Same shape the API resolves as a task key (search.service / tasks.query keyPattern): "WEB-12". */
const taskKeyPattern = /^([A-Za-z][A-Za-z0-9]{1,11})-(\d{1,12})$/;

/** The palette term as a canonical task key ("web-12" → "WEB-12"), or null when it is not one. */
export const asTaskKey = (term: string): string | null => {
  const match = taskKeyPattern.exec(term.trim());
  if (!match?.[1] || !match[2]) return null;
  return `${match[1].toUpperCase()}-${Number(match[2])}`;
};

/** The search hit whose key is exactly `key` (case-insensitive, leading zeros ignored). */
export const findTaskByKey = <T extends { key: string }>(tasks: readonly T[] | undefined, key: string | null) => {
  if (!key || !tasks) return undefined;
  return tasks.find((task) => asTaskKey(task.key) === key);
};
