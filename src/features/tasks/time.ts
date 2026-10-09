import { differenceInCalendarDays, differenceInSeconds, format, formatDistanceToNowStrict, isSameYear } from "date-fns";
import { vi } from "date-fns/locale";

/** "vừa xong" / "5 phút trước" / "Hôm qua 14:20" / "12 thg 10, 09:05" / "3 thg 1, 2025". */
export const relativeTime = (iso: string, now: Date = new Date()) => {
  const date = new Date(iso);
  const seconds = differenceInSeconds(now, date);
  if (seconds < 45) return "vừa xong";
  const days = differenceInCalendarDays(now, date);
  if (days === 0) return `${formatDistanceToNowStrict(date, { locale: vi })} trước`;
  if (days === 1) return `Hôm qua ${format(date, "HH:mm")}`;
  if (isSameYear(date, now)) return format(date, "d 'thg' M, HH:mm", { locale: vi });
  return format(date, "d 'thg' M, yyyy", { locale: vi });
};

export const fullDateTime = (iso: string) => format(new Date(iso), "HH:mm, dd/MM/yyyy");
