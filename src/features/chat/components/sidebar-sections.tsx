import { Hash, MessagesSquare } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder sidebar sections for chat (PD-001). The chat UI replaces these components in place:
 * keep the exported names and props so the shell does not change.
 *
 * Expected data: GET channels/DMs (chat API) → qk.chat.channels(); rows link to `/c/:channelId`
 * and should join the `channel` realtime room only while that channel is open (useRealtimeRoom).
 */
export const ChannelsSection = () => (
  <PendingSection icon={Hash} hint="Kênh công khai và riêng tư sẽ hiển thị ở đây." />
);

export const DirectMessagesSection = () => (
  <PendingSection icon={MessagesSquare} hint="Tin nhắn trực tiếp và nhóm sẽ hiển thị ở đây." />
);

const PendingSection = ({ icon: Icon, hint }: { icon: typeof Hash; hint: string }) => (
  <div className="flex flex-col gap-0.5 px-2" aria-label={hint}>
    {[64, 48].map((width) => (
      <div key={width} className="flex h-8 items-center gap-2 px-2 opacity-70">
        <Icon className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
        <Skeleton className="h-2.5 animate-none before:hidden" style={{ width: `${width}%` }} />
      </div>
    ))}
    <p className="px-2 pt-0.5 pb-1 text-xs text-foreground-subtle">{hint}</p>
  </div>
);
