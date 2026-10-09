import { isSameDay } from "date-fns";

import type { Notification } from "@/contracts/notifications";
import { formatDayLabel } from "@/features/chat/model/timeline";

export type NotificationGroup = { key: string; label: string; items: Notification[] };

/** Consecutive day buckets (input is newest first): "Hôm nay", "Hôm qua", "Thứ Hai, 6 tháng 10"… */
export const groupByDay = (items: readonly Notification[], now = new Date()): NotificationGroup[] => {
  const groups: NotificationGroup[] = [];
  for (const item of items) {
    const date = new Date(item.createdAt);
    const last = groups.at(-1);
    if (last && isSameDay(new Date(last.items[0]?.createdAt ?? 0), date)) {
      last.items.push(item);
    } else {
      groups.push({ key: date.toDateString(), label: formatDayLabel(date, now), items: [item] });
    }
  }
  return groups;
};
