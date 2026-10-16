import { cn } from "cn";
import { ArrowLeft, Bell, BellOff, AtSign, LogIn, Users } from "lucide-react";
import { Link } from "@/components/shared/router-link";

import { AvatarGroup } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isDirectKind, type ChatChannelDetail, type NotifyLevel } from "@/contracts/chat";
import { DepartmentBadge } from "@/features/departments/components/department-badge";
import { usePresence } from "@/lib/realtime/hooks";

import { useChannelMembers, useJoinChannel, useNotifyLevel } from "../hooks/use-channels";
import { channelTitle } from "../model/channels";
import { ChannelGlyph } from "./channel-glyph";
import { notifyOptions } from "../model/notify";

const notifyIcon: Record<NotifyLevel, typeof Bell> = { all: Bell, mentions: AtSign, none: BellOff };

/**
 * Conversation header: identity, topic, members, notification level. It does not open the conversation settings
 * any more (owner, 2026-10-16): those live behind the "…" of the conversation's row (sidebar / conversation list).
 */
export const ChannelHeader = ({
  channel,
  mobile
}: {
  channel: ChatChannelDetail;
  mobile: boolean;
}) => {
  const direct = isDirectKind(channel.kind);
  const partner = channel.kind === "dm" ? channel.participants[0] : undefined;
  const online = usePresence(partner ? [partner.id] : []);
  const members = useChannelMembers(channel.id, "", !direct && channel.capabilities.canRead);
  const preview = members.data?.pages[0]?.items.slice(0, 4).map((member) => member.user) ?? [];
  const join = useJoinChannel(channel.id);
  const notify = useNotifyLevel(channel.id);
  const level = channel.notifyLevel ?? "all";
  const NotifyIcon = notifyIcon[level];
  const subtitle = direct
    ? partner
      ? online.has(partner.id)
        ? "Đang hoạt động"
        : (partner.email ?? "Tin nhắn trực tiếp")
      : `${channel.participants.length + 1} người`
    : channel.topic || channel.description;

  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-2 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-4",
        // Phones: the global top bar is hidden in a conversation, so this header owns the notch inset.
        mobile && "h-[calc(3.5rem+env(safe-area-inset-top))] gap-1 pt-[env(safe-area-inset-top)]"
      )}
    >
      {mobile ? (
        <Button
          variant="ghost"
          size="icon"
          render={<Link to="/c" />}
          nativeButton={false}
          aria-label="Danh sách trò chuyện"
        >
          <ArrowLeft />
        </Button>
      ) : null}
      <div className="flex min-w-0 items-center gap-2 px-1.5 py-1">
        <span className="flex shrink-0 items-center justify-center">
          <ChannelGlyph
            channel={channel}
            size="md"
            online={partner ? online.has(partner.id) : undefined}
            className={cn(!direct && "text-foreground-muted")}
          />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1">
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">
              {channelTitle(channel)}
            </h1>
            {channel.department ? (
              <DepartmentBadge department={channel.department} className="ml-0.5" />
            ) : null}
          </span>
          {subtitle ? (
            <span className="truncate text-xs text-foreground-muted">{subtitle}</span>
          ) : null}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!channel.isMember && channel.capabilities.canJoin ? (
          <Button size="sm" onClick={() => join.mutate()} disabled={join.isPending}>
            {join.isPending ? <Spinner /> : <LogIn />}
            Tham gia
          </Button>
        ) : null}

        {!direct ? (
          <span
            role="img"
            aria-label={`${channel.memberCount} thành viên`}
            title={`${channel.memberCount} thành viên`}
            className="flex h-8 items-center gap-1.5 px-1.5 text-xs text-foreground-muted pointer-coarse:h-10 pointer-coarse:px-2"
          >
            {preview.length > 0 && !mobile ? (
              <AvatarGroup users={preview} max={3} size="xs" />
            ) : (
              <Users className="size-4" aria-hidden="true" />
            )}
            <span className="tabular-nums">{channel.memberCount}</span>
          </span>
        ) : null}

        {channel.isMember ? (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    aria-label="Thông báo của kênh"
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md outline-none pointer-coarse:size-10 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-surface-hover [&_svg]:size-4",
                      level === "none" ? "text-foreground-subtle" : "text-foreground-muted"
                    )}
                  />
                }
              >
                <NotifyIcon />
              </TooltipTrigger>
              <TooltipContent>Thông báo</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Thông báo cho cuộc trò chuyện này</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={level}
                  onValueChange={(value) => value !== level && notify.mutate(value as NotifyLevel)}
                >
                  {notifyOptions.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      <span className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-foreground-muted">{option.description}</span>
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
};
