import { qk } from "@/lib/query-keys";

/**
 * Chat query keys. Extends the foundation's `qk.chat` tree (one prefix `["chat"]` invalidates all):
 *
 *   ["chat", "channels"]                          sidebar collection
 *   ["chat", "channel", id]                       channel detail (capabilities)
 *   ["chat", "channel", id, "messages", "root"]   message window (MessageWindow)
 *   ["chat", "channel", id, "members", q]         members (infinite)
 *   ["chat", "thread", rootId]                    thread (ThreadState)
 *   ["chat", "browse", department, q]             browse public channels of a department (infinite)
 *   ["chat", "attachment-url", id]                signed URL for one attachment
 *   ["chat", "mentions"]                          "mentions of me" feed
 *   ["chat", "search", q]                         message search (infinite)
 */
export const chatKeys = {
  ...qk.chat,
  members: (channelId: string, q = "") =>
    ["chat", "channel", channelId, "members", q.trim().toLocaleLowerCase()] as const,
  membersAll: (channelId: string) => ["chat", "channel", channelId, "members"] as const,
  thread: (rootId: string) => ["chat", "thread", rootId] as const,
  /** Who reacted to a message (tooltip / reactions sheet). */
  reactions: (messageId: string) => ["chat", "reactions", messageId] as const,
  threads: () => ["chat", "thread"] as const,
  browse: (q = "", department: string | null = null) =>
    ["chat", "browse", department ?? "all", q.trim().toLocaleLowerCase()] as const,
  attachmentUrl: (attachmentId: string) => ["chat", "attachment-url", attachmentId] as const,
  mentions: () => ["chat", "mentions"] as const,
  search: (q: string) => ["chat", "search", q.trim().toLocaleLowerCase()] as const,
  /** People search: org-wide, in a channel, or for a DM ("dm"); a department suffix when scoped (PD-054). */
  people: (q: string, scope?: string) =>
    ["chat", "people", scope ?? "org", q.trim().toLocaleLowerCase()] as const
} as const;
