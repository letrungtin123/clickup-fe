import type { ColorToken, TaskPriority } from "@/contracts/work";

/** Display metadata per task priority (label, color token, sort rank). */
export const priorityMeta: Record<
  TaskPriority,
  { label: string; color: ColorToken; rank: number }
> = {
  urgent: { label: "Khẩn cấp", color: "red", rank: 0 },
  high: { label: "Cao", color: "amber", rank: 1 },
  normal: { label: "Bình thường", color: "blue", rank: 2 },
  low: { label: "Thấp", color: "gray", rank: 3 }
};
