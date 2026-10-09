/**
 * Preview of the whitelist paste box. Mirrors the API's tokenizer (commas, semicolons, spaces or
 * new lines; lower-cased; de-duplicated) so the count shown before submitting matches the result.
 */
const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export const MAX_EMAILS_PER_PASTE = 2000;

export const splitEmails = (text: string) => {
  const tokens = [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean)
    )
  ];
  const valid = tokens.filter((token) => token.length <= 254 && emailPattern.test(token));
  const validSet = new Set(valid);
  return { valid, invalid: tokens.filter((token) => !validSet.has(token)) };
};
