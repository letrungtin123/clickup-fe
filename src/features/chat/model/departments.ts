import { isDirectKind, type ChatChannel, type ChatChannelInfo } from "@/contracts/chat";
import { departmentCodes, sortDepartments, type Department } from "@/contracts/departments";

/**
 * Chat follows the header department switcher (PD-054), pure parts. Every conversation carries the departments whose
 * chat shows it (`audienceDepartments`, computed by the server for the viewer): the sidebar, "/c" and the chat badges
 * show the conversations of the selected department; the switcher counts what waits in the other ones.
 *
 * A conversation is never hidden everywhere: one whose departments share nothing with the viewer's own departments
 * shows in every department.
 */

/** What the filter needs to know about the viewer. `current` null = no filtering (no department, or cannot switch). */
export type DepartmentScope = {
  current: Department | null;
  departments: readonly Department[];
};

type AudienceFields = Pick<ChatChannelInfo, "kind" | "department"> & {
  audienceDepartments?: readonly Department[] | undefined;
};

/** Audience of a named channel from its department alone (the server's rule): [it], or every department when null. */
export const departmentAudience = (department: Department | null): Department[] =>
  department ? [department] : [...departmentCodes];

/**
 * Departments whose chat shows the conversation. Normally the server's `audienceDepartments`; a payload without it
 * (or an empty list) falls back to the channel's department for named channels and to every department for DMs.
 */
export const conversationAudience = (channel: AudienceFields): readonly Department[] => {
  const audience = channel.audienceDepartments;
  if (audience && audience.length > 0) return audience;
  return isDirectKind(channel.kind) ? [...departmentCodes] : departmentAudience(channel.department);
};

/** Is the conversation shown while `department` is selected (fallback included)? */
export const isShownInDepartment = (
  channel: AudienceFields,
  department: Department | null,
  myDepartments: readonly Department[]
) => {
  if (department === null) return true;
  const audience = conversationAudience(channel);
  if (audience.includes(department)) return true;
  // None of the conversation's departments is one of mine: shown everywhere rather than nowhere.
  return !audience.some((entry) => myDepartments.includes(entry));
};

/** The conversations of the selected department (order kept). */
export const channelsInDepartment = <T extends AudienceFields>(
  channels: readonly T[],
  scope: DepartmentScope
): T[] =>
  scope.current === null
    ? [...channels]
    : channels.filter((channel) => isShownInDepartment(channel, scope.current, scope.departments));

/**
 * Department to switch to so the conversation shows (opened by URL, notification, search): null when it already shows
 * in the selected department, else the first of its departments that is one of mine (stable order).
 */
export const departmentToShow = (channel: AudienceFields, scope: DepartmentScope): Department | null => {
  if (scope.current === null || isShownInDepartment(channel, scope.current, scope.departments)) return null;
  const audience = conversationAudience(channel);
  return sortDepartments(scope.departments).find((department) => audience.includes(department)) ?? null;
};

/**
 * The chat badge rule (sidebar rows, chat entry points, switcher): mentions everywhere, plus unread direct messages that
 * are not muted. Other unread channels only get a dot.
 */
export const badgeCount = (
  channel: Pick<ChatChannel, "kind" | "mentionCount" | "unreadCount" | "notifyLevel">
) => {
  if (channel.mentionCount > 0) return channel.mentionCount;
  return isDirectKind(channel.kind) && channel.unreadCount > 0 && channel.notifyLevel !== "none"
    ? channel.unreadCount
    : 0;
};

export type OtherDepartmentUnread = {
  /** Badge count of every conversation NOT shown in the selected department. */
  total: number;
  /** Per other department: badge count of its conversations that are not shown in the selected one. */
  byDepartment: Partial<Record<Department, number>>;
};

/** What waits in the viewer's other departments (counted with `badgeCount`). Nothing without a selected department. */
export const otherDepartmentUnread = (
  channels: readonly (AudienceFields &
    Pick<ChatChannel, "mentionCount" | "unreadCount" | "notifyLevel">)[],
  scope: DepartmentScope
): OtherDepartmentUnread => {
  const result: OtherDepartmentUnread = { total: 0, byDepartment: {} };
  const { current } = scope;
  if (current === null) return result;
  const others = sortDepartments(scope.departments).filter((department) => department !== current);
  for (const channel of channels) {
    const count = badgeCount(channel);
    if (count === 0 || isShownInDepartment(channel, current, scope.departments)) continue;
    result.total += count;
    for (const department of others) {
      if (isShownInDepartment(channel, department, scope.departments)) {
        result.byDepartment[department] = (result.byDepartment[department] ?? 0) + count;
      }
    }
  }
  return result;
};
