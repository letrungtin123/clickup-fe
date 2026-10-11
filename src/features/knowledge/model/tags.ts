import { knowledgeLimits } from "@/contracts/knowledge";

/** A tag as the contract accepts it: trimmed, 1–40 chars, no comma / # / control characters. */
export const cleanTag = (raw: string) =>
  raw
    .replace(/[#,]/g, " ")
    // eslint-disable-next-line no-control-regex -- control characters are stripped from tags
    .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, knowledgeLimits.tagLength);

/** Adds a tag unless empty, duplicate (case-insensitive) or over the limit. */
export const addTag = (tags: readonly string[], raw: string): string[] => {
  const tag = cleanTag(raw);
  if (!tag || tags.length >= knowledgeLimits.tagsPerItem) return [...tags];
  const lower = tag.toLocaleLowerCase("vi");
  if (tags.some((entry) => entry.toLocaleLowerCase("vi") === lower)) return [...tags];
  return [...tags, tag];
};
