import type { ChatMessage } from "@/contracts/chat";

/** Lists names Vietnamese-style: "A", "A và B", "A, B và 3 người khác". */
export const listNames = (names: readonly string[], fallbackCount = 0) => {
  if (names.length === 0) {
    return fallbackCount > 0 ? `${fallbackCount} thành viên` : "thành viên";
  }
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} và ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} và ${names[2]}`;
  return `${names.slice(0, 2).join(", ")} và ${names.length - 2} người khác`;
};

/**
 * Vietnamese sentence for a system message from its structured event (the server's `text` is an
 * English summary). `nameOf` resolves user ids the client already knows (members, authors).
 */
export const systemSentence = (
  message: Pick<ChatMessage, "systemEvent" | "author" | "text">,
  nameOf: (userId: string) => string | null
) => {
  const event = message.systemEvent;
  if (!event) return message.text;
  const actor =
    message.author?.displayName ?? (event.actorId ? nameOf(event.actorId) : null) ?? "Ai đó";
  const userIds = event.userIds ?? [];
  const names = userIds.map(nameOf).filter((name): name is string => Boolean(name));
  const people = names.length === userIds.length ? listNames(names) : listNames([], userIds.length);

  switch (event.type) {
    case "created":
      return `${actor} đã tạo kênh${event.name ? ` #${event.name}` : " này"}`;
    case "joined":
      return `${actor} đã tham gia kênh`;
    case "left":
      return `${actor} đã rời kênh`;
    case "members_added":
      return `${actor} đã thêm ${people} vào kênh`;
    case "member_removed":
      return `${actor} đã xóa ${people} khỏi kênh`;
    case "renamed":
      return `${actor} đã đổi tên kênh thành “${event.name ?? ""}”`;
    case "topic_changed":
      return event.topic ? `${actor} đã đặt chủ đề: ${event.topic}` : `${actor} đã xóa chủ đề kênh`;
    case "kind_changed":
      return `${actor} đã chuyển kênh thành ${event.kind === "private" ? "riêng tư" : "công khai"}`;
    case "archived":
      return `${actor} đã lưu trữ kênh`;
    case "unarchived":
      return `${actor} đã khôi phục kênh`;
  }
};
