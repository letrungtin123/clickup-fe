import { BellRing, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { useDesktopPermission, usePromptSnoozed } from "../hooks";
import { showDesktopNotification } from "../show";
import { snoozePrompt } from "../storage";
import { requestDesktopPermission } from "../support";

/** Let the page settle before asking (PD-055). */
const SHOW_AFTER_MS = 4000;

/**
 * One-time card at the bottom-right of the shell while the browser has not been asked yet
 * (`Notification.permission === "default"`): "Bật thông báo" asks (from the click — browsers require a gesture),
 * "Để sau" hides it for 7 days on this device. Granted / blocked → it never comes back; the settings card
 * (Cài đặt › Hồ sơ) covers the rest.
 */
export const EnableDesktopNotificationsPrompt = () => {
  const permission = useDesktopPermission();
  const snoozed = usePromptSnoozed();
  const [ready, setReady] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const open = ready && permission === "default" && !snoozed;

  const enable = () => {
    setAsking(true);
    void requestDesktopPermission().then((result) => {
      setAsking(false);
      if (result === "granted") {
        toast.success("Đã bật thông báo trên máy tính", {
          description: "Tin nhắn mới sẽ hiện lên cả khi bạn đang ở tab hoặc ứng dụng khác."
        });
        showDesktopNotification({
          title: "Nesso Work",
          body: "Thông báo trên máy tính đã hoạt động.",
          tag: "desktop-notify:welcome"
        });
      } else if (result === "denied") {
        toast("Trình duyệt đang chặn thông báo", {
          description: "Bạn có thể bật lại trong Cài đặt › Hồ sơ › Thông báo trên máy tính."
        });
      } else {
        // Closed without choosing: ask again later rather than right away.
        snoozePrompt(Date.now());
      }
    });
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          key="desktop-notify-prompt"
          aria-labelledby="desktop-notify-prompt-title"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 sm:left-auto sm:w-[22.5rem]"
        >
          <div className="relative overflow-hidden rounded-xl border bg-surface-raised p-4 shadow-lg">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-brand-soft/70 to-transparent"
            />
            <button
              type="button"
              aria-label="Đóng"
              onClick={() => snoozePrompt(Date.now())}
              className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-md text-foreground-subtle outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-9"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            <div className="relative flex gap-3 pr-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm">
                <BellRing className="size-5" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p id="desktop-notify-prompt-title" className="text-sm leading-snug font-semibold">
                  Bật thông báo trên máy tính để không bỏ lỡ tin nhắn
                </p>
                <p className="text-xs leading-relaxed text-foreground-muted">
                  Tin nhắn và việc mới sẽ hiện ở góc màn hình, kể cả khi bạn đang mở tab khác, dùng ứng dụng khác hay
                  thu nhỏ trình duyệt.
                </p>
              </div>
            </div>
            <div className="relative mt-3.5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => snoozePrompt(Date.now())}>
                Để sau
              </Button>
              <Button size="sm" onClick={enable} disabled={asking}>
                <BellRing aria-hidden="true" />
                Bật thông báo
              </Button>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
};
