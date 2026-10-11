import { z } from "zod";

import {
  KnowledgeAttachmentSchema,
  KnowledgeAuditPageSchema,
  KnowledgeCategorySchema,
  KnowledgeCommentPageSchema,
  KnowledgeCommentSchema,
  KnowledgeEditingStateSchema,
  KnowledgeFollowStateSchema,
  KnowledgeItemDetailSchema,
  KnowledgeItemPageSchema,
  KnowledgeMemberCollectionSchema,
  KnowledgeSpaceCollectionSchema,
  KnowledgeSpaceDetailSchema,
  KnowledgeTrashPageSchema,
  KnowledgeVersionPageSchema,
  KnowledgeVersionSchema,
  type CreateKnowledgeItemRequest,
  type CreateKnowledgeSpaceRequest,
  type KnowledgeAccessLevel,
  type ReplaceKnowledgeStatusesRequest,
  type UpdateKnowledgeItemRequest,
  type UpdateKnowledgeSpaceRequest
} from "@/contracts/knowledge";
import type { RichTextDoc } from "@/contracts/rich-text";
import {
  AttachmentUrlCollectionSchema,
  UploadTicketSchema,
  type CreateUploadRequest,
  type Placement
} from "@/contracts/work";
import { api, apiPath } from "@/lib/api/client";

import { knowledgeQueryString, type ApiQuery } from "./model/filters";

/**
 * Knowledge base API (BE module `knowledge`, contract contracts/knowledge.ts). Every path lives here.
 *
 * Mutation responses are read leniently (an id, or nothing) and the detail is refetched: the screens
 * never depend on the exact echo of a write, only on GET responses validated against the contract.
 */

const Id = z.string().uuid();
/** Any JSON body (or none): writes whose echo we do not rely on. */
const AnyResponse = z.unknown();
const WithId = z.object({ id: Id }).passthrough();

const withQuery = (path: string, query?: ApiQuery) => `${path}${knowledgeQueryString(query)}`;

export type KnowledgeAttachmentTarget = "item" | "comment";

export const knowledgeApi = {
  // Spaces ------------------------------------------------------------------------------------------
  /** Live spaces, then the archived ones I can still open (read-only, `archivedAt` set). */
  spaces: (signal?: AbortSignal) =>
    api.get("/knowledge/spaces", KnowledgeSpaceCollectionSchema, { signal }),
  space: (spaceId: string, signal?: AbortSignal) =>
    api.get(apiPath`/knowledge/spaces/${spaceId}`, KnowledgeSpaceDetailSchema, { signal }),
  createSpace: (input: Partial<CreateKnowledgeSpaceRequest> & { name: string }) =>
    api.post("/knowledge/spaces", WithId, input),
  /** Also used for reordering: `{ placement: { afterId, beforeId } }`. */
  updateSpace: (spaceId: string, input: UpdateKnowledgeSpaceRequest) =>
    api.patch(apiPath`/knowledge/spaces/${spaceId}`, AnyResponse, input),
  archiveSpace: (spaceId: string) =>
    api.post(apiPath`/knowledge/spaces/${spaceId}/archive`, AnyResponse),
  restoreSpace: (spaceId: string) =>
    api.post(apiPath`/knowledge/spaces/${spaceId}/restore`, AnyResponse),
  deleteSpace: (spaceId: string) => api.delete(apiPath`/knowledge/spaces/${spaceId}`, AnyResponse),

  // Members -----------------------------------------------------------------------------------------
  members: (spaceId: string, signal?: AbortSignal) =>
    api.get(apiPath`/knowledge/spaces/${spaceId}/members`, KnowledgeMemberCollectionSchema, { signal }),
  addMember: (spaceId: string, input: { userId: string; accessLevel: KnowledgeAccessLevel }) =>
    api.post(apiPath`/knowledge/spaces/${spaceId}/members`, AnyResponse, input),
  updateMember: (spaceId: string, userId: string, accessLevel: KnowledgeAccessLevel) =>
    api.patch(apiPath`/knowledge/spaces/${spaceId}/members/${userId}`, AnyResponse, { accessLevel }),
  removeMember: (spaceId: string, userId: string) =>
    api.delete(apiPath`/knowledge/spaces/${spaceId}/members/${userId}`, AnyResponse),

  // Structure ---------------------------------------------------------------------------------------
  replaceStatuses: (spaceId: string, input: ReplaceKnowledgeStatusesRequest) =>
    api.put(apiPath`/knowledge/spaces/${spaceId}/statuses`, AnyResponse, input),
  createCategory: (spaceId: string, input: { name: string; parentId?: string | null }) =>
    api.post(apiPath`/knowledge/spaces/${spaceId}/categories`, KnowledgeCategorySchema.partial().passthrough(), input),
  updateCategory: (
    spaceId: string,
    categoryId: string,
    input: { name?: string; parentId?: string | null; placement?: Placement }
  ) => api.patch(apiPath`/knowledge/spaces/${spaceId}/categories/${categoryId}`, AnyResponse, input),
  deleteCategory: (spaceId: string, categoryId: string) =>
    api.delete(apiPath`/knowledge/spaces/${spaceId}/categories/${categoryId}`, AnyResponse),

  // Items -------------------------------------------------------------------------------------------
  items: (spaceId: string, query: ApiQuery, cursor?: string, signal?: AbortSignal) =>
    api.get(
      withQuery(apiPath`/knowledge/spaces/${spaceId}/items`, { ...query, ...(cursor ? { cursor } : {}) }),
      KnowledgeItemPageSchema,
      { signal }
    ),
  item: (itemId: string, signal?: AbortSignal) =>
    api.get(apiPath`/knowledge/items/${itemId}`, KnowledgeItemDetailSchema, { signal }),
  createItem: (spaceId: string, input: Partial<CreateKnowledgeItemRequest> & { title: string; body: RichTextDoc }) =>
    api.post(apiPath`/knowledge/spaces/${spaceId}/items`, WithId, input),
  updateItem: (itemId: string, input: UpdateKnowledgeItemRequest) =>
    api.patch(apiPath`/knowledge/items/${itemId}`, AnyResponse, input),
  /** Moves the item to the space trash (30 days). Critical items need a reason. */
  deleteItem: (itemId: string, reason?: string) =>
    api.delete(apiPath`/knowledge/items/${itemId}`, AnyResponse, reason ? { reason } : {}),
  follow: (itemId: string) => api.post(apiPath`/knowledge/items/${itemId}/follow`, KnowledgeFollowStateSchema),
  unfollow: (itemId: string) => api.delete(apiPath`/knowledge/items/${itemId}/follow`, KnowledgeFollowStateSchema),
  /**
   * Edit presence: `true` when the editor opens and every ~30 s while open (expires after 60 s), `false` on
   * close. Answers who else is editing right now.
   */
  editing: (itemId: string, editing: boolean, options: { keepalive?: boolean } = {}) =>
    api.post(apiPath`/knowledge/items/${itemId}/editing`, KnowledgeEditingStateSchema, { editing }, { keepalive: options.keepalive }),

  // Trash -------------------------------------------------------------------------------------------
  trash: (spaceId: string, cursor?: string, signal?: AbortSignal) =>
    api.get(
      withQuery(apiPath`/knowledge/spaces/${spaceId}/trash`, { limit: 30, ...(cursor ? { cursor } : {}) }),
      KnowledgeTrashPageSchema,
      { signal }
    ),
  restoreItem: (itemId: string, reason?: string) =>
    api.post(apiPath`/knowledge/items/${itemId}/restore`, AnyResponse, reason ? { reason } : {}),
  purgeItem: (itemId: string, reason?: string) =>
    api.post(apiPath`/knowledge/items/${itemId}/purge`, AnyResponse, reason ? { reason } : {}),

  // Versions ----------------------------------------------------------------------------------------
  versions: (itemId: string, cursor?: string, signal?: AbortSignal) =>
    api.get(
      withQuery(apiPath`/knowledge/items/${itemId}/versions`, { limit: 50, ...(cursor ? { cursor } : {}) }),
      KnowledgeVersionPageSchema,
      { signal }
    ),
  version: (itemId: string, number: number, signal?: AbortSignal) =>
    api.get(apiPath`/knowledge/items/${itemId}/versions/${number}`, KnowledgeVersionSchema, { signal }),
  restoreVersion: (itemId: string, number: number, reason?: string) =>
    api.post(apiPath`/knowledge/items/${itemId}/versions/${number}/restore`, AnyResponse, reason ? { reason } : {}),

  /** Per-item history (members see it; the full space log is `audit`). */
  history: (itemId: string, cursor?: string, signal?: AbortSignal) =>
    api.get(
      withQuery(apiPath`/knowledge/items/${itemId}/history`, { limit: 50, ...(cursor ? { cursor } : {}) }),
      KnowledgeAuditPageSchema,
      { signal }
    ),

  // Comments ----------------------------------------------------------------------------------------
  /** Root comments, newest first ("Chưa xử lý" is filtered on the client). */
  comments: (itemId: string, cursor?: string, signal?: AbortSignal) =>
    api.get(
      withQuery(apiPath`/knowledge/items/${itemId}/comments`, { limit: 30, ...(cursor ? { cursor } : {}) }),
      KnowledgeCommentPageSchema,
      { signal }
    ),
  replies: (itemId: string, commentId: string, signal?: AbortSignal) =>
    api.get(apiPath`/knowledge/items/${itemId}/comments/${commentId}/replies`, KnowledgeCommentPageSchema, {
      signal
    }),
  createComment: (
    itemId: string,
    input: { body: RichTextDoc; parentCommentId?: string | null; attachmentIds?: string[] }
  ) => api.post(apiPath`/knowledge/items/${itemId}/comments`, KnowledgeCommentSchema.partial().passthrough(), input),
  updateComment: (itemId: string, commentId: string, body: RichTextDoc) =>
    api.patch(apiPath`/knowledge/items/${itemId}/comments/${commentId}`, AnyResponse, { body }),
  deleteComment: (itemId: string, commentId: string) =>
    api.delete(apiPath`/knowledge/items/${itemId}/comments/${commentId}`, AnyResponse),
  resolveComment: (itemId: string, commentId: string, resolved: boolean) =>
    api.post(apiPath`/knowledge/items/${itemId}/comments/${commentId}/resolve`, AnyResponse, { resolved }),

  // Attachments -------------------------------------------------------------------------------------
  createUpload: (itemId: string, input: CreateUploadRequest) =>
    api.post(apiPath`/knowledge/items/${itemId}/attachments`, UploadTicketSchema, input),
  completeUpload: (attachmentId: string, target: KnowledgeAttachmentTarget) =>
    api.post(apiPath`/knowledge/attachments/${attachmentId}/complete`, KnowledgeAttachmentSchema, { target }),
  attachmentUrls: (ids: string[]) =>
    api.post("/knowledge/attachments/urls", AttachmentUrlCollectionSchema, { ids }),
  deleteAttachment: (attachmentId: string) =>
    api.delete(apiPath`/knowledge/attachments/${attachmentId}`, AnyResponse),

  // Audit -------------------------------------------------------------------------------------------
  audit: (spaceId: string, query: ApiQuery, cursor?: string, signal?: AbortSignal) =>
    api.get(
      withQuery(apiPath`/knowledge/spaces/${spaceId}/audit`, { ...query, ...(cursor ? { cursor } : {}) }),
      KnowledgeAuditPageSchema,
      { signal }
    ),
  /** Path (relative to the API base) of the Excel export of the filtered log. */
  auditExportPath: (spaceId: string, query: ApiQuery) =>
    withQuery(apiPath`/knowledge/spaces/${spaceId}/audit/export`, query)
};

