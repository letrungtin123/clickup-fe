/**
 * One toast per conversation: a burst of messages updates the same card instead of stacking new ones. The inbox
 * toast of a chat notification (an @mention, a thread reply) uses the same id, so one message never shows twice.
 */
export const chatToastId = (channelId: string) => `chat:${channelId}`;

/** "An · #thiet-ke" → "An · #thiet-ke · 3 tin mới" while several messages arrived before the card closed. */
export const chatToastTitle = (title: string, count: number) => (count > 1 ? `${title} · ${count} tin mới` : title);
