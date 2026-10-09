import { cn } from "cn";
import { ArrowLeft, Bell, BellOff, ChevronDown, AtSign, Info, LogIn, Users } from "lucide-react";
import { Link } from "react-router";

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
import { usePresence } from "@/lib/realtime/hooks";

import { useChannelMembers, useJoinChannel, useNotifyLevel } from "../hooks/use-channels";
import { channelTitle } from "../model/channels";
import { ChannelGlyph } from "./channel-glyph";
import type { SettingsTab } from "./channel-settings-dialog";
import { notifyOptions } from "../model/notify";

const notifyIcon: Record<NotifyLevel, typeof Bell> = { all: Bell, mentions: AtSign, none: BellOff };

/** Conversation header: identity, topic, members, notification level, details. */
export const ChannelHeader = ({
  channel,
  mobile,
  onOpenSettings
}: {
  channel: ChatChannelDetail;
  mobile: boolean;
  onOpenSettings: (tab: SettingsTab) => void;
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
      <button
        type="button"
        onClick={() => onOpenSettings("about")}
        className="group/title flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
      >
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
            <ChevronDown
              className="size-3.5 shrink-0 text-foreground-subtle transition-colors group-hover/title:text-foreground"
              aria-hidden="true"
            />
          </span>
          {subtitle ? (
            <span className="truncate text-xs text-foreground-muted">{subtitle}</span>
          ) : null}
        </span>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!channel.isMember && channel.capabilities.canJoin ? (
          <Button size="sm" onClick={() => join.mutate()} disabled={join.isPending}>
            {join.isPending ? <Spinner /> : <LogIn />}
            Tham gia
          </Button>
        ) : null}

        {!direct ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => onOpenSettings("members")}
                  aria-label={`${channel.memberCount} thành viên`}
                  className="flex h-8 items-center gap-1.5 rounded-md px-1.5 text-xs text-foreground-muted outline-none pointer-coarse:h-10 pointer-coarse:px-2 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            >
              {preview.length > 0 && !mobile ? (
                <span className="pointer-events-none">
                  <AvatarGroup users={preview} max={3} size="xs" />
                </span>
              ) : (
                <Users className="size-4" aria-hidden="true" />
              )}
              <span className="tabular-nums">{channel.memberCount}</span>
            </TooltipTrigger>
            <TooltipContent>Xem thành viên</TooltipContent>
          </Tooltip>
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

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => onOpenSettings(channel.isMember ? "settings" : "about")}
                aria-label="Chi tiết cuộc trò chuyện"
                className="flex size-8 items-center justify-center rounded-md text-foreground-muted outline-none pointer-coarse:size-10 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
              />
            }
          >
            <Info />
          </TooltipTrigger>
          <TooltipContent>Chi tiết</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
};
