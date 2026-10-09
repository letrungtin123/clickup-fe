import type { z } from "zod";

import {
  AddChannelMembersResponseSchema,
  ChannelBrowsePageSchema,
  ChannelMemberPageSchema,
  ChatAttachmentSchema,
  ChatAttachmentUrlCollectionSchema,
  ChatChannelCollectionSchema,
  ChatChannelDetailSchema,
  ChatChannelMemberSchema,
  ChatMessageSchema,
  ChatOkSchema,
  ChatSearchPageSchema,
  ChatUploadTicketSchema,
  MessageHistorySchema,
  MyMembershipSchema,
  ReactionResultSchema,
  ReadStateSchema,
  ThreadPageSchema,
  type ChannelAccess,
  type ChannelRole,
  type NamedChannelKind,
  type NotifyLevel
} from "@/contracts/chat";
import type { RichTextDoc } from "@/contracts/rich-text";
import { DirectoryCollectionSchema } from "@/contracts/work";
import { api, apiPath } from "@/lib/api/client";

/** Chat API (BE modules/chat/chat.routes.ts). Every response is validated against contracts/chat.ts. */

export type HistoryParams =
  | { before: number; limit?: number }
  | { after: number; limit?: number }
  | { around: string; limit?: number }
  | { limit?: number };

export type CreateChannelInput = {
  kind: NamedChannelKind;
  name: string;
  description?: string | null;
  memberIds?: string[];
};

export type UpdateChannelInput = {
  name?: string;
  description?: string | null;
  topic?: string | null;
  kind?: NamedChannelKind;
};

export type SendMessageInput = {
  body: RichTextDoc;
  clientMessageId: string;
  threadRootId?: string | null;
  attachmentIds?: string[];
};

export const chatApi = {
  // Channels ---------------------------------------------------------------------------------------
  channels: (signal?: AbortSignal) => api.get("/channels", ChatChannelCollectionSchema, { signal }),
  browse: (params: { q?: string; cursor?: string; limit?: number }, signal?: AbortSignal) =>
    api.get("/channels/browse", ChannelBrowsePageSchema, {
      query: { q: params.q?.trim(), cursor: params.cursor, limit: params.limit ?? 30 },
      signal
    }),
  channel: (channelId: string, signal?: AbortSignal) =>
    api.get(apiPath`/channels/${channelId}`, ChatChannelDetailSchema, { signal }),
  create: (input: CreateChannelInput) => api.post("/channels", ChatChannelDetailSchema, input),
  update: (channelId: string, input: UpdateChannelInput) =>
    api.patch(apiPath`/channels/${channelId}`, ChatChannelDetailSchema, input),
  archive: (channelId: string) =>
    api.post(apiPath`/channels/${channelId}/archive`, ChatChannelDetailSchema),
  unarchive: (channelId: string) =>
    api.post(apiPath`/channels/${channelId}/unarchive`, ChatChannelDetailSchema),
  remove: (channelId: string) => api.delete(apiPath`/channels/${channelId}`, ChatOkSchema),
  join: (channelId: string) =>
    api.post(apiPath`/channels/${channelId}/join`, ChatChannelDetailSchema),
  leave: (channelId: string) => api.post(apiPath`/channels/${channelId}/leave`, ChatOkSchema),
  setNotifyLevel: (channelId: string, notifyLevel: NotifyLevel) =>
    api.patch(apiPath`/channels/${channelId}/me`, MyMembershipSchema, { notifyLevel }),
  markRead: (channelId: string, seq: number) =>
    api.post(apiPath`/channels/${channelId}/read`, ReadStateSchema, { seq }),
  openDm: (userIds: string[]) => api.post("/dms", ChatChannelDetailSchema, { userIds }),

  // Members ----------------------------------------------------------------------------------------
  members: (
    channelId: string,
    params: { q?: string; cursor?: string; limit?: number },
    signal?: AbortSignal
  ) =>
    api.get(apiPath`/channels/${channelId}/members`, ChannelMemberPageSchema, {
      query: { q: params.q?.trim(), cursor: params.cursor, limit: params.limit ?? 50 },
      signal
    }),
  addMembers: (channelId: string, userIds: string[], access: ChannelAccess) =>
    api.post(apiPath`/channels/${channelId}/members`, AddChannelMembersResponseSchema, {
      userIds,
      access
    }),
  updateMember: (
    channelId: string,
    userId: string,
    input: { access?: ChannelAccess; role?: ChannelRole }
  ) => api.patch(apiPath`/channels/${channelId}/members/${userId}`, ChatChannelMemberSchema, input),
  removeMember: (channelId: string, userId: string) =>
    api.delete(apiPath`/channels/${channelId}/members/${userId}`, ChatOkSchema),

  // Messages ---------------------------------------------------------------------------------------
  history: (channelId: string, params: HistoryParams, signal?: AbortSignal) =>
    api.get(apiPath`/channels/${channelId}/messages`, MessageHistorySchema, {
      query: { limit: 50, ...params },
      signal
    }),
  send: (channelId: string, input: SendMessageInput) =>
    api.post(apiPath`/channels/${channelId}/messages`, ChatMessageSchema, {
      body: input.body,
      clientMessageId: input.clientMessageId,
      threadRootId: input.threadRootId ?? null,
      attachmentIds: input.attachmentIds ?? []
    }),
  edit: (messageId: string, body: RichTextDoc) =>
    api.patch(apiPath`/messages/${messageId}`, ChatMessageSchema, { body }),
  deleteMessage: (messageId: string) => api.delete(apiPath`/messages/${messageId}`, ChatOkSchema),
  thread: (rootId: string, params: { cursor?: string; limit?: number }, signal?: AbortSignal) =>
    api.get(apiPath`/messages/${rootId}/thread`, ThreadPageSchema, {
      query: { cursor: params.cursor, limit: params.limit ?? 50 },
      signal
    }),
  react: (messageId: string, emoji: string) =>
    api.put(apiPath`/messages/${messageId}/reactions`, ReactionResultSchema, { emoji }),
  unreact: (messageId: string, emoji: string) =>
    api.delete(apiPath`/messages/${messageId}/reactions`, ReactionResultSchema, undefined, {
      query: { emoji }
    }),

  // Attachments ------------------------------------------------------------------------------------
  createUpload: (
    channelId: string,
    input: { fileName: string; mimeType: string; sizeBytes: number }
  ) => api.post(apiPath`/channels/${channelId}/attachments`, ChatUploadTicketSchema, input),
  completeUpload: (attachmentId: string) =>
    api.post(apiPath`/chat-attachments/${attachmentId}/complete`, ChatAttachmentSchema),
  attachmentUrls: (ids: string[]) =>
    api.post("/chat-attachments/urls", ChatAttachmentUrlCollectionSchema, { ids }),
  deleteUpload: (attachmentId: string) =>
    api.delete(apiPath`/chat-attachments/${attachmentId}`, ChatOkSchema),

  // Search & mentions ------------------------------------------------------------------------------
  search: (
    params: { q: string; channelId?: string; cursor?: string; limit?: number },
    signal?: AbortSignal
  ) =>
    api.get("/chat/search", ChatSearchPageSchema, {
      query: {
        q: params.q.trim(),
        channelId: params.channelId,
        cursor: params.cursor,
        limit: params.limit ?? 20
      },
      signal
    }),
  mentions: (params: { cursor?: string; limit?: number }, signal?: AbortSignal) =>
    api.get("/chat/mentions", ChatSearchPageSchema, {
      query: { cursor: params.cursor, limit: params.limit ?? 30 },
      signal
    }),

  /** People picker (mentions are scoped to channel members for private channels and DMs). */
  directory: (
    params: { q?: string; channelId?: string; limit?: number },
    signal?: AbortSignal
  ) =>
    api.get("/directory/users", DirectoryCollectionSchema, {
      query: { q: params.q?.trim(), channelId: params.channelId, limit: params.limit ?? 20 },
      signal
    })
};

export type ChatOk = z.infer<typeof ChatOkSchema>;
