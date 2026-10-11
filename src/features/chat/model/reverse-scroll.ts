/**
 * Scroll maths for the inverted (`flex-col-reverse`) conversation: the virtualizer works with the distance
 * from the bottom ("offset", 0 = newest message).
 *
 * Engines report a column-reverse scrollTop in one of two ways: "negative" (CSSOM: 0 at the bottom, negative
 * upwards — Chromium ≥ 81, Firefox, Safari ≥ 14) or legacy "positive" (distance from the top). The mode is
 * detected once with a probe element and never inferred from live values: iOS rubber-banding briefly reports
 * a positive scrollTop at the bottom (and beyond-the-end values at the top), which once flipped the mode and
 * rendered the wrong rows until a reload. Live values are clamped to the scrollable range for the same reason.
 */
export type ReverseScrollMode = "negative" | "positive";

const maxOffset = (scrollHeight: number, clientHeight: number) => Math.max(0, scrollHeight - clientHeight);

/** Distance from the bottom for a raw scrollTop, clamped to [0, max] (overscroll bounces count as the edge). */
export const reverseOffsetFrom = (scrollTop: number, scrollHeight: number, clientHeight: number, mode: ReverseScrollMode) => {
  const max = maxOffset(scrollHeight, clientHeight);
  const raw = mode === "positive" ? max - scrollTop : -scrollTop;
  return Math.min(max, Math.max(0, raw));
};

/** Raw scrollTop that shows `offset` (distance from the bottom), clamped to the scrollable range. */
export const reverseScrollTopFor = (offset: number, scrollHeight: number, clientHeight: number, mode: ReverseScrollMode) => {
  const max = maxOffset(scrollHeight, clientHeight);
  const target = Math.min(max, Math.max(0, offset));
  return mode === "positive" ? max - target : target === 0 ? 0 : -target;
};

let detected: ReverseScrollMode | null = null;

/** The engine's column-reverse convention, probed once with an off-screen scroller. */
export const reverseScrollMode = (): ReverseScrollMode => {
  if (detected) return detected;
  if (typeof document === "undefined" || !document.body) return "negative";
  const outer = document.createElement("div");
  outer.style.cssText =
    "position:absolute;top:-9999px;left:-9999px;width:20px;height:20px;overflow:scroll;display:flex;flex-direction:column-reverse;visibility:hidden;pointer-events:none";
  const inner = document.createElement("div");
  inner.style.cssText = "flex-shrink:0;height:200px";
  outer.appendChild(inner);
  document.body.appendChild(outer);
  // Legacy engines start a column-reverse scroller at its maximum positive scrollTop; spec engines start at 0
  // and accept negative positions.
  if (outer.scrollTop > 0) {
    detected = "positive";
  } else {
    outer.scrollTop = -10;
    detected = outer.scrollTop < 0 ? "negative" : "positive";
  }
  outer.remove();
  return detected;
};
