import { cn } from "cn";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { ActionSheet } from "@/components/shared/action-sheet";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChatMessage } from "@/contracts/chat";

import { useReactionPeople } from "../hooks/use-reaction-people";
import { describeReactors, reactionPeople } from "../model/reactions";

/** Desktop tooltip body for one reaction chip. */
export const ReactionTooltipBody = ({
  messageId,
  emoji,
  myId
}: {
  messageId: string;
  emoji: string;
  myId: string;
}) => {
  const query = useReactionPeople(messageId, true);
  const item = query.data?.items.find((entry) => entry.emoji === emoji);
  if (query.isPending) return <span className="text-foreground-muted">Đang tải…</span>;
  if (!item || item.users.length === 0) return <span>Chưa có ai thả {emoji}</span>;
  return (
    <span className="block max-w-64">
      <span className="font-semibold">{describeReactors(item.users, myId)}</span> đã thả {emoji}
    </span>
  );
};

/**
 * Touch: who reacted, per emoji (opened by a long press on a reaction chip, or from the message's
 * action sheet). Tabs: "Tất cả" plus one per emoji with its count.
 */
export const ReactionPeopleSheet = ({
  message,
  myId,
  open,
  initialEmoji,
  onOpenChange
}: {
  message: ChatMessage;
  myId: string;
  open: boolean;
  initialEmoji: string | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const query = useReactionPeople(message.id, open);
  const [picked, setPicked] = useState<{ emoji: string | null } | null>(null);
  // Each opening starts on the emoji it was opened for.
  const [openedFor, setOpenedFor] = useState({ open, initialEmoji });
  if (openedFor.open !== open || openedFor.initialEmoji !== initialEmoji) {
    setOpenedFor({ open, initialEmoji });
    setPicked(null);
  }
  const emoji = picked ? picked.emoji : initialEmoji;
  const items = query.data?.items ?? [];
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const people = useMemo(() => reactionPeople(query.data, emoji), [query.data, emoji]);

  const tab = (value: string | null, label: React.ReactNode, count: number) => {
    const selected = emoji === value;
    return (
      <button
        key={value ?? "all"}
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={() => setPicked({ emoji: value })}
        className={cn(
          "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          selected
            ? "border-brand/40 bg-brand-soft font-semibold text-brand-text"
            : "border-border bg-surface text-foreground-muted"
        )}
      >
        {label}
        <span>{count}</span>
      </button>
    );
  };

  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Biểu cảm"
      {...(total > 0 ? { description: `${total} lượt thả` } : {})}
    >
      <div
        role="tablist"
        aria-label="Lọc theo biểu cảm"
        className="flex gap-2 overflow-x-auto border-y px-3 py-2 [scrollbar-width:none]"
      >
        {tab(null, "Tất cả", total)}
        {items.map((item) =>
          tab(item.emoji, <span className="text-base leading-none">{item.emoji}</span>, item.count)
        )}
      </div>
      <div className="max-h-[min(420px,55dvh)] overflow-y-auto overscroll-contain p-2" role="tabpanel">
        {query.isPending ? (
          <div className="flex flex-col gap-1" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-sm text-foreground-muted" role="alert">
            Không tải được danh sách người thả biểu cảm.
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              <RefreshCw />
              Thử lại
            </Button>
          </div>
        ) : people.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-foreground-muted">Chưa có ai thả biểu cảm.</p>
        ) : (
          <ul className="flex flex-col">
            {people.map(({ user, emojis }) => (
              <li key={user.id} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5">
                <UserAvatar user={user} size="md" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {user.displayName}
                  {user.id === myId ? <span className="font-normal text-foreground-muted"> (bạn)</span> : null}
                </span>
                <span className="shrink-0 text-lg leading-none" aria-label={`Đã thả ${emojis.join(" ")}`}>
                  {emojis.join(" ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ActionSheet>
  );
};
