import type { KnowledgeCategory, KnowledgeImportance } from "@/contracts/knowledge";

import { reasonRequired } from "../../model/access";
import { categoryPath } from "../../model/categories";
import type { ReasonMode } from "../reason-dialog";

/**
 * Pure helpers of the space trash (/k/:spaceId/trash): where a restored item goes back to, the
 * automatic purge countdown and when a reason is asked.
 */

const hourMs = 3_600_000;
const dayMs = 24 * hourMs;

/**
 * "Tự xoá vĩnh viễn sau 12 ngày" (rounded up, so a fresh deletion reads "sau 30 ngày"); hours on the
 * last day. `urgent` within 3 days.
 */
export const purgeCountdown = (purgeAt: string, now: Date = new Date()) => {
  const left = Date.parse(purgeAt) - now.getTime();
  if (Number.isNaN(left)) return { label: "Tự xoá vĩnh viễn sau 30 ngày trong thùng rác", urgent: false };
  if (left <= 0) return { label: "Sắp tự xoá vĩnh viễn", urgent: true };
  if (left < dayMs) {
    const hours = Math.ceil(left / hourMs);
    return { label: `Tự xoá vĩnh viễn sau ${hours} giờ`, urgent: true };
  }
  const days = Math.ceil(left / dayMs);
  return { label: `Tự xoá vĩnh viễn sau ${days} ngày`, urgent: days <= 3 };
};

/** Category label of a trashed item: its path, "Chưa phân loại", or null when the category is gone. */
export const trashCategoryLabel = (categories: readonly KnowledgeCategory[], categoryId: string | null) =>
  categoryId === null ? "Chưa phân loại" : categoryPath(categories, categoryId);

/** Where "Khôi phục" puts the item back (the original category, PD-031 §08). */
export const restoreDestination = (categories: readonly KnowledgeCategory[], categoryId: string | null) => {
  if (categoryId === null) return "phần Chưa phân loại của kho";
  const path = categoryPath(categories, categoryId);
  return path ? `chuyên mục “${path}”` : "kho (chuyên mục cũ không còn)";
};

/**
 * Reason asked by the trash actions: critical items always need one (restore and purge); a purge of
 * other items may carry one. `forced` = the server answered KNOWLEDGE_REASON_REQUIRED anyway.
 */
export const trashReasonMode = (
  kind: "restore" | "purge",
  importance: KnowledgeImportance,
  forced = false
): ReasonMode => {
  if (forced || reasonRequired(importance)) return "required";
  return kind === "purge" ? "optional" : "none";
};
