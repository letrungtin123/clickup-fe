export type AccentMode = "solid" | "gradient";

export type AccentKey =
  | "emerald"
  | "blue"
  | "violet"
  | "rose"
  | "amber"
  | "teal"
  | "indigo"
  | "graphite"
  | "emerald-cyan"
  | "blue-violet"
  | "rose-amber"
  | "indigo-sky"
  | "graphite-lime"
  | "fuchsia-orange"
  | "teal-emerald";

export type AccentPalette = {
  key: AccentKey;
  label: string;
  mode: AccentMode;
  swatch: string;
};

export const solidAccentOptions = [
  { key: "emerald", label: "Xanh lá", mode: "solid", swatch: "#0f9f6e" },
  { key: "blue", label: "Xanh dương", mode: "solid", swatch: "#2f6fed" },
  { key: "violet", label: "Tím", mode: "solid", swatch: "#6d4aff" },
  { key: "rose", label: "Hồng", mode: "solid", swatch: "#c93662" },
  { key: "amber", label: "Vàng cam", mode: "solid", swatch: "#9a5d08" },
  { key: "teal", label: "Xanh ngọc", mode: "solid", swatch: "#0d8f87" },
  { key: "indigo", label: "Chàm", mode: "solid", swatch: "#4f46e5" },
  { key: "graphite", label: "Than chì", mode: "solid", swatch: "#4b5563" }
] as const satisfies readonly AccentPalette[];

export const gradientAccentOptions = [
  {
    key: "emerald-cyan",
    label: "Xanh lá - xanh biển",
    mode: "gradient",
    swatch: "linear-gradient(135deg, #0f9f6e, #06b6d4)"
  },
  {
    key: "blue-violet",
    label: "Xanh dương - tím",
    mode: "gradient",
    swatch: "linear-gradient(135deg, #2563eb, #7c3aed)"
  },
  {
    key: "rose-amber",
    label: "Hồng - vàng cam",
    mode: "gradient",
    swatch: "linear-gradient(135deg, #d13f6b, #d97706)"
  },
  {
    key: "indigo-sky",
    label: "Chàm - xanh trời",
    mode: "gradient",
    swatch: "linear-gradient(135deg, #4338ca, #0ea5e9)"
  },
  {
    key: "graphite-lime",
    label: "Than chì - xanh chanh",
    mode: "gradient",
    swatch: "linear-gradient(135deg, #111827, #65a30d)"
  },
  {
    key: "fuchsia-orange",
    label: "Tím hồng - cam",
    mode: "gradient",
    swatch: "linear-gradient(135deg, #c026d3, #ea580c)"
  },
  {
    key: "teal-emerald",
    label: "Xanh ngọc - xanh lá",
    mode: "gradient",
    swatch: "linear-gradient(135deg, #0f766e, #22c55e)"
  }
] as const satisfies readonly AccentPalette[];

export const accentOptions = [...solidAccentOptions, ...gradientAccentOptions] as const;

export const defaultAccentMode: AccentMode = "solid";
export const defaultAccentKey: AccentKey = "emerald";

export const getAccentPalette = (key: unknown): AccentPalette | undefined =>
  accentOptions.find((option) => option.key === key);

export const getFallbackAccentKey = (mode: AccentMode): AccentKey =>
  mode === "gradient" ? gradientAccentOptions[0].key : solidAccentOptions[0].key;

export const getAccentKeyForMode = (mode: AccentMode, currentKey: unknown): AccentKey => {
  const currentPalette = getAccentPalette(currentKey);
  return currentPalette?.mode === mode ? currentPalette.key : getFallbackAccentKey(mode);
};
