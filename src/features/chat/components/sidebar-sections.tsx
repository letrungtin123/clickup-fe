import { cn } from "cn";
import {
  ArrowDownWideNarrow,
  BellOff,
  Compass,
  Hash,
  MessageSquarePlus,
  MessagesSquare,
  Plus,
  RefreshCw
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import { NavLink } from "@/components/shared/router-link";

import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatChannel } from "@/contracts/chat";
import { P } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks";
import { usePresence } from "@/lib/realtime/hooks";

import { useChannels } from "../hooks/use-channels";
import {
  channelTitle,
  formatCount,
  hasUnread,
  isMuted,
  sortChannels,
  splitSidebar,
  type ChannelSort
} from "../model/channels";
import { useChatDialogStore, useChatPrefs } from "../model/ui-state";
import { ChannelGlyph } from "./channel-glyph";

/**
 * Sidebar chat sections (PD-001). Data: GET /channels (qk.chat.channels) kept live by ChatRuntime —
 * unread/mention badges, ordering and presence update without refetching.
 */

const COLLAPSED_LIMIT = 15;

export const ChannelsSection = () => {
  const channels = useChannels();
  const sort = useChatPrefs((state) => state.channelSort);
  const items = useMemo(
    () => sortChannels(splitSidebar(channels.data?.items ?? []).channels, sort),
    [channels.data, sort]
  );
  const openDialog = useChatDialogStore((state) => state.open);

  if (channels.isPending) return <SectionSkeleton icon={Hash} />;
  if (channels.isError) return <SectionError onRetry={() => void channels.refetch()} />;
  if (items.length === 0) {
    return (
      <SectionEmpty
        text="Bạn chưa tham gia kênh nào."
        actionLabel="Duyệt kênh"
        onAction={() => openDialog("browse-channels")}
      />
    );
  }
  return <ConversationList items={items} />;
};

export const DirectMessagesSection = () => {
  const channels = useChannels();
  const items = useMemo(
    () => sortChannels(splitSidebar(channels.data?.items ?? []).directs, "activity"),
    [channels.data]
  );
  const openDialog = useChatDialogStore((state) => state.open);
  // Presence for 1:1 DM partners shown in the sidebar.
  const partnerIds = useMemo(
    () =>
      items
        .slice(0, 50)
        .filter((channel) => channel.kind === "dm")
        .map((channel) => channel.participants[0]?.id)
        .filter((id): id is string => Boolean(id)),
    [items]
  );
  const online = usePresence(partnerIds);

  if (channels.isPending) return <SectionSkeleton icon={MessagesSquare} />;
  if (channels.isError) return <SectionError onRetry={() => void channels.refetch()} />;
  if (items.length === 0) {
    return (
      <SectionEmpty
        text="Chưa có cuộc trò chuyện nào."
        actionLabel="Nhắn tin cho đồng nghiệp"
        onAction={() => openDialog("new-message")}
      />
    );
  }
  return <ConversationList items={items} online={online} />;
};

const ConversationList = ({
  items,
  online
}: {
  items: ChatChannel[];
  online?: ReadonlySet<string>;
}) => {
  const [expanded, setExpanded] = useState(false);
  // Unread conversations are never hidden behind "show more".
  const visible = expanded
    ? items
    : items.filter(
        (channel, index) =>
          index < COLLAPSED_LIMIT || channel.unreadCount > 0 || channel.mentionCount > 0
      );
  const hidden = items.length - visible.length;
  return (
    <ul className="flex flex-col gap-px px-2">
      {visible.map((channel) => (
        <li key={channel.id}>
          <ConversationRow
            channel={channel}
            online={
              channel.kind === "dm" && online
                ? online.has(channel.participants[0]?.id ?? "")
                : undefined
            }
          />
        </li>
      ))}
      {hidden > 0 || expanded ? (
        <li>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex h-7 w-full items-center rounded-md px-2 text-xs text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded ? "Thu gọn" : `Hiện thêm ${hidden}`}
          </button>
        </li>
      ) : null}
    </ul>
  );
};

const ConversationRow = memo(function ConversationRow({
  channel,
  online
}: {
  channel: ChatChannel;
  online: boolean | undefined;
}) {
  const muted = isMuted(channel);
  const unread = hasUnread(channel);
  const direct = channel.kind === "dm" || channel.kind === "group_dm";
  const title = channelTitle(channel);
  const badge =
    channel.mentionCount > 0
      ? channel.mentionCount
      : direct && channel.unreadCount > 0 && !muted
        ? channel.unreadCount
        : 0;
  const label = [
    title,
    channel.kind === "private" ? "kênh riêng tư" : null,
    channel.archivedAt ? "đã lưu trữ" : null,
    muted ? "đã tắt thông báo" : null,
    channel.mentionCount > 0 ? `${channel.mentionCount} lượt nhắc tên` : null,
    channel.unreadCount > 0 ? `${channel.unreadCount} tin chưa đọc` : null
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <NavLink
      to={`/c/${channel.id}`}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          "group/row flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-foreground/80 outline-none transition-colors duration-150 pointer-coarse:h-10",
          "hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          unread && "font-semibold text-foreground",
          (muted || channel.archivedAt) && !isActive && "text-foreground-subtle",
          isActive &&
            "bg-brand-soft font-medium text-brand-text hover:bg-brand-soft hover:text-brand-text"
        )
      }
    >
      <span className="flex w-5 shrink-0 justify-center">
        <ChannelGlyph channel={channel} online={online} />
      </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {muted ? <BellOff className="size-3 shrink-0 opacity-60" aria-hidden="true" /> : null}
      {badge > 0 ? (
        <span
          aria-hidden="true"
          className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground tabular-nums"
        >
          {formatCount(badge)}
        </span>
      ) : unread ? (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-foreground/70" />
      ) : null}
    </NavLink>
  );
});

// Section actions ------------------------------------------------------------------------------------

const actionButtonClass =
  "flex size-6 items-center justify-center rounded-md text-foreground-muted outline-none pointer-coarse:size-8 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-surface-hover aria-expanded:text-foreground [&_svg]:size-3.5";

/** "+" menu next to the Channels heading: create, browse, sort. */
export const ChannelsSectionAction = () => {
  const { can } = usePermissions();
  const openDialog = useChatDialogStore((state) => state.open);
  const sort = useChatPrefs((state) => state.channelSort);
  const setSort = useChatPrefs((state) => state.setChannelSort);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={<DropdownMenuTrigger aria-label="Thêm kênh" className={actionButtonClass} />}
        >
          <Plus />
        </TooltipTrigger>
        <TooltipContent side="right">Thêm kênh</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          {can(P.ChannelCreate) ? (
            <DropdownMenuItem onClick={() => openDialog("create-channel")}>
              <Plus />
              Tạo kênh
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => openDialog("browse-channels")}>
            <Compass />
            Duyệt kênh
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1.5">
            <ArrowDownWideNarrow className="size-3.5" aria-hidden="true" />
            Sắp xếp kênh
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(value) => setSort(value as ChannelSort)}
          >
            <DropdownMenuRadioItem value="activity">Hoạt động gần đây</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="name">Theo tên (A–Z)</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** "+" next to the Direct messages heading: new 1:1 or group conversation. */
export const DirectMessagesSectionAction = () => {
  const openDialog = useChatDialogStore((state) => state.open);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="Tin nhắn mới"
            onClick={() => openDialog("new-message")}
            className={actionButtonClass}
          />
        }
      >
        <MessageSquarePlus />
      </TooltipTrigger>
      <TooltipContent side="right">Tin nhắn mới</TooltipContent>
    </Tooltip>
  );
};

// States ---------------------------------------------------------------------------------------------

const SectionSkeleton = ({ icon: Icon }: { icon: typeof Hash }) => (
  <div className="flex flex-col gap-0.5 px-2" aria-hidden="true">
    {[64, 48, 56].map((width) => (
      <div key={width} className="flex h-8 items-center gap-2 px-2">
        <Icon className="size-3.5 shrink-0 text-foreground-subtle/60" />
        <Skeleton className="h-2.5" style={{ width: `${width}%` }} />
      </div>
    ))}
  </div>
);

const SectionEmpty = ({
  text,
  actionLabel,
  onAction
}: {
  text: string;
  actionLabel: string;
  onAction: () => void;
}) => (
  <div className="flex flex-col items-start gap-1 px-4 pt-0.5 pb-1">
    <p className="text-xs text-foreground-subtle">{text}</p>
    <button
      type="button"
      onClick={onAction}
      className="rounded text-xs font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {actionLabel}
    </button>
  </div>
);

const SectionError = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex items-center gap-2 px-4 py-1 text-xs text-foreground-muted" role="alert">
    Không tải được danh sách.
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center gap-1 rounded font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      <RefreshCw className="size-3" aria-hidden="true" />
      Thử lại
    </button>
  </div>
);
