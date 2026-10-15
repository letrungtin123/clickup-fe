/**
 * Browser tab badge (owner, 2026-10-15): people keep many tabs open, so the tab itself shows unread notifications —
 * a red dot with the count on the favicon and "(N) " before the page title. 0 restores the plain icon and title.
 * Pure helpers here (unit-tested); the hook lives in tab-badge-runtime.tsx.
 */

export const BASE_FAVICON = "/favicon.svg";

/** The badge text: 1–9, then "9+". */
export const badgeLabel = (count: number) => (count > 9 ? "9+" : String(count));

/** "(N) " prefixed to a title, replacing an earlier prefix; no prefix for 0. */
export const titleWithCount = (title: string, count: number) => {
  const base = title.replace(/^\(\d+\+?\)\s+/, "");
  return count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
};

/**
 * Draws the favicon with its badge on a 64×64 canvas and returns it as a data URL (null when the browser cannot draw):
 * the brand square with its "N", and a red circle at the top-right with the count.
 */
export const drawBadgedFavicon = (count: number, doc: Document = document): string | null => {
  const canvas = doc.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Brand square (same as public/favicon.svg).
  ctx.fillStyle = "#0e8a5f";
  ctx.beginPath();
  ctx.roundRect(0, 0, 64, 64, 14);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", 26, 35);
  // Badge: a red circle with a thin ring so it reads on light and dark tab bars.
  const label = badgeLabel(count);
  const radius = label.length > 1 ? 21 : 19;
  ctx.beginPath();
  ctx.arc(64 - radius + 1, radius - 1, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#e5484d";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${label.length > 1 ? 22 : 28}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.fillText(label, 64 - radius + 1, radius + 1);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
};
