import { ApiErrorSchema } from "@/contracts/schemas";
import { api, buildQueryString, csrfHeaderName, type QueryValue } from "@/lib/api/client";
import { ApiError, ClientErrorCode, isAuthError } from "@/lib/api/errors";
import { CsrfResponseSchema } from "@/lib/api/schemas";
import { webEnv } from "@/lib/env";

/**
 * Excel downloads of the production module (production-reports contract): GET …/export with the
 * screen's query, or POST /production/reports/export with the report config. The response is fetched
 * with the session cookie, checked to really be a spreadsheet and saved through an object URL with a
 * forced file name — never opened or rendered. Errors raised before streaming are JSON → ApiError.
 */

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// eslint-disable-next-line no-control-regex -- strip control characters from a server-provided name
const unsafeNameChars = /[\u0000-\u001f\u007f/\\:*?"<>|]/g;

/** Keeps a file name safe for every OS: no path separators, reserved or control characters. */
export const sanitizeFileName = (name: string) =>
  name.replace(unsafeNameChars, "").replace(/\s+/g, " ").trim();

/**
 * File name from a Content-Disposition header: RFC 5987 `filename*=UTF-8''…` first, then the plain
 * `filename="…"`. Null when absent or unusable.
 */
export const filenameFromDisposition = (header: string | null | undefined): string | null => {
  if (!header) return null;
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (extended?.[2]) {
    const charset = (extended[1] ?? "").trim().toLowerCase();
    const raw = extended[2].trim().replace(/^"|"$/g, "");
    try {
      const decoded =
        charset === "" || charset === "utf-8"
          ? decodeURIComponent(raw)
          : // ISO-8859-1: every %XX is one code point.
            raw.replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
              String.fromCharCode(parseInt(hex, 16))
            );
      const clean = sanitizeFileName(decoded);
      if (clean) return clean;
    } catch {
      // Malformed percent-encoding: fall back to the plain parameter.
    }
  }
  const plain = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]*))/i.exec(header);
  const value = plain?.[1]?.replace(/\\(.)/g, "$1") ?? plain?.[2]?.trim();
  if (!value) return null;
  return sanitizeFileName(value) || null;
};

/** Ensures the .xlsx extension. */
export const withXlsxExtension = (name: string) =>
  name.toLowerCase().endsWith(".xlsx") ? name : `${name}.xlsx`;

const readError = async (response: Response) => {
  const text = await response.text().catch(() => "");
  try {
    const parsed = ApiErrorSchema.safeParse(JSON.parse(text));
    if (parsed.success) return new ApiError({ status: response.status, ...parsed.data.error });
  } catch {
    // Not JSON.
  }
  return new ApiError({
    status: response.status,
    code: response.status >= 500 ? "INTERNAL_SERVER_ERROR" : ClientErrorCode.InvalidResponse,
    message: `Export failed with status ${response.status}`
  });
};

let csrfToken: string | null = null;
const fetchCsrf = async () => {
  csrfToken = (await api.get("/auth/csrf", CsrfResponseSchema, { auth: "silent" })).csrfToken;
  return csrfToken;
};

export type ExportRequest =
  | { method: "GET"; path: string; query?: Record<string, QueryValue> }
  | { method: "POST"; path: string; body: unknown };

const send = async (request: ExportRequest) => {
  const headers: Record<string, string> = { accept: `${XLSX_TYPE}, application/json` };
  const init: RequestInit = {
    method: request.method,
    credentials: "include",
    headers,
    cache: "no-store"
  };
  let url = `${webEnv.apiBaseUrl}${request.path}`;
  if (request.method === "GET") {
    url += buildQueryString(request.query);
  } else {
    headers["content-type"] = "application/json";
    headers[csrfHeaderName] = csrfToken ?? (await fetchCsrf());
    init.body = JSON.stringify(request.body);
  }
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError({
      status: 0,
      code: ClientErrorCode.Network,
      message: "Network request failed"
    });
  }
};

/** Saves a blob under `name` (object URL + forced download). */
export const saveBlob = (blob: Blob, name: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

/**
 * Downloads an export and saves it; resolves with the saved file name and size. Retries once after a
 * session refresh (401) or a stale CSRF token (403 CSRF_INVALID). Throws ApiError on failure.
 */
export const downloadExport = async (request: ExportRequest, fallbackName: string) => {
  let response = await send(request);
  if (!response.ok) {
    const error = await readError(response.clone());
    if (isAuthError(error) && (await api.refreshSession())) {
      response = await send(request);
    } else if (error.status === 403 && error.code === "CSRF_INVALID") {
      csrfToken = null;
      response = await send(request);
    }
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("spreadsheetml")) {
    throw await readError(response);
  }
  const blob = new Blob([await response.arrayBuffer()], { type: XLSX_TYPE });
  if (blob.size === 0) {
    throw new ApiError({
      status: response.status,
      code: ClientErrorCode.InvalidResponse,
      message: "Empty export"
    });
  }
  const name = withXlsxExtension(
    filenameFromDisposition(response.headers.get("content-disposition")) ??
      sanitizeFileName(fallbackName)
  );
  saveBlob(blob, name);
  return { name, size: blob.size };
};
