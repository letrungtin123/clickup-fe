import { colorTokens, type ColorToken } from "@/contracts/work";

const tokenSet = new Set<string>(colorTokens);

export const isColorToken = (value: unknown): value is ColorToken =>
  typeof value === "string" && tokenSet.has(value);

/**
 * CSS classes that expose a contract color token as `--tone`, `--tone-soft` and `--tone-text`
 * (see styles.css). Use with arbitrary-value utilities: `bg-(--tone)`, `bg-(--tone-soft)`, `text-(--tone-text)`.
 */
export const toneClass = (color: ColorToken | (string & {}) | null | undefined) =>
  `tone tone-${isColorToken(color) ? color : "gray"}`;

export const colorTokenLabels: Record<ColorToken, string> = {
  slate: "Xám xanh",
  gray: "Xám",
  red: "Đỏ",
  orange: "Cam",
  amber: "Hổ phách",
  yellow: "Vàng",
  lime: "Xanh chanh",
  green: "Xanh lá",
  emerald: "Ngọc lục bảo",
  teal: "Xanh mòng két",
  cyan: "Xanh lơ",
  sky: "Xanh trời",
  blue: "Xanh dương",
  indigo: "Chàm",
  violet: "Tím violet",
  purple: "Tím",
  fuchsia: "Tím hồng",
  pink: "Hồng",
  rose: "Hồng đỏ"
};

/** Deterministic, well-spread color for an id (avatars, fallbacks). */
const avatarTones: readonly ColorToken[] = [
  "blue",
  "violet",
  "emerald",
  "orange",
  "pink",
  "teal",
  "indigo",
  "rose",
  "cyan",
  "amber",
  "purple",
  "green"
];

export const colorForId = (id: string): ColorToken => {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return avatarTones[Math.abs(hash) % avatarTones.length] ?? "blue";
};

export const initialsOf = (name: string | null | undefined) => {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  const first = words[0]?.[0] ?? "";
  // Vietnamese names put the given name last: "Trần Thị Linh" → "TL".
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : (words[0]?.[1] ?? "");
  return `${first}${last}`.toLocaleUpperCase("vi");
};
