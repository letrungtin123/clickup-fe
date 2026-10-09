import { cn } from "cn";
import { Archive, Hash, Lock, Users } from "lucide-react";

import { UserAvatar } from "@/components/shared/user-avatar";
import type { ChatChannel } from "@/contracts/chat";

type GlyphChannel = Pick<ChatChannel, "kind" | "participants" | "archivedAt">;

/** Leading icon of a conversation: # / lock for channels, avatar(s) for DMs. */
export const ChannelGlyph = ({
  channel,
  online,
  size = "sm",
  className
}: {
  channel: GlyphChannel;
  /** Presence of the other DM participant. */
  online?: boolean | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) => {
  if (channel.kind === "dm") {
    const other = channel.participants[0];
    if (other) {
      return (
        <UserAvatar
          user={other}
          size={size === "lg" ? "md" : size === "md" ? "sm" : "xs"}
          online={online}
          {...(className ? { className } : {})}
        />
      );
    }
  }
  if (channel.kind === "group_dm") {
    const count = channel.participants.length;
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-md bg-muted font-semibold text-foreground-muted",
          size === "lg" ? "size-8 text-xs" : size === "md" ? "size-6 text-[10px]" : "size-5 text-[9px]",
          className
        )}
        aria-hidden="true"
        title={channel.participants.map((user) => user.displayName).join(", ")}
      >
        {count > 9 ? <Users className="size-3" /> : count + 1}
      </span>
    );
  }
  const Icon = channel.archivedAt ? Archive : channel.kind === "private" ? Lock : Hash;
  return (
    <Icon
      className={cn(
        "shrink-0 text-foreground-subtle",
        size === "lg" ? "size-5" : size === "md" ? "size-4" : "size-3.5",
        className
      )}
      aria-hidden="true"
    />
  );
};

/** Stacked initials for group DMs in headers. */
export const ParticipantsStack = ({
  participants,
  max = 3
}: {
  participants: ChatChannel["participants"];
  max?: number;
}) => (
  <span className="flex -space-x-1.5" aria-hidden="true">
    {participants.slice(0, max).map((user) => (
      <span key={user.id} className="rounded-full ring-2 ring-background">
        <UserAvatar user={user} size="xs" />
      </span>
    ))}
    {participants.length > max ? (
      <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground-muted ring-2 ring-background">
        +{participants.length - max}
      </span>
    ) : null}
  </span>
);

