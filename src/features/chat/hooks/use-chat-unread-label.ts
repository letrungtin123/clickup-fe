import { hasUnread } from "../model/channels";
import { useChannels } from "./use-channels";

/** Accessible name for chat entry points with unread state ("Tin nhắn, 3 cuộc trò chuyện chưa đọc"). */
export const useChatUnreadLabel = (label: string) => {
  const channels = useChannels();
  const unread = (channels.data?.items ?? []).filter((channel) => hasUnread(channel)).length;
  return unread > 0 ? `${label}, ${unread} cuộc trò chuyện chưa đọc` : label;
};
