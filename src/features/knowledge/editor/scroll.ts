import { useEffect, useEffectEvent } from "react";

/** Closest ancestor that scrolls vertically (and has something to scroll). */
const scrollParent = (element: HTMLElement) => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
};

/**
 * Brings `element` into view by scrolling only its closest scroll area. `element.scrollIntoView()` also
 * scrolls overflow-hidden ancestors — the app shell — which pushes the sticky item bar off screen.
 * `offset` keeps a gap above the element ("start" / "nearest").
 */
export const scrollWithin = (
  element: HTMLElement,
  block: "start" | "center" | "nearest" = "nearest",
  { offset = 0, smooth = false }: { offset?: number; smooth?: boolean } = {}
) => {
  const parent = scrollParent(element);
  if (!parent) return;
  const box = parent.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  let delta = 0;
  if (block === "start") delta = rect.top - box.top - offset;
  else if (block === "center") delta = rect.top + rect.height / 2 - (box.top + box.height / 2);
  else if (rect.top < box.top + offset) delta = rect.top - box.top - offset;
  else if (rect.bottom > box.bottom) delta = Math.min(rect.bottom - box.bottom, rect.top - box.top - offset);
  if (Math.abs(delta) >= 1) parent.scrollTo({ top: parent.scrollTop + delta, behavior: smooth ? "smooth" : "auto" });
};

/**
 * On-screen keyboard: the shell and the knowledge sheets shrink to the visible area (ViewportSync's
 * --keyboard-inset on iOS, a smaller layout viewport on Android), which can leave the focused field or the
 * caret hidden below. When `element` (a scroll area) gets shorter while focus is inside it, the focused
 * field — or its closest `[data-keep-visible]` box, e.g. a composer with its send button — scrolls back
 * into view. `scrollCaret` may handle it first (a rich text editor scrolling its caret) and return true.
 */
export const useKeepFocusVisible = (element: HTMLElement | null, scrollCaret?: (active: HTMLElement) => boolean) => {
  const handleCaret = useEffectEvent((active: HTMLElement) => scrollCaret?.(active) ?? false);
  useEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    let height = element.clientHeight;
    const observer = new ResizeObserver(() => {
      const shrank = element.clientHeight < height;
      height = element.clientHeight;
      const active = document.activeElement;
      if (!shrank || !(active instanceof HTMLElement) || !element.contains(active)) return;
      if (handleCaret(active)) return;
      scrollWithin(active.closest<HTMLElement>("[data-keep-visible]") ?? active, "nearest", { offset: 8 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
};
