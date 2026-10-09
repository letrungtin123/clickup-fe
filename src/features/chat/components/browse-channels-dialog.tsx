import { Compass, Hash, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ChatChannelInfo } from "@/contracts/chat";
import { P } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks";
import { useDebouncedValue } from "@/features/command/search-api";

import { chatApi } from "../api";
import { chatErrorMessage } from "../errors";
import { storeChannelDetail, useBrowseChannels } from "../hooks/use-channels";
import { useChatDialogStore } from "../model/ui-state";
import { useQueryClient } from "@tanstack/react-query";

export const BrowseChannelsDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[min(80vh,640px)] flex-col gap-0 p-0 sm:max-w-xl">
      <BrowseBody onDone={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

const BrowseBody = ({ onDone }: { onDone: () => void }) => {
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q.trim(), 200);
  const browse = useBrowseChannels(debounced);
  const navigate = useNavigate();
  const { can } = usePermissions();
  const openDialog = useChatDialogStore((state) => state.open);
  const items = browse.data?.pages.flatMap((page) => page.items) ?? [];

  const preview = (channel: ChatChannelInfo) => {
    onDone();
    void navigate(`/c/${channel.id}`);
  };

  return (
    <>
      <DialogHeader className="gap-1 border-b px-5 pt-4 pb-3">
        <DialogTitle className="flex items-center gap-2">
          <Compass className="size-4 text-foreground-muted" aria-hidden="true" />
          Duyệt kênh
        </DialogTitle>
        <DialogDescription>
          Các kênh công khai bạn chưa tham gia. Bấm vào kênh để xem trước tin nhắn.
        </DialogDescription>
        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground-subtle"
            aria-hidden="true"
          />
          <Input
            autoFocus
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Tìm kênh theo tên…"
            aria-label="Tìm kênh"
            className="pl-8"
          />
        </div>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-busy={browse.isFetching}>
        {browse.isPending ? (
          <div className="flex flex-col gap-1 p-1" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="flex items-center gap-3 rounded-lg px-3 py-3">
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : browse.isError ? (
          <ErrorState
            size="sm"
            error={browse.error}
            onRetry={() => void browse.refetch()}
            retrying={browse.isFetching}
          />
        ) : items.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Hash}
            title={debounced ? "Không có kênh phù hợp" : "Bạn đã tham gia mọi kênh công khai"}
            description={
              debounced
                ? "Thử từ khóa khác, hoặc tạo kênh mới cho chủ đề này."
                : "Khi có kênh công khai mới, chúng sẽ xuất hiện ở đây."
            }
            action={
              can(P.ChannelCreate) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onDone();
                    openDialog("create-channel");
                  }}
                >
                  <Plus />
                  Tạo kênh
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((channel) => (
              <BrowseRow
                key={channel.id}
                channel={channel}
                onPreview={() => preview(channel)}
                onJoined={onDone}
              />
            ))}
            {browse.hasNextPage ? (
              <li className="flex justify-center p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={browse.isFetchingNextPage}
                  onClick={() => void browse.fetchNextPage()}
                >
                  {browse.isFetchingNextPage ? <Spinner /> : null}
                  Tải thêm kênh
                </Button>
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </>
  );
};

const BrowseRow = ({
  channel,
  onPreview,
  onJoined
}: {
  channel: ChatChannelInfo;
  onPreview: () => void;
  onJoined: () => void;
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);

  const join = async () => {
    setJoining(true);
    try {
      const detail = await chatApi.join(channel.id);
      storeChannelDetail(queryClient, detail);
      toast.success(`Đã tham gia #${channel.name ?? ""}`);
      onJoined();
      void navigate(`/c/${channel.id}`);
    } catch (error) {
      toast.error(chatErrorMessage(error));
    } finally {
      setJoining(false);
    }
  };

  return (
    <li className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-surface-hover">
      <button
        type="button"
        onClick={onPreview}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-foreground-muted">
          <Hash className="size-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{channel.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground-muted">
            <Users className="size-3 shrink-0" aria-hidden="true" />
            <span className="shrink-0">{channel.memberCount} thành viên</span>
            {channel.description ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{channel.description}</span>
              </>
            ) : null}
          </span>
        </span>
      </button>
      <Button size="sm" variant="outline" disabled={joining} onClick={() => void join()}>
        {joining ? <Spinner /> : null}
        Tham gia
      </Button>
    </li>
  );
};
