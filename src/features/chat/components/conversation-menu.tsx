import { cn } from "cn";
import { Ellipsis, Info, Settings2, Users } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { ChatChannel } from "@/contracts/chat";

import { channelTitle } from "../model/channels";
import { useChannelSettingsStore } from "../model/ui-state";

/**
 * The "…" of a conversation row (owner, 2026-10-16): the only way into a conversation's settings — information,
 * members, notifications, leave / archive / delete — from the sidebar and the conversation list (the header of an
 * open conversation no longer opens them). The dialog itself is SidebarChannelSettings, mounted in ChatDialogs.
 */
export const ConversationMenu = ({
  channel,
  open,
  onOpenChange,
  className
}: {
  channel: ChatChannel;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  className?: string | undefined;
}) => {
  const openSettings = useChannelSettingsStore((state) => state.open);
  const direct = channel.kind === "dm" || channel.kind === "group_dm";
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label={`Tùy chọn cho ${channelTitle(channel)}`}
        className={cn(
          "flex size-6 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-border/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-border/70 aria-expanded:text-foreground pointer-coarse:size-8 [&_svg]:size-3.5",
          className
        )}
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => openSettings(channel.id, "about")}>
          <Info />
          {direct ? "Thông tin cuộc trò chuyện" : "Thông tin kênh"}
        </DropdownMenuItem>
        {channel.kind !== "dm" ? (
          <DropdownMenuItem onClick={() => openSettings(channel.id, "members")}>
            <Users />
            Thành viên
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => openSettings(channel.id, "settings")}>
          <Settings2 />
          Cài đặt &amp; thông báo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
