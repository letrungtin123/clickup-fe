import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { apiPath, buildQueryString, createApiClient } from "./client";
import { ApiError } from "./errors";

type Call = { url: string; method: string; headers: Record<string, string>; body: string | null };

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

const apiError = (status: number, code: string) =>
  json(status, { error: { code, message: code, requestId: "req-1" } });

/**
 * Scripted fetch: each handler receives the call and returns a Response. Handlers are matched by
 * "<METHOD> <path>" and consumed in order, so tests can describe exact request sequences.
 */
const scriptedFetch = (script: Record<string, ((call: Call) => Response)[]>) => {
  const calls: Call[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const call: Call = {
      url,
      method,
      headers: { ...(init?.headers as Record<string, string> | undefined) },
      body: typeof init?.body === "string" ? init.body : null
    };
    calls.push(call);
    const key = `${method} ${url.replace("http://api.test/v1", "").split("?")[0]}`;
    const handler = script[key]?.shift();
    if (!handler) {
      throw new Error(`Unexpected request ${key}`);
    }
    return Promise.resolve(handler(call));
  });
  return { fetchMock: fetchMock as unknown as typeof fetch, calls };
};

const Ok = z.object({ ok: z.literal(true) });
const csrf = (token: string) => () => json(200, { csrfToken: token });

const makeClient = (script: Record<string, ((call: Call) => Response)[]>) => {
  const { fetchMock, calls } = scriptedFetch(script);
  const client = createApiClient({
    baseUrl: "http://api.test/v1",
    fetch: fetchMock,
    onInvalidResponse: () => undefined
  });
  return { client, calls };
};

describe("api client: CSRF", () => {
  it("does not fetch a CSRF token for GET requests", async () => {
    const { client, calls } = makeClient({ "GET /things": [() => json(200, { ok: true })] });
    await expect(client.get("/things", Ok)).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers["x-csrf-token"]).toBeUndefined();
    expect(calls[0]?.headers.accept).toBe("application/json");
  });

  it("fetches the token once, keeps it in memory and sends it on unsafe methods", async () => {
    const { client, calls } = makeClient({
      "GET /auth/csrf": [csrf("token-aaaaaaaaaaaaaaaa")],
      "POST /things": [() => json(200, { ok: true })],
      "PATCH /things/1": [() => json(200, { ok: true })]
    });
    await client.post("/things", Ok, { name: "a" });
    await client.patch("/things/1", Ok, { name: "b" });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET http://api.test/v1/auth/csrf",
      "POST http://api.test/v1/things",
      "PATCH http://api.test/v1/things/1"
    ]);
    expect(calls[1]?.headers["x-csrf-token"]).toBe("token-aaaaaaaaaaaaaaaa");
    expect(calls[1]?.headers["content-type"]).toBe("application/json");
    expect(calls[1]?.body).toBe(JSON.stringify({ name: "a" }));
    expect(calls[2]?.headers["x-csrf-token"]).toBe("token-aaaaaaaaaaaaaaaa");
  });

  it("shares one in-flight token request between concurrent mutations", async () => {
    const { client, calls } = makeClient({
      "GET /auth/csrf": [csrf("token-bbbbbbbbbbbbbbbb")],
      "POST /a": [() => json(200, { ok: true })],
      "POST /b": [() => json(200, { ok: true })]
    });
    await Promise.all([client.post("/a", Ok), client.post("/b", Ok)]);
    expect(calls.filter((call) => call.url.endsWith("/auth/csrf"))).toHaveLength(1);
  });

  it("refetches the token and retries once on 403 CSRF_INVALID", async () => {
    const { client, calls } = makeClient({
      "GET /auth/csrf": [csrf("token-old-aaaaaaaaaaaaa"), csrf("token-new-bbbbbbbbbbbbb")],
      "DELETE /things/1": [() => apiError(403, "CSRF_INVALID"), () => json(200, { ok: true })]
    });
    await expect(client.delete("/things/1", Ok)).resolves.toEqual({ ok: true });
    const deletes = calls.filter((call) => call.method === "DELETE");
    expect(deletes.map((call) => call.headers["x-csrf-token"])).toEqual([
      "token-old-aaaaaaaaaaaaa",
      "token-new-bbbbbbbbbbbbb"
    ]);
  });

  it("gives up after one CSRF retry", async () => {
    const { client } = makeClient({
      "GET /auth/csrf": [csrf("token-1-aaaaaaaaaaaaaaa"), csrf("token-2-aaaaaaaaaaaaaaa")],
      "POST /things": [() => apiError(403, "CSRF_INVALID"), () => apiError(403, "CSRF_INVALID")]
    });
    await expect(client.post("/things", Ok)).rejects.toMatchObject({
      status: 403,
      code: "CSRF_INVALID"
    });
  });
});

describe("api client: session refresh", () => {
  it("refreshes once on 401 and retries the original request", async () => {
    const onUnauthorized = vi.fn();
    const { client, calls } = makeClient({
      "GET /me": [() => apiError(401, "AUTH_REQUIRED"), () => json(200, { ok: true })],
      "GET /auth/csrf": [csrf("token-cccccccccccccccc")],
      "POST /auth/refresh": [
        () =>
          json(200, {
            user: { id: "8f2b6a0e-1c1d-4c55-9a35-4b3f7f6f0a11", email: null, permissions: [] }
          })
      ]
    });
    client.setUnauthorizedHandler(onUnauthorized);

    await expect(client.get("/me", Ok)).resolves.toEqual({ ok: true });
    expect(
      calls.map((call) => `${call.method} ${call.url.replace("http://api.test/v1", "")}`)
    ).toEqual(["GET /me", "GET /auth/csrf", "POST /auth/refresh", "GET /me"]);
    expect(calls[2]?.headers["x-csrf-token"]).toBe("token-cccccccccccccccc");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("uses a single refresh for concurrent 401s", async () => {
    const { client, calls } = makeClient({
      "GET /a": [() => apiError(401, "AUTH_INVALID"), () => json(200, { ok: true })],
      "GET /b": [() => apiError(401, "AUTH_INVALID"), () => json(200, { ok: true })],
      "GET /auth/csrf": [csrf("token-dddddddddddddddd")],
      "POST /auth/refresh": [
        () =>
          json(200, {
            user: { id: "8f2b6a0e-1c1d-4c55-9a35-4b3f7f6f0a11", email: null, permissions: [] }
          })
      ]
    });
    await Promise.all([client.get("/a", Ok), client.get("/b", Ok)]);
    expect(calls.filter((call) => call.url.endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("calls the unauthorized handler when the refresh fails", async () => {
    const onUnauthorized = vi.fn();
    const { client } = makeClient({
      "GET /me": [() => apiError(401, "AUTH_REQUIRED")],
      "GET /auth/csrf": [csrf("token-eeeeeeeeeeeeeeee")],
      "POST /auth/refresh": [() => apiError(401, "AUTH_REQUIRED")]
    });
    client.setUnauthorizedHandler(onUnauthorized);

    const error = await client.get("/me", Ok).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "AUTH_REQUIRED", requestId: "req-1" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not redirect for silent session probes", async () => {
    const onUnauthorized = vi.fn();
    const { client } = makeClient({
      "GET /workspace/context": [() => apiError(401, "AUTH_REQUIRED")],
      "GET /auth/csrf": [csrf("token-ffffffffffffffff")],
      "POST /auth/refresh": [() => apiError(401, "AUTH_REQUIRED")]
    });
    client.setUnauthorizedHandler(onUnauthorized);
    await expect(client.get("/workspace/context", Ok, { auth: "silent" })).rejects.toMatchObject({
      status: 401
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("never refreshes for auth endpoints (auth: none), e.g. wrong password", async () => {
    const { client, calls } = makeClient({
      "GET /auth/csrf": [csrf("token-gggggggggggggggg")],
      "POST /auth/login": [() => apiError(401, "AUTH_INVALID")]
    });
    await expect(
      client.post("/auth/login", Ok, { email: "a@b.c", password: "x" }, { auth: "none" })
    ).rejects.toMatchObject({
      code: "AUTH_INVALID"
    });
    expect(calls.some((call) => call.url.endsWith("/auth/refresh"))).toBe(false);
  });

  it("does not retry non-auth failures", async () => {
    const { client, calls } = makeClient({ "GET /things": [() => apiError(403, "FORBIDDEN")] });
    await expect(client.get("/things", Ok)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN"
    });
    expect(calls).toHaveLength(1);
  });
});

describe("api client: responses", () => {
  it("rejects bodies that do not match the contract", async () => {
    const { client } = makeClient({ "GET /things": [() => json(200, { ok: "yes" })] });
    await expect(client.get("/things", Ok)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("normalizes non-JSON server failures", async () => {
    const { client } = makeClient({
      "GET /things": [() => new Response("<html>bad gateway</html>", { status: 502 })]
    });
    await expect(client.get("/things", Ok)).rejects.toMatchObject({
      status: 502,
      code: "INTERNAL_SERVER_ERROR"
    });
  });

  it("maps network failures to NETWORK_ERROR", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test/v1",
      fetch: () => Promise.reject(new TypeError("Failed to fetch"))
    });
    await expect(client.get("/things", Ok)).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR"
    });
  });

  it("propagates aborts untouched", async () => {
    const controller = new AbortController();
    const client = createApiClient({
      baseUrl: "http://api.test/v1",
      fetch: (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    });
    const pending = client.get("/things", Ok, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("request helpers", () => {
  it("serializes query strings (csv arrays, skips empty values)", () => {
    expect(
      buildQueryString({
        a: "x y",
        b: 2,
        c: undefined,
        d: null,
        e: "",
        f: ["1", "2"],
        g: [],
        h: false
      })
    ).toBe("?a=x+y&b=2&f=1%2C2&h=false");
    expect(buildQueryString(undefined)).toBe("");
  });

  it("encodes interpolated path segments", () => {
    expect(apiPath`/projects/${"../auth/me"}/lists/${"a b"}`).toBe(
      "/projects/..%2Fauth%2Fme/lists/a%20b"
    );
  });
});
