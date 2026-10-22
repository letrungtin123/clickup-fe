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

/**
 * A contract color token as a CSS color for chart marks (SVG fills / strokes, which cannot take the `.tone` classes):
 * the token's hue and chroma (styles.css `.tone-*`) at the solid-fill lightness `--tone-solid-l` (the same in both
 * themes, inside the readable band of a chart mark on light and dark surfaces). Light tokens are lifted a little less
 * than their chips so they stay in that band.
 */
const toneHueChroma: Record<ColorToken, readonly [chroma: number, hue: number, lift: number]> = {
  slate: [0.035, 255, 0],
  gray: [0.008, 265, 0],
  red: [0.2, 25, 0],
  orange: [0.17, 48, 0],
  amber: [0.16, 72, 0.06],
  yellow: [0.16, 95, 0.06],
  lime: [0.18, 130, 0.04],
  green: [0.16, 150, 0],
  emerald: [0.14, 165, 0],
  teal: [0.11, 185, 0],
  cyan: [0.12, 212, 0],
  sky: [0.14, 235, 0],
  blue: [0.19, 260, 0],
  indigo: [0.19, 277, 0],
  violet: [0.21, 292, 0],
  purple: [0.22, 307, 0],
  fuchsia: [0.24, 325, 0],
  pink: [0.2, 350, 0],
  rose: [0.2, 10, 0]
};

export const toneChartColor = (color: ColorToken | (string & {}) | null | undefined) => {
  const [chroma, hue, lift] = toneHueChroma[isColorToken(color) ? color : "gray"];
  return `oklch(calc(var(--tone-solid-l) + ${lift}) ${chroma} ${hue})`;
};
