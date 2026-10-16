import {
  chatLimits,
  isDirectKind,
  type ChatChannel,
  type ChatChannelCollection,
  type ChatChannelDetail,
  type ChatChannelInfo
} from "@/contracts/chat";
import type { Department } from "@/contracts/departments";

import { departmentAudience } from "./departments";

export type ChannelLike = Pick<ChatChannel, "kind" | "name" | "participants">;

/**
 * How many people the viewer may pick for a new DM: group conversations need the right to create
 * channels; everyone else messages one colleague at a time (the API enforces both).
 */
export const dmPickLimit = (canCreateGroups: boolean) =>
  canCreateGroups ? chatLimits.dmOthersMax : 1;

/** Display name: "#name" channels use their name; DMs list the other participants. */
export const channelTitle = (channel: ChannelLike) => {
  if (!isDirectKind(channel.kind)) {
    return channel.name ?? "Kênh";
  }
  const names = channel.participants.map((user) => user.displayName);
  if (names.length === 0) return "Chỉ mình bạn";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} và ${names.length - 2} người khác`;
};

/** Short label for prose, e.g. "#thiết-kế" or "Minh, An". */
export const channelLabel = (channel: ChannelLike) =>
  isDirectKind(channel.kind) ? channelTitle(channel) : `#${channel.name ?? "kênh"}`;

/** "99+" style badge text (mention counts are capped server side). */
export const formatCount = (count: number, cap = 99) => (count > cap ? `${cap}+` : String(count));

export const isMuted = (channel: Pick<ChatChannel, "notifyLevel">) =>
  channel.notifyLevel === "none";

export const hasUnread = (channel: Pick<ChatChannel, "unreadCount" | "notifyLevel">) =>
  channel.unreadCount > 0 && !isMuted(channel);

export type ChannelSort = "activity" | "name";

const activityTime = (channel: Pick<ChatChannel, "lastMessageAt" | "createdAt">) =>
  new Date(channel.lastMessageAt ?? channel.createdAt).getTime();

export const sortChannels = <T extends ChatChannel>(channels: readonly T[], sort: ChannelSort) =>
  [...channels].sort((a, b) => {
    if (sort === "name") {
      return channelTitle(a).localeCompare(channelTitle(b), "vi", { sensitivity: "base" });
    }
    return activityTime(b) - activityTime(a) || a.id.localeCompare(b.id);
  });

export const splitSidebar = (channels: readonly ChatChannel[]) => ({
  channels: channels.filter((channel) => !isDirectKind(channel.kind)),
  directs: channels.filter((channel) => isDirectKind(channel.kind))
});

/** Channels whose rooms the client joins, most recently active first (server caps rooms per socket). */
export const roomCandidates = (channels: readonly ChatChannel[], max: number) =>
  sortChannels(
    channels.filter((channel) => channel.isMember),
    "activity"
  )
    .slice(0, max)
    .map((channel) => channel.id);

// Cache helpers ------------------------------------------------------------------------------------

export const updateSidebarChannel = (
  collection: ChatChannelCollection | undefined,
  channelId: string,
  update: (channel: ChatChannel) => ChatChannel
): ChatChannelCollection | undefined => {
  if (!collection) return collection;
  let changed = false;
  const items = collection.items.map((channel) => {
    if (channel.id !== channelId) return channel;
    const next = update(channel);
    if (next !== channel) changed = true;
    return next;
  });
  return changed ? { items } : collection;
};

export const removeSidebarChannel = (
  collection: ChatChannelCollection | undefined,
  channelId: string
): ChatChannelCollection | undefined =>
  collection && collection.items.some((channel) => channel.id === channelId)
    ? { items: collection.items.filter((channel) => channel.id !== channelId) }
    : collection;

/** Inserts or replaces a sidebar entry from a channel detail (create / join / open DM). */
export const upsertSidebarChannel = (
  collection: ChatChannelCollection | undefined,
  detail: ChatChannelDetail
): ChatChannelCollection | undefined => {
  if (!collection) return collection;
  // strip viewer-only capabilities
  const { capabilities: _capabilities, ...entry } = detail;
  const exists = collection.items.some((channel) => channel.id === detail.id);
  return {
    items: exists
      ? collection.items.map((channel) => (channel.id === detail.id ? entry : channel))
      : [entry, ...collection.items]
  };
};

/**
 * Merges viewer-independent metadata from a realtime `chat:channel` event. The payload carries no
 * `audienceDepartments` (viewer-specific, PD-054): the cached one is kept, except for a named channel whose
 * department changed, where it follows the department (the server's rule for named channels).
 */
export const mergeChannelInfo = <T extends ChatChannelInfo & { audienceDepartments?: Department[] }>(
  channel: T,
  info: ChatChannelInfo
): T => ({
  ...channel,
  ...(channel.audienceDepartments &&
  !isDirectKind(info.kind) &&
  (channel.department ?? null) !== (info.department ?? null)
    ? { audienceDepartments: departmentAudience(info.department) }
    : {}),
  name: info.name,
  description: info.description,
  topic: info.topic,
  kind: info.kind,
  archivedAt: info.archivedAt,
  department: info.department,
  memberCount: info.memberCount,
  updatedAt: info.updatedAt,
  lastMessageSeq: Math.max(channel.lastMessageSeq, info.lastMessageSeq),
  lastMessageAt: info.lastMessageAt ?? channel.lastMessageAt
});

/** Live unread bump for a message that arrived in a channel the viewer is not reading. */
export const bumpUnread = (
  channel: ChatChannel,
  input: { seq: number; createdAt: string; mentionsMe: boolean }
): ChatChannel => {
  if (input.seq <= channel.lastMessageSeq) {
    return channel; // already counted (duplicate event, or the sidebar was fetched after it)
  }
  const lastReadSeq = channel.lastReadSeq ?? 0;
  const unreadCount = Math.max(channel.unreadCount, input.seq - lastReadSeq);
  return {
    ...channel,
    lastMessageSeq: Math.max(channel.lastMessageSeq, input.seq),
    lastMessageAt: input.createdAt,
    unreadCount,
    mentionCount: input.mentionsMe
      ? Math.min(chatLimits.mentionCountCap, channel.mentionCount + 1)
      : channel.mentionCount
  };
};

/** The viewer read up to `seq` (local, before the server confirms). */
export const markSidebarRead = (channel: ChatChannel, seq: number): ChatChannel => {
  if ((channel.lastReadSeq ?? 0) >= seq && channel.unreadCount === 0) return channel;
  const lastReadSeq = Math.max(channel.lastReadSeq ?? 0, seq);
  const unreadCount = Math.max(0, channel.lastMessageSeq - lastReadSeq);
  return {
    ...channel,
    lastReadSeq,
    unreadCount,
    mentionCount: unreadCount === 0 ? 0 : channel.mentionCount
  };
};

/**
 * Must the viewer's capabilities (canPost, canJoin…) be re-read after a `chat:channel` event? They
 * follow the archived flag, the channel kind and (public channels, PD-053) its department. Unarchiving
 * arrives as an "updated" event, so the flag is compared, not the event kind (BUG-WK-43: viewers could
 * not post until a manual refetch).
 */
type CapabilityFields = Pick<ChatChannelInfo, "archivedAt" | "kind"> & {
  department?: ChatChannelInfo["department"];
};
export const channelEventChangesCapabilities = (
  cached: CapabilityFields | undefined,
  event: { kind: string; channel: CapabilityFields | null }
) => {
  if (event.kind === "archived") return true;
  if (!event.channel || !cached) return false;
  return (
    Boolean(cached.archivedAt) !== Boolean(event.channel.archivedAt) ||
    cached.kind !== event.channel.kind ||
    (cached.department ?? null) !== (event.channel.department ?? null)
  );
};

/** Delete confirmation: the word "xóa", with or without diacritics, any case ("xoa", "XÓA", " Xoá "). */
export const isDeleteConfirmation = (text: string) =>
  text.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d") === "xoa";
