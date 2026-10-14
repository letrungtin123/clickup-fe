import { Aperture, FolderKanban, type LucideIcon } from "lucide-react";

import type { Department } from "@/contracts/departments";
import type { ColorToken } from "@/contracts/work";

/** Colour of each department, the same everywhere (switcher tile, inbox badge, member chips). */
export const departmentTones: Record<Department, ColorToken> = {
  PHOTO_RETOUCH: "fuchsia",
  PRODUCTION: "sky"
};

/** Glyph of each department (switcher, rail, badges). */
export const departmentIcons: Record<Department, LucideIcon> = {
  PHOTO_RETOUCH: Aperture,
  PRODUCTION: FolderKanban
};

/** One line under each choice in the switcher menu. */
export const departmentDescriptions: Record<Department, string> = {
  PHOTO_RETOUCH: "Job, QC, bảng điểm, lịch nghỉ",
  PRODUCTION: "Dự án, danh sách và công việc"
};
