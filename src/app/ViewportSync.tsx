import { useEffect } from "react";

const editableSelector =
  "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]";

/**
 * Mirrors the on-screen keyboard into CSS so full-height surfaces keep their composer in view:
 *
 *   --keyboard-inset             px of the layout viewport the keyboard covers. iOS Safari overlays
 *                                the keyboard (the layout viewport keeps its height); Android
 *                                resizes the layout viewport (`interactive-widget=resizes-content`
 *                                in index.html), so the inset stays 0 there and dvh shrinks instead.
 *   html[data-keyboard="open"]   while a text field is focused and a keyboard is up (drops the
 *                                home-indicator padding, see --safe-bottom in styles.css).
 *
 * Writes go straight to <html> (no React state), batched to one per frame.
 */
export const ViewportSync = () => {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const root = document.documentElement;
    let frame = 0;
    let tallest = { width: 0, height: 0 };

    const update = () => {
      frame = 0;
      const inset = Math.max(
        0,
        Math.round(root.clientHeight - viewport.height - viewport.offsetTop)
      );
      // Tallest viewport seen at this width = "no keyboard" baseline (rotation resets it).
      if (tallest.width !== Math.round(viewport.width) || viewport.height > tallest.height) {
        tallest = { width: Math.round(viewport.width), height: viewport.height };
      }
      const focused = document.activeElement?.matches(editableSelector) ?? false;
      const open = focused && (inset > 80 || tallest.height - viewport.height > 120);
      root.style.setProperty("--keyboard-inset", `${inset}px`);
      if (open) root.dataset.keyboard = "open";
      else delete root.dataset.keyboard;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      root.style.removeProperty("--keyboard-inset");
      delete root.dataset.keyboard;
    };
  }, []);

  return null;
};
