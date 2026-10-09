import { prepareDoc } from "@/components/shared/rich-text/helpers";
import type { RichTextDoc } from "@/contracts/rich-text";
import { maxKeepaliveBodyBytes } from "@/lib/api/client";

/** A description ready to PATCH: sanitized doc (null = cleared) and its JSON for change detection. */
export type DescriptionPayload = { next: RichTextDoc | null; serialized: string };

/** null when the document cannot be saved as is (e.g. too large) — the editor shows the error. */
export const toDescriptionPayload = (doc: RichTextDoc): DescriptionPayload | null => {
  const prepared = prepareDoc(doc, "description", { allowEmpty: true });
  if (!prepared.ok) return null;
  const next = prepared.text.trim() ? prepared.doc : null;
  return { next, serialized: JSON.stringify(next) };
};

const encoder = new TextEncoder();

/**
 * Can this save leave with `keepalive` while the page unloads (BUG-WK-17)? It needs a cached CSRF
 * token (no time for a round trip) and a body under the browser's keepalive quota.
 */
export const canSaveOnUnload = (payload: DescriptionPayload, hasCsrfToken: boolean) =>
  hasCsrfToken && encoder.encode(`{"description":${payload.serialized}}`).length <= maxKeepaliveBodyBytes;
