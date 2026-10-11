/**
 * Module-level caches that must not outlive a session (signing out does not reload the page). Features
 * register a cleanup when their module loads; the auth hooks run them when the session ends, without
 * importing those features (no import cycles, lazy chunks stay lazy).
 *
 *   "signed-out"  the user chose "Đăng xuất" in this tab (drop everything kept on this device)
 *   "ended"       any end of the session: sign-out, expiry, signed out in another tab
 */
export type SessionEndReason = "signed-out" | "ended";

const listeners = new Set<(reason: SessionEndReason) => void>();

export const onSessionEnd = (listener: (reason: SessionEndReason) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const notifySessionEnd = (reason: SessionEndReason) => {
  for (const listener of [...listeners]) {
    try {
      listener(reason);
    } catch {
      // One failing cleanup must not stop the others (or the sign-out).
    }
  }
};
