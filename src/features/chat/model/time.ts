import { differenceInSeconds, formatDistanceToNowStrict } from "date-fns";
import { vi } from "date-fns/locale";

/** "vừa xong" under a minute, otherwise "5 phút trước", "2 giờ trước"… */
export const timeAgo = (iso: string, now = new Date()) => {
  const date = new Date(iso);
  if (Math.abs(differenceInSeconds(now, date)) < 45) return "vừa xong";
  return formatDistanceToNowStrict(date, { locale: vi, addSuffix: true });
};
