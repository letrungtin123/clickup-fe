import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useContext, useMemo } from "react";
import { useNavigate } from "react-router";

import { api } from "@/lib/api/client";
import { isAuthError } from "@/lib/api/errors";
import type { SessionContext } from "@/lib/api/schemas";
import { qk } from "@/lib/query-keys";
import { disconnectRealtime } from "@/lib/realtime/socket";

import { authApi } from "./api";
import { can as canFn, type PermissionLike } from "./permissions";
import { SessionValueContext } from "./session-context";
import { announceSession } from "./session-sync";

export const sessionQueryOptions = {
  queryKey: qk.session(),
  queryFn: ({ signal }: { signal: AbortSignal }) => authApi.getContext(signal),
  staleTime: 5 * 60_000,
  retry: (failureCount: number, error: unknown) => !isAuthError(error) && failureCount < 2
};

/** The session query. `data` is null-free: use `useSessionContext` inside the authenticated shell. */
export const useSession = () => useQuery(sessionQueryOptions);

/** Extra sign-in methods (Google) for the login page; failure simply means "password only". */
export const useAuthProviders = () =>
  useQuery({
    queryKey: ["auth", "providers"] as const,
    queryFn: ({ signal }) => authApi.providers(signal),
    staleTime: 5 * 60_000,
    retry: false
  });

/** Session for components rendered inside the authenticated shell (provided by AuthGate). */
export const useSessionContext = (): SessionContext => {
  const value = useContext(SessionValueContext);
  if (!value) {
    throw new Error("useSessionContext must be used inside the authenticated app shell.");
  }
  return value;
};

/**
 * Leaves the authenticated app: navigate away first so the shell unmounts, then drop every cached
 * query (no data from this session may survive into the next one) and the realtime connection.
 */
export const useEndSession = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    (to: string) => {
      disconnectRealtime();
      api.resetCsrfToken();
      void Promise.resolve(navigate(to, { replace: true })).finally(() => queryClient.clear());
    },
    [navigate, queryClient]
  );
};

/** Permission gate for UX only — the API enforces every rule again. Unknown keys simply return false. */
export const usePermissions = () => {
  const session = useSessionContext();
  return useMemo(() => {
    const granted = new Set(session.role.permissions);
    const full = session.hasFullOrganizationAuthority;
    return {
      can: (permission: PermissionLike) => canFn({ granted, full }, permission),
      hasFullAuthority: full
    };
  }, [session.hasFullOrganizationAuthority, session.role.permissions]);
};

export const useLogout = () => {
  const endSession = useEndSession();

  const mutation = useMutation({
    mutationFn: authApi.logout,
    meta: { errorMessage: false },
    onSettled: () => {
      // The cookies are gone for every tab: tell the others to leave too (BUG-WK-16).
      announceSession({ type: "signed-out" });
      endSession("/login");
    }
  });

  const logout = useCallback(() => mutation.mutate(), [mutation]);
  return { logout, isPending: mutation.isPending };
};
