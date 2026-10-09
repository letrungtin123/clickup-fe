import type {
  ProductionStatus,
  StatusTransition,
  TransitionActor
} from "@/contracts/production-catalog";
import { transitionActors } from "@/contracts/production-catalog";

/**
 * Pure helpers for the status workflow editor (PUT /production/transitions replaces the whole set).
 * Unit tested in workflow.test.ts.
 */

export const transitionActorLabels: Record<TransitionActor, string> = {
  ASSIGNEE: "Người làm",
  QC: "QC của task",
  JOB_LEADER: "Leader của job",
  ACCOUNT: "Account",
  LEADER: "Leader",
  SYSTEM: "Hệ thống"
};

export const transitionActorHints: Record<TransitionActor, string> = {
  ASSIGNEE: "Nhân viên được giao task",
  QC: "Người được gán QC cho task",
  JOB_LEADER: "Leader phụ trách job chứa task",
  ACCOUNT: "Bất kỳ ai có vai trò Account",
  LEADER: "Bất kỳ ai có vai trò Leader",
  SYSTEM: "Tự động, ví dụ Done → Chờ QC khi đã gán QC"
};

export type DraftTransition = {
  key: string;
  fromStatusId: string;
  toStatusId: string;
  actors: TransitionActor[];
  requiresNote: boolean;
};

export const sortActors = (actors: readonly TransitionActor[]) =>
  transitionActors.filter((actor) => actors.includes(actor));

export const toDraftTransitions = (transitions: readonly StatusTransition[]): DraftTransition[] =>
  transitions.map((transition) => ({
    key: transition.id,
    fromStatusId: transition.fromStatusId,
    toStatusId: transition.toStatusId,
    actors: sortActors(transition.actors),
    requiresNote: transition.requiresNote
  }));

/** Request body for PUT /production/transitions (row order is kept). */
export const toTransitionsPayload = (drafts: readonly DraftTransition[]) => ({
  transitions: drafts.map((draft) => ({
    fromStatusId: draft.fromStatusId,
    toStatusId: draft.toStatusId,
    actors: sortActors(draft.actors),
    requiresNote: draft.requiresNote
  }))
});

/** Problems per row key: same from/to, no actor, duplicate pair. Empty object = valid. */
export const validateTransitions = (drafts: readonly DraftTransition[]) => {
  const errors: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const draft of drafts) {
    if (draft.fromStatusId === draft.toStatusId) {
      errors[draft.key] = "Trạng thái đầu và cuối phải khác nhau.";
      continue;
    }
    if (draft.actors.length === 0) {
      errors[draft.key] = "Chọn ít nhất một người được chuyển.";
      continue;
    }
    const pair = `${draft.fromStatusId}>${draft.toStatusId}`;
    if (seen.has(pair)) {
      errors[draft.key] = "Luồng chuyển này bị trùng.";
    } else {
      seen.set(pair, draft.key);
    }
  }
  return errors;
};

/** True when the drafts would change what the server has (order, pairs, actors, note flag). */
export const transitionsChanged = (
  drafts: readonly DraftTransition[],
  saved: readonly StatusTransition[]
) =>
  JSON.stringify(toTransitionsPayload(drafts)) !==
  JSON.stringify(toTransitionsPayload(toDraftTransitions(saved)));

/** Statuses in display order with archived ones last. */
export const orderedStatuses = (statuses: readonly ProductionStatus[]) =>
  [...statuses].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      a.sortOrder - b.sortOrder ||
      a.code.localeCompare(b.code)
  );

/** ids for PUT /statuses/order: the reordered active statuses, then archived ones unchanged. */
export const statusOrderIds = (
  activeOrdered: readonly ProductionStatus[],
  all: readonly ProductionStatus[]
) => [
  ...activeOrdered.map((status) => status.id),
  ...orderedStatuses(all)
    .filter((status) => !status.active)
    .map((status) => status.id)
];

/** Status codes: upper-case letters, digits and _ (2–40 chars), starting with a letter. */
export const STATUS_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;

export const statusCodeFrom = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^[_0-9]+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/, "");
