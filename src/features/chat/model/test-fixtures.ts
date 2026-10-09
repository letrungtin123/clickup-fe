import type { ChatChannel, ChatMessage } from "@/contracts/chat";
import type { UserRef } from "@/contracts/work";

/** Test fixtures for chat model tests. */

export const userA: UserRef = {
  id: "00000000-0000-4000-8000-00000000000a",
  displayName: "Minh Nguyễn",
  email: "minh@example.test",
  avatarUrl: null
};
export const userB: UserRef = {
  id: "00000000-0000-4000-8000-00000000000b",
  displayName: "An Phạm",
  email: "an@example.test",
  avatarUrl: null
};
export const me: UserRef = {
  id: "00000000-0000-4000-8000-0000000000ff",
  displayName: "Linh Trần",
  email: "linh@example.test",
  avatarUrl: null
};

export const CHANNEL_ID = "00000000-0000-4000-8000-0000000000c1";

let counter = 0;
const nextId = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
};

export const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: nextId(),
  channelId: CHANNEL_ID,
  seq: 1,
  threadRootId: null,
  kind: "user",
  author: userA,
  body: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Xin chào" }] }]
  },
  text: "Xin chào",
  systemEvent: null,
  clientMessageId: null,
  mentions: [],
  attachments: [],
  reactions: [],
  replyCount: 0,
  lastReplyAt: null,
  isEdited: false,
  editedAt: null,
  isDeleted: false,
  deletedAt: null,
  createdAt: "2026-10-09T08:00:00.000Z",
  ...overrides
});

export const makeChannel = (overrides: Partial<ChatChannel> = {}): ChatChannel => ({
  id: CHANNEL_ID,
  kind: "public",
  name: "thiết-kế",
  description: null,
  topic: null,
  createdBy: me.id,
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-01T08:00:00.000Z",
  archivedAt: null,
  memberCount: 3,
  lastMessageSeq: 10,
  lastMessageAt: "2026-10-09T08:00:00.000Z",
  isMember: true,
  myAccess: "submit",
  myRole: "member",
  notifyLevel: "all",
  lastReadSeq: 10,
  unreadCount: 0,
  mentionCount: 0,
  participants: [],
  ...overrides
});
