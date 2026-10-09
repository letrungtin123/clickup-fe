import { ApiErrorSchema } from "@/contracts/schemas";
import { api, buildQueryString, type QueryValue } from "@/lib/api/client";
import { ApiError, ClientErrorCode } from "@/lib/api/errors";
import { webEnv } from "@/lib/env";

/**
 * Excel exports (production-reports contract: GET /production/scores/board/export,
 * GET /production/kpi/export). The file is fetched with the session cookie, checked to really be a
 * spreadsheet, then saved through an object URL with a forced `download` — never rendered or opened.
 * Errors raised before streaming are JSON and surface as ApiError.
 */

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * File name from Content-Disposition: RFC 5987 `filename*=UTF-8''…` first, then `filename="…"`.
 * Path separators and control characters are stripped; null when absent or unusable.
 */
export const filenameFromDisposition = (header: string | null): string | null => {
  if (!header) return null;
  const clean = (value: string) =>
    // eslint-disable-next-line no-control-regex -- strip control characters from a server-provided name
    value.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim() || null;
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (extended?.[2]) {
    try {
      return clean(decodeURIComponent(extended[2].trim().replace(/^"|"$/g, "")));
    } catch {
      // Malformed percent-encoding: fall back to the plain parameter.
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  const value = plain?.[2] ?? plain?.[1];
  return value ? clean(value.replace(/^"|"$/g, "")) : null;
};

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

const request = (url: string) =>
  fetch(url, { credentials: "include", headers: { accept: `${XLSX_TYPE}, application/json` } }).catch(
    () => {
      throw new ApiError({ status: 0, code: ClientErrorCode.Network, message: "Network request failed" });
    }
  );

/** Downloads an export; resolves with the saved file name. Throws ApiError on any failure. */
export const downloadExport = async (
  path: string,
  query: Record<string, QueryValue>,
  fallbackName: string
) => {
  const url = `${webEnv.apiBaseUrl}${path}${buildQueryString(query)}`;
  let response = await request(url);
  if (response.status === 401 && (await api.refreshSession())) {
    response = await request(url);
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("spreadsheetml")) {
    throw await readError(response);
  }
  const blob = new Blob([await response.arrayBuffer()], { type: XLSX_TYPE });
  const name = filenameFromDisposition(response.headers.get("content-disposition")) ?? fallbackName;
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = name.toLowerCase().endsWith(".xlsx") ? name : `${name}.xlsx`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return link.download;
};
