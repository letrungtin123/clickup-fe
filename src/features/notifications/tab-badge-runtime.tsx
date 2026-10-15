import { useEffect } from "react";

import { useUnreadNotificationCount } from "./hooks";
import { BASE_FAVICON, drawBadgedFavicon, titleWithCount } from "./tab-badge";

const iconLink = () => {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  return link;
};

/**
 * Keeps the browser tab in step with the unread notification count (the same query as the bell, kept live by the
 * realtime "notification:new" events): a red badge on the favicon and "(N) " before the title, so a background tab
 * shows that something is waiting. Mounted once in ShellServices.
 */
export const TabBadgeRuntime = () => {
  const unread = useUnreadNotificationCount();
  const count = unread.data ?? 0;

  useEffect(() => {
    const link = iconLink();
    const badged = count > 0 ? drawBadgedFavicon(count) : null;
    link.type = badged ? "image/png" : "image/svg+xml";
    link.href = badged ?? BASE_FAVICON;
    document.title = titleWithCount(document.title, count);
    // Pages may change the title later: keep the prefix on it.
    const titleNode = document.querySelector("title");
    if (!titleNode) return undefined;
    const observer = new MutationObserver(() => {
      const next = titleWithCount(document.title, count);
      if (next !== document.title) document.title = next;
    });
    observer.observe(titleNode, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [count]);

  // Leaving the authenticated shell (sign-out): plain icon and title again.
  useEffect(
    () => () => {
      iconLink().href = BASE_FAVICON;
      document.title = titleWithCount(document.title, 0);
    },
    []
  );

  return null;
};
