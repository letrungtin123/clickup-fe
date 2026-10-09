import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/query-keys";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** Toast copy on failure. `false` = the caller renders the error itself. */
      errorMessage?: string | false;
      successMessage?: string;
    };
  }
}

/** Retry transient failures only; never retry auth/permission/validation/not-found errors. */
const shouldRetry = (failureCount: number, error: unknown) => {
  if (isApiError(error)) {
    if (error.status === 0 || error.status >= 500) {
      return failureCount < 2;
    }
    return false;
  }
  return failureCount < 1;
};

/** The server can start requiring a password change mid-session (admin reset): re-read the session. */
const isPasswordChangeRequired = (error: unknown) =>
  isApiError(error) && error.code === "PASSWORD_CHANGE_REQUIRED";

export const createQueryClient = () => {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true
      },
      mutations: {
        retry: false
      }
    },
    queryCache: new QueryCache({
      onError: (error) => {
        if (isPasswordChangeRequired(error))
          void client.invalidateQueries({ queryKey: qk.session() });
      }
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (isPasswordChangeRequired(error)) {
          void client.invalidateQueries({ queryKey: qk.session() });
          return;
        }
        const message = mutation.meta?.errorMessage;
        if (message === false) {
          return;
        }
        toast.error(getErrorMessage(error, message ?? undefined));
      },
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.successMessage) {
          toast.success(mutation.meta.successMessage);
        }
      }
    })
  });
  return client;
};
