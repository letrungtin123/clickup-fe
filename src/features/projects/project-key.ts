/** Project keys: 2–12 uppercase letters/digits, starting with a letter (contract ProjectKeySchema). */
export const projectKeyPattern = /^[A-Z][A-Z0-9]{1,11}$/;

const toAscii = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (char) => (char === "đ" ? "d" : "D"));

/** Uppercases and strips everything a key cannot contain (used while typing). */
export const sanitizeProjectKey = (value: string) =>
  toAscii(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^[0-9]+/, "")
    .slice(0, 12);

/**
 * Suggests a key from a project name: initials for multi-word names ("Ứng dụng di động" → "UDDD"),
 * the first letters of a single word ("Marketing" → "MARK"), de-duplicated against existing keys.
 */
export const suggestProjectKey = (name: string, existingKeys: Iterable<string> = []) => {
  const words = toAscii(name)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const firstAlpha = words.findIndex((word) => /^[A-Z]/.test(word));
  if (firstAlpha === -1) {
    return "";
  }
  const usable = words.slice(firstAlpha);

  let base =
    usable.length >= 2
      ? usable
          .map((word) => word[0])
          .join("")
          .slice(0, 6)
      : (usable[0] ?? "").slice(0, 4);
  if (base.length < 2) {
    base = (usable[0] ?? "").slice(0, Math.max(2, Math.min(4, usable[0]?.length ?? 0)));
  }
  base = sanitizeProjectKey(base);
  if (base.length < 2) {
    base = `${base}${"P".repeat(2 - base.length)}`;
  }

  const taken = new Set([...existingKeys].map((key) => key.toUpperCase()));
  if (!taken.has(base)) {
    return base;
  }
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base.slice(0, 12 - String(suffix).length)}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  return base;
};
