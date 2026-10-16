import { useEffect } from "react";
import { toast } from "sonner";

import { currentEntryScript, entryScriptOf, UPDATE_CHECK_MS } from "./entry-script";

const TOAST_ID = "app-update";

const offerReload = () =>
  toast("Đã có phiên bản mới của Nesso Work", {
    id: TOAST_ID,
    description: "Tải lại trang để dùng bản mới nhất (việc đang làm dở hãy lưu trước).",
    action: { label: "Tải lại", onClick: () => window.location.reload() },
    duration: Number.POSITIVE_INFINITY
  });

/**
 * New-version notice (owner, 2026-10-16: "click xong không ăn"): after a deploy an open tab still runs the old build.
 * It now (1) asks every few minutes, on focus and when the tab becomes visible, whether index.html names another entry
 * chunk, and (2) catches a lazily loaded chunk that is gone (`vite:preloadError`) — instead of a click that silently
 * does nothing, a lasting toast offers "Tải lại". Never reloads on its own (unsaved work). Mounted once in
 * ShellServices; does nothing in the dev server.
 */
export const UpdateNoticeRuntime = () => {
  useEffect(() => {
    const running = currentEntryScript();
    const onPreloadError = (event: Event) => {
      event.preventDefault();
      offerReload();
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    if (!running) {
      return () => window.removeEventListener("vite:preloadError", onPreloadError);
    }

    let stopped = false;
    let lastCheck = 0;
    const check = async () => {
      const now = Date.now();
      if (stopped || now - lastCheck < 30_000) return;
      lastCheck = now;
      try {
        const response = await fetch("/index.html", { cache: "no-store" });
        if (!response.ok) return;
        const deployed = entryScriptOf(await response.text());
        if (deployed && deployed !== running) offerReload();
      } catch {
        // Offline or the server restarting: try again later.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = window.setInterval(() => void check(), UPDATE_CHECK_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("vite:preloadError", onPreloadError);
    };
  }, []);

  return null;
};
