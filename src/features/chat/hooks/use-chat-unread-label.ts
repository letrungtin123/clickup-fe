import { hasUnread } from "../model/channels";
import { useDepartmentChannels } from "./use-department-channels";

/**
 * Accessible name for chat entry points with unread state ("Tin nhắn, 3 cuộc trò chuyện chưa đọc"). Counts the
 * conversations of the selected department, like the chat badge (PD-054).
 */
export const useChatUnreadLabel = (label: string) => {
  const { items } = useDepartmentChannels();
  const unread = items.filter((channel) => hasUnread(channel)).length;
  return unread > 0 ? `${label}, ${unread} cuộc trò chuyện chưa đọc` : label;
};
