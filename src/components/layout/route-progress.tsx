import { useEffect, useState } from "react";
import { useNavigation } from "react-router";

/** Below this a navigation feels instant: no bar (no flash on every click). */
const SHOW_AFTER_MS = 150;

/**
 * Thin bar at the top of the window while the router is loading the next page (owner, 2026-10-20: "click sidebar đôi
 * khi không ăn"). Routes are lazy: the URL only changes once the page's code has arrived, so on a slow connection a
 * click used to show nothing at all. The bar answers the click right away; the page follows when ready.
 */
export const RouteProgress = () => {
  const navigation = useNavigation();
  // The navigation under way (its target location), null when idle.
  const pending = navigation.state === "idle" ? null : (navigation.location?.key ?? "pending");
  const [shownFor, setShownFor] = useState<string | null>(null);

  useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => setShownFor(pending), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (pending === null || shownFor !== pending) return null;
  return (
    <div
      role="progressbar"
      aria-label="Đang mở trang"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-brand/15"
    >
      <div className="h-full w-2/5 animate-route-progress rounded-full bg-brand motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-70" />
    </div>
  );
};
