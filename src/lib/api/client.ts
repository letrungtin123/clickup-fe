import type { z } from "zod";

import { ApiErrorSchema } from "@/contracts/schemas";
import { webEnv } from "@/lib/env";

import { ApiError, ClientErrorCode, isAbortError, isAuthError } from "./errors";
import { CsrfResponseSchema, SessionResponseSchema } from "./schemas";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export type QueryValue = string | number | boolean | null | undefined | readonly string[];

/**
 * - `default`: on 401 refresh the session once and retry; if that fails notify the unauthorized handler
 *   (the app redirects to /login, preserving the return path).
 * - `silent`: same refresh + retry, but never triggers the redirect (session probes).
 * - `none`: no refresh (the auth endpoints themselves).
 */
export type AuthMode = "default" | "silent" | "none";

export type RequestOptions<T> = {
  method?: HttpMethod;
  query?: Record<string, QueryValue> | undefined;
  body?: unknown;
  signal?: AbortSignal | undefined;
  schema: z.ZodType<T>;
  auth?: AuthMode;
  /**
   * Survive the page going away (pagehide / tab hidden): `fetch(..., { keepalive: true })`. With a
   * cached CSRF token the request is issued synchronously, inside the unload handler.
   */
  keepalive?: boolean | undefined;
};

type Shorthand = {
  query?: Record<string, QueryValue> | undefined;
  signal?: AbortSignal | undefined;
  auth?: AuthMode;
  keepalive?: boolean | undefined;
};

/** Browsers cap in-flight keepalive bodies at 64 KiB; stay below it. */
export const maxKeepaliveBodyBytes = 60_000;

type RetryState = { csrfRetried: boolean; authRetried: boolean };

export type ApiClientConfig = {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Logs response-shape mismatches (dev only by default). */
  onInvalidResponse?: (path: string, issues: unknown) => void;
};

export const csrfHeaderName = "x-csrf-token";

export const buildQueryString = (query: Record<string, QueryValue> | undefined) => {
  if (!query) {
    return "";
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        params.set(key, value.join(","));
      }
      continue;
    }
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
};

const readJson = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The envelope's optional machine-readable `error.details` (e.g. the task ids of TASK_QTY_REQUIRED). */
const errorDetails = (payload: unknown) => {
  const error = isRecord(payload) ? payload.error : undefined;
  return isRecord(error) && isRecord(error.details) ? error.details : null;
};

const toApiError = (status: number, payload: unknown) => {
  const parsed = ApiErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiError({ status, ...parsed.data.error, details: errorDetails(payload) });
  }
  return new ApiError({
    status,
    code: status >= 500 ? "INTERNAL_SERVER_ERROR" : ClientErrorCode.Unknown,
    message: `Request failed with status ${status}`
  });
};

/**
 * Small typed wrapper around fetch (tech-stack §18):
 * - same-origin cookies (`credentials: include`), JSON in/out, AbortSignal passthrough;
 * - CSRF double-submit: token fetched once from GET /auth/csrf, kept in memory, sent on unsafe methods,
 *   refetched + retried once on 403 CSRF_INVALID;
 * - 401 AUTH_REQUIRED/AUTH_INVALID → single-flight POST /auth/refresh, retry once, else unauthorized handler;
 * - every success body is validated with the caller's zod schema.
 */
export const createApiClient = (config: ApiClientConfig) => {
  const fetchImpl: typeof fetch = config.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const onInvalidResponse =
    config.onInvalidResponse ??
    ((path: string, issues: unknown) => {
      if (import.meta.env.DEV) {
        console.error(`[api] Response for ${path} did not match its contract`, issues);
      }
    });

  let csrfToken: string | null = null;
  let csrfInflight: Promise<string> | null = null;
  let refreshInflight: Promise<boolean> | null = null;
  const refreshListeners = new Set<() => void>();
  let unauthorizedHandler: (() => void) | null = null;

  const url = (path: string, query?: Record<string, QueryValue>) =>
    `${config.baseUrl}${path}${buildQueryString(query)}`;

  const send = async (input: string, init: RequestInit) => {
    try {
      return await fetchImpl(input, init);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw new ApiError({
        status: 0,
        code: ClientErrorCode.Network,
        message: "Network request failed"
      });
    }
  };

  const fetchCsrfToken = () => {
    csrfInflight ??= (async () => {
      const response = await send(url("/auth/csrf"), {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json" },
        cache: "no-store"
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw toApiError(response.status, payload);
      }
      const parsed = CsrfResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ApiError({
          status: response.status,
          code: ClientErrorCode.InvalidResponse,
          message: "Invalid CSRF response"
        });
      }
      csrfToken = parsed.data.csrfToken;
      return csrfToken;
    })().finally(() => {
      csrfInflight = null;
    });
    return csrfInflight;
  };

  const getCsrfToken = async () => csrfToken ?? fetchCsrfToken();

  const execute = async <T>(
    path: string,
    options: RequestOptions<T>,
    state: RetryState
  ): Promise<T> => {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = { accept: "application/json" };
    const init: RequestInit = { method, credentials: "include", headers };
    if (options.signal) {
      init.signal = options.signal;
    }
    if (options.keepalive) {
      init.keepalive = true;
    }
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    if (method !== "GET") {
      // No await when the token is cached: the request leaves synchronously (keepalive on unload).
      headers[csrfHeaderName] = csrfToken ?? (await getCsrfToken());
    }

    const response = await send(url(path, options.query), init);
    const payload = await readJson(response);

    if (response.ok) {
      const parsed = options.schema.safeParse(payload);
      if (!parsed.success) {
        onInvalidResponse(path, parsed.error.issues);
        throw new ApiError({
          status: response.status,
          code: ClientErrorCode.InvalidResponse,
          message: "Response did not match the expected contract"
        });
      }
      return parsed.data;
    }

    const error = toApiError(response.status, payload);

    if (error.status === 403 && error.code === "CSRF_INVALID" && !state.csrfRetried) {
      csrfToken = null;
      await fetchCsrfToken();
      return execute(path, options, { ...state, csrfRetried: true });
    }

    const authMode = options.auth ?? "default";
    if (authMode !== "none" && isAuthError(error)) {
      if (!state.authRetried && (await refreshSession())) {
        return execute(path, options, { ...state, authRetried: true });
      }
      if (authMode === "default") {
        unauthorizedHandler?.();
      }
    }

    throw error;
  };

  const request = <T>(path: string, options: RequestOptions<T>) =>
    execute(path, options, { csrfRetried: false, authRetried: false });

  /** Single-flight session refresh shared by HTTP retries and the realtime client. */
  const refreshSession = (): Promise<boolean> => {
    refreshInflight ??= request("/auth/refresh", {
      method: "POST",
      schema: SessionResponseSchema,
      auth: "none"
    })
      .then(
        () => {
          for (const listener of [...refreshListeners]) {
            try {
              listener();
            } catch {
              // A listener failing must not turn a successful refresh into a failure.
            }
          }
          return true;
        },
        () => false
      )
      .finally(() => {
        refreshInflight = null;
      });
    return refreshInflight;
  };

  const withBody =
    (method: Exclude<HttpMethod, "GET">) =>
    <T>(path: string, schema: z.ZodType<T>, body?: unknown, options: Shorthand = {}) =>
      request(path, { ...options, method, schema, body });

  return {
    request,
    get: <T>(path: string, schema: z.ZodType<T>, options: Shorthand = {}) =>
      request(path, { ...options, schema }),
    post: withBody("POST"),
    patch: withBody("PATCH"),
    put: withBody("PUT"),
    delete: withBody("DELETE"),
    refreshSession,
    /** Runs after every successful session refresh (e.g. to hand the new token to the open socket). */
    onSessionRefreshed: (listener: () => void) => {
      refreshListeners.add(listener);
      return () => {
        refreshListeners.delete(listener);
      };
    },
    /** Called when a request is definitively unauthenticated (refresh failed). */
    setUnauthorizedHandler: (handler: (() => void) | null) => {
      unauthorizedHandler = handler;
    },
    /** Forget the cached CSRF token (e.g. after logout). The cookie stays; the next unsafe call refetches. */
    resetCsrfToken: () => {
      csrfToken = null;
    },
    /** True when an unsafe request can be sent without first fetching a CSRF token. */
    hasCsrfToken: () => csrfToken !== null,
    /** Fetches the CSRF token ahead of time (before an unload-time keepalive save). */
    warmCsrfToken: () => {
      if (csrfToken === null) void getCsrfToken().catch(() => undefined);
    }
  };
};

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient({ baseUrl: webEnv.apiBaseUrl });

/** Builds an API path with every interpolated segment URI-encoded: apiPath`/projects/${id}/lists`. */
export const apiPath = (strings: TemplateStringsArray, ...values: (string | number)[]) =>
  strings.reduce(
    (result, chunk, index) =>
      result + chunk + (index < values.length ? encodeURIComponent(String(values[index])) : ""),
    ""
  );
