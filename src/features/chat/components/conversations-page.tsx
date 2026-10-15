import { cn } from "cn";
import { ArrowRight, Compass, MessageSquarePlus, MessagesSquare, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "@/components/shared/router-link";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChatChannel } from "@/contracts/chat";
import { departmentLabels, type Department } from "@/contracts/departments";
import { P } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks";
import { useDepartment } from "@/features/departments/hooks";
import { departmentIcons, departmentTones } from "@/features/departments/meta";
import { toneClass } from "@/lib/colors";
import { usePresence } from "@/lib/realtime/hooks";

import {
  useChatDepartmentScope,
  useDepartmentChannels,
  useOtherDepartmentUnread
} from "../hooks/use-department-channels";
import { channelTitle, formatCount, hasUnread, isMuted, sortChannels } from "../model/channels";
import { timeAgo } from "../model/time";
import { useChatDialogStore } from "../model/ui-state";
import { ChannelGlyph } from "./channel-glyph";

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/gi, "d")
    .toLocaleLowerCase("vi");

/**
 * `/c` — every conversation of the selected department in one list (PD-054; the first pane of the
 * mobile stack: list → channel → thread). On wide screens it doubles as a landing page with quick
 * actions.
 */
export const ConversationsPage = () => {
  const { query: channels, items: shown } = useDepartmentChannels();
  const { current } = useChatDepartmentScope();
  const { can } = usePermissions();
  const openDialog = useChatDialogStore((state) => state.open);
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const sorted = sortChannels(shown, "activity");
    const term = fold(q.trim());
    return term ? sorted.filter((channel) => fold(channelTitle(channel)).includes(term)) : sorted;
  }, [shown, q]);
  const partnerIds = useMemo(
    () =>
      items
        .slice(0, 60)
        .filter((channel) => channel.kind === "dm")
        .map((channel) => channel.participants[0]?.id)
        .filter((id): id is string => Boolean(id)),
    [items]
  );
  const online = usePresence(partnerIds);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Tin nhắn"
        description={
          current
            ? `Kênh, nhóm và tin nhắn trực tiếp của bạn ở phòng ban ${departmentLabels[current]}.`
            : "Kênh, nhóm và tin nhắn trực tiếp của bạn."
        }
        actions={
          <>
            {/* Phones show the icons only: the labels stay available to screen readers. */}
            <Button
              variant="outline"
              size="sm"
              aria-label="Duyệt kênh"
              onClick={() => openDialog("browse-channels")}
            >
              <Compass />
              <span className="hidden sm:inline">Duyệt kênh</span>
            </Button>
            {can(P.ChannelCreate) ? (
              <Button
                variant="outline"
                size="sm"
                aria-label="Tạo kênh"
                onClick={() => openDialog("create-channel")}
              >
                <Plus />
                <span className="hidden sm:inline">Tạo kênh</span>
              </Button>
            ) : null}
            <Button size="sm" aria-label="Tin nhắn mới" onClick={() => openDialog("new-message")}>
              <MessageSquarePlus />
              <span className="hidden sm:inline">Tin nhắn mới</span>
            </Button>
          </>
        }
      >
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground-subtle"
            aria-hidden="true"
          />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Lọc theo tên kênh hoặc người…"
            aria-label="Lọc cuộc trò chuyện"
            className="pl-8"
          />
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <OtherDepartmentsHint />
        {channels.isPending ? (
          <div className="flex flex-col gap-1 p-3" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : channels.isError ? (
          <ErrorState
            error={channels.error}
            onRetry={() => void channels.refetch()}
            retrying={channels.isFetching}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={q ? Search : MessagesSquare}
            title={q ? "Không có cuộc trò chuyện phù hợp" : "Chưa có cuộc trò chuyện nào"}
            description={
              q
                ? "Thử tên khác, hoặc tìm trong toàn bộ tin nhắn bằng Ctrl/⌘ + K."
                : "Tham gia một kênh công khai hoặc nhắn tin trực tiếp cho đồng nghiệp để bắt đầu."
            }
            action={
              q ? undefined : (
                <>
                  <Button variant="outline" size="sm" onClick={() => openDialog("browse-channels")}>
                    <Compass />
                    Duyệt kênh
                  </Button>
                  <Button size="sm" onClick={() => openDialog("new-message")}>
                    <MessageSquarePlus />
                    Tin nhắn mới
                  </Button>
                </>
              )
            }
          />
        ) : (
          <ul className="mx-auto flex w-full max-w-3xl flex-col p-2 md:p-4">
            {items.map((channel) => (
              <li key={channel.id}>
                <ConversationLink
                  channel={channel}
                  online={
                    channel.kind === "dm"
                      ? online.has(channel.participants[0]?.id ?? "")
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const ConversationLink = ({
  channel,
  online
}: {
  channel: ChatChannel;
  online: boolean | undefined;
}) => {
  const unread = hasUnread(channel);
  const badge = channel.mentionCount > 0 ? channel.mentionCount : unread ? channel.unreadCount : 0;
  return (
    <Link
      to={`/c/${channel.id}`}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface">
        <ChannelGlyph channel={channel} online={online} size="md" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-sm",
            unread ? "font-semibold text-foreground" : "font-medium",
            isMuted(channel) && "text-foreground-muted"
          )}
        >
          {channelTitle(channel)}
        </span>
        <span className="truncate text-xs text-foreground-muted">
          {channel.lastMessageAt
            ? `Hoạt động ${timeAgo(channel.lastMessageAt)}`
            : "Chưa có tin nhắn"}
          {channel.archivedAt ? " · Đã lưu trữ" : ""}
        </span>
      </span>
      {badge > 0 ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground tabular-nums">
          {formatCount(badge)}
        </span>
      ) : null}
    </Link>
  );
};

/**
 * "3 tin chưa đọc ở Production → Chuyển": unread waiting in the other departments (PD-054), one tap
 * away on the conversation list (phones reach the switcher from the top bar too).
 */
const OtherDepartmentsHint = () => {
  const { byDepartment } = useOtherDepartmentUnread();
  const { setDepartment } = useDepartment();
  const entries = (Object.entries(byDepartment) as [Department, number][]).filter(
    ([, count]) => count > 0
  );
  if (entries.length === 0) return null;
  return (
    <ul className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-2 pt-2 md:px-4 md:pt-4">
      {entries.map(([department, count]) => {
        const Icon = departmentIcons[department];
        return (
          <li key={department}>
            <button
              type="button"
              onClick={() => setDepartment(department)}
              className={cn(
                toneClass(departmentTones[department]),
                "flex w-full items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-left text-[13px] outline-none transition-colors duration-150 pointer-coarse:py-2.5 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-(--tone-soft) text-(--tone-text)"
              >
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold tabular-nums">{formatCount(count)}</span> tin chưa
                đọc ở <span className="font-medium">{departmentLabels[department]}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-text">
                Chuyển
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
