import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef } from "react";

import { api } from "@/lib/api/client";
import { isAuthError } from "@/lib/api/errors";
import { qk } from "@/lib/query-keys";

import { sessionQueryOptions } from "./hooks";
import { announceSession, sessionSignalAction, subscribeSession } from "./session-sync";

/** At most one session re-check per this interval when the tab regains focus. */
const recheckMinIntervalMs = 15_000;

/** A full reload drops every cache, socket and store of the previous user in one step. */
const reloadForNewUser = () => window.location.reload();

/**
 * Keeps this tab on the same account as the session cookies (BUG-WK-16):
 * - announces the signed-in user to the other tabs; reloads when another tab signs in as someone else;
 * - signs out when another tab signs out;
 * - re-reads the session when the tab regains focus (cookies may have changed while it slept) and
 *   reloads if the user changed.
 * On /login (`userId` null) a sign-in elsewhere just refreshes the session so the page moves on.
 */
export const useCrossTabSession = (userId: string | null, onSignedOut: () => void) => {
  const queryClient = useQueryClient();
  const signOut = useEffectEvent(onSignedOut);
  const shownUser = useRef(userId);

  useEffect(() => {
    // Any session refetch (focus check, retry, invalidation) that returns another user: start over.
    if (userId && shownUser.current && shownUser.current !== userId) {
      reloadForNewUser();
      return;
    }
    shownUser.current = userId ?? shownUser.current;
    if (userId) announceSession({ type: "signed-in", userId });
  }, [userId]);

  useEffect(
    () =>
      subscribeSession((signal) => {
        const action = sessionSignalAction(userId, signal);
        if (action === "reload") reloadForNewUser();
        else if (action === "sign-out") signOut();
        else if (action === "refresh") {
          // Signed in elsewhere: the server rotated the CSRF token with that sign-in (SEC2-23).
          api.resetCsrfToken();
          void queryClient.refetchQueries({ queryKey: qk.session(), exact: true });
        }
      }),
    [queryClient, userId]
  );

  useEffect(() => {
    if (!userId) return undefined;
    let lastCheck = Date.now();
    const recheck = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < recheckMinIntervalMs) return;
      lastCheck = Date.now();
      queryClient.fetchQuery({ ...sessionQueryOptions, staleTime: 0 }).then(
        (next) => {
          if (next.user.id !== userId) reloadForNewUser();
        },
        (error: unknown) => {
          if (isAuthError(error)) signOut();
        }
      );
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [queryClient, userId]);
};
