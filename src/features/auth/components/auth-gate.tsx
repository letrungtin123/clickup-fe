import { lazy, Suspense, useEffect } from "react";
import { Navigate, useLocation } from "react-router";

import { ErrorState } from "@/components/shared/states";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api/client";
import { isAuthError } from "@/lib/api/errors";
import { useRealtimeConnection } from "@/lib/realtime/hooks";

import { useEndSession, useSession } from "../hooks";
import { SessionValueContext } from "../session-context";
import { loginPath } from "../redirect";

const AppShell = lazy(() =>
  import("@/components/layout/app-shell").then((module) => ({ default: module.AppShell }))
);
const ForcedPasswordChange = lazy(() =>
  import("./forced-password-change").then((module) => ({ default: module.ForcedPasswordChange }))
);

/** Brand splash shown only while the very first session check is in flight. */
export const AppSplash = ({ label = "Đang mở không gian làm việc" }: { label?: string }) => (
  <div
    className="flex h-dvh flex-col items-center justify-center gap-4 bg-canvas"
    role="status"
    aria-live="polite"
  >
    <span className="bg-brand-fill flex size-10 items-center justify-center rounded-xl text-base font-semibold text-brand-foreground shadow-md">
      N
    </span>
    <span className="flex items-center gap-2 text-[13px] text-foreground-muted">
      <Spinner className="size-3.5" />
      {label}
    </span>
  </div>
);

/**
 * Root of every authenticated route. Resolves the session (refreshing once if the access cookie
 * expired), sends signed-out users to /login with their return path, forces the temporary-password
 * change for provisioned accounts, and owns the realtime connection.
 */
export const AuthGate = () => {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) {
    return <AppSplash />;
  }

  if (session.isError) {
    if (isAuthError(session.error)) {
      return <Navigate to={loginPath(location)} replace />;
    }
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas p-4">
        <ErrorState
          error={session.error}
          onRetry={() => void session.refetch()}
          retrying={session.isFetching}
        />
      </div>
    );
  }

  return (
    <SessionValueContext value={session.data}>
      {session.data.mustChangePassword ? (
        <Suspense fallback={<AppSplash />}>
          <ForcedPasswordChange />
        </Suspense>
      ) : (
        <AuthenticatedApp />
      )}
    </SessionValueContext>
  );
};

const AuthenticatedApp = () => {
  const endSession = useEndSession();

  // A request that stays 401 after a refresh attempt means the session is gone.
  useEffect(() => {
    api.setUnauthorizedHandler(() => endSession(loginPath(window.location)));
    return () => api.setUnauthorizedHandler(null);
  }, [endSession]);

  useRealtimeConnection(() => endSession(loginPath(window.location)));

  return (
    <Suspense fallback={<AppSplash />}>
      <AppShell />
    </Suspense>
  );
};
