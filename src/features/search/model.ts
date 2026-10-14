import type { GlobalSearchResult, SearchGroup } from "@/contracts/search";
import type { UserRef } from "@/contracts/work";
import { taskHref } from "@/features/tasks/use-task-panel";

/**
 * Global search result mapping (shared by the ⌘K palette and the /search page) and accent-insensitive
 * match highlighting (the server matches with unaccent, so "thiet ke" finds "thiết kế").
 */

export type SearchTab = "all" | SearchGroup;

export const searchTabs: readonly { value: SearchTab; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "tasks", label: "Công việc" },
  { value: "knowledge", label: "Tri thức" },
  { value: "messages", label: "Tin nhắn" },
  { value: "projects", label: "Dự án" },
  { value: "lists", label: "Danh sách" },
  { value: "people", label: "Người" }
];

export const groupLabels: Record<SearchGroup, string> = {
  tasks: "Công việc",
  knowledge: "Tri thức",
  messages: "Tin nhắn",
  projects: "Dự án",
  lists: "Danh sách",
  people: "Mọi người"
};

export const isSearchTab = (value: string | null): value is SearchTab =>
  searchTabs.some((tab) => tab.value === value);

/**
 * Groups of the Production department's workspace (PD-041). Outside that department (Photo Retouch, or no
 * department) search covers shared content only: people, messages and knowledge.
 */
export const workspaceSearchGroups: readonly SearchGroup[] = ["tasks", "projects", "lists"];

export const isWorkspaceGroup = (group: SearchTab) =>
  (workspaceSearchGroups as readonly SearchTab[]).includes(group);

/** Tabs offered on /search: "Tri thức" needs knowledge.view, the workspace groups the Production department. */
export const visibleSearchTabs = ({ knowledge, workspace }: { knowledge: boolean; workspace: boolean }) =>
  searchTabs.filter(
    (tab) => (tab.value !== "knowledge" || knowledge) && (workspace || !isWorkspaceGroup(tab.value))
  );

/** Drops workspace hits outside the Production department (the server already sends none for Photo Retouch). */
export const scopeSearchItems = (items: readonly SearchItem[], workspace: boolean): SearchItem[] =>
  workspace ? [...items] : items.filter((item) => !isWorkspaceGroup(item.group));

/** Link to a message inside its conversation (thread replies open their thread). */
export const messageHref = (hit: {
  channelId: string;
  messageId: string;
  threadRootId: string | null;
}) => {
  const params = new URLSearchParams();
  if (hit.threadRootId) params.set("thread", hit.threadRootId);
  params.set("message", hit.messageId);
  return `/c/${hit.channelId}?${params.toString()}`;
};

export type SearchItem =
  | {
      group: "tasks";
      id: string;
      href: string;
      title: string;
      key: string;
      meta: string;
      hit: GlobalSearchResult["tasks"][number];
    }
  | {
      group: "projects";
      id: string;
      href: string;
      title: string;
      key: string;
      meta: string;
      hit: GlobalSearchResult["projects"][number];
    }
  | {
      group: "lists";
      id: string;
      href: string;
      title: string;
      meta: string;
      hit: GlobalSearchResult["lists"][number];
    }
  | { group: "people"; id: string; title: string; meta: string; user: UserRef }
  | {
      group: "knowledge";
      id: string;
      href: string;
      title: string;
      meta: string;
      hit: GlobalSearchResult["knowledge"][number];
    }
  | {
      group: "messages";
      id: string;
      href: string;
      title: string;
      meta: string;
      hit: GlobalSearchResult["messages"][number];
    };

const conversationName = (hit: GlobalSearchResult["messages"][number]) =>
  hit.channelKind === "dm" || hit.channelKind === "group_dm"
    ? "Tin nhắn trực tiếp"
    : `#${hit.channelName ?? "kênh"}`;

/** Knowledge item page (PD-031): /k/<spaceId>/i/<itemId>. */
export const knowledgeItemHref = (hit: { spaceId: string; id: string }) => `/k/${hit.spaceId}/i/${hit.id}`;

/** Flattens grouped results in display order: tasks, knowledge, messages, projects, lists, people. */
export const mapSearchResults = (result: GlobalSearchResult | undefined): SearchItem[] => {
  if (!result) return [];
  return [
    ...result.tasks.map((hit): SearchItem => ({
      group: "tasks",
      id: hit.id,
      href: taskHref(hit),
      title: hit.title,
      key: hit.key,
      meta: `${hit.projectName} · ${hit.listName}`,
      hit
    })),
    ...(result.knowledge ?? []).map((hit): SearchItem => ({
      group: "knowledge",
      id: hit.id,
      href: knowledgeItemHref(hit),
      title: hit.title,
      meta: `${hit.spaceName} · ${hit.status.name}`,
      hit
    })),
    ...result.messages.map((hit): SearchItem => ({
      group: "messages",
      id: hit.messageId,
      href: messageHref(hit),
      title: hit.text,
      meta: [hit.author?.displayName, conversationName(hit)].filter(Boolean).join(" · "),
      hit
    })),
    ...result.projects.map((hit): SearchItem => ({
      group: "projects",
      id: hit.id,
      href: `/p/${hit.id}`,
      title: hit.name,
      key: hit.key,
      meta: hit.visibility === "private" ? "Dự án riêng tư" : "Dự án công khai",
      hit
    })),
    ...result.lists.map((hit): SearchItem => ({
      group: "lists",
      id: hit.id,
      href: `/p/${hit.projectId}/l/${hit.id}`,
      title: hit.name,
      meta: hit.projectName,
      hit
    })),
    ...result.people.map((user): SearchItem => ({
      group: "people",
      id: user.id,
      title: user.displayName,
      meta: user.email ?? "",
      user
    }))
  ];
};

export const countByGroup = (items: readonly SearchItem[]) => {
  const counts: Record<SearchGroup, number> = {
    tasks: 0,
    knowledge: 0,
    messages: 0,
    projects: 0,
    lists: 0,
    people: 0
  };
  for (const item of items) counts[item.group] += 1;
  return counts;
};

// Highlighting -------------------------------------------------------------------------------------

/** Lower-case, diacritic-free form of one character ("Ế" → "e", "đ" → "d"). */
const fold = (char: string) =>
  char
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLocaleLowerCase("vi");

/**
 * Ranges [start, end) in `text` matching any whitespace-separated term of `query`, compared without
 * case or Vietnamese diacritics. Overlapping ranges are merged.
 */
export const findMatches = (text: string, query: string): [number, number][] => {
  const terms = query
    .split(/\s+/)
    .map((term) => [...term].map(fold).join(""))
    .filter((term) => term.length > 0);
  if (terms.length === 0 || text.length === 0) return [];

  // Folded text plus, for each folded code unit, the index of the original character it came from.
  let folded = "";
  const origin: number[] = [];
  let offset = 0;
  for (const char of text) {
    const piece = fold(char);
    for (let index = 0; index < piece.length; index += 1) origin.push(offset);
    folded += piece;
    offset += char.length;
  }
  origin.push(text.length);

  const ranges: [number, number][] = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at === -1) break;
      const start = origin[at] ?? 0;
      const lastOrigin = origin[at + term.length - 1] ?? start;
      // End after the full original character the last folded unit came from.
      const end = lastOrigin + ([...text.slice(lastOrigin)][0]?.length ?? 1);
      ranges.push([start, end]);
      from = at + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
};

/** Splits text into plain / matched segments for rendering. */
export const highlightSegments = (text: string, query: string) => {
  const ranges = findMatches(text, query);
  if (ranges.length === 0) return [{ text, match: false }];
  const segments: { text: string; match: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
};

/** Lower-case, diacritic-free text for client-side matching of short local lists. */
export const foldText = (value: string) => [...value].map(fold).join("");

/** A window of a long text around its first match (message excerpts). */
export const excerptAround = (text: string, query: string, radius = 80) => {
  const compact = text.replace(/\s+/g, " ").trim();
  const first = findMatches(compact, query)[0];
  if (!first || compact.length <= radius * 2) return compact;
  const start = Math.max(0, first[0] - radius);
  const end = Math.min(compact.length, first[1] + radius);
  return `${start > 0 ? "…" : ""}${compact.slice(start, end)}${end < compact.length ? "…" : ""}`;
};
