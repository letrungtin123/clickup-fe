import { Bell } from "lucide-react";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";

import { useNotificationFeed, useOpenNotification } from "../hooks";
import { NotificationItem } from "./notification-item";

const LIMIT = 5;

/** Home "Hộp thư" widget body: the latest notifications (live, shares the inbox cache). */
export const InboxWidgetContent = () => {
  const feed = useNotificationFeed("all");
  const open = useOpenNotification();
  const items = feed.data?.pages[0]?.items.slice(0, LIMIT) ?? [];

  if (feed.isPending) {
    return (
      <div className="flex w-full flex-col gap-1 self-stretch p-2" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex gap-3 px-3 py-2">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-3" style={{ width: `${55 + index * 12}%` }} />
              <Skeleton className="h-2.5 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (feed.isError) {
    return <ErrorState size="sm" error={feed.error} onRetry={() => void feed.refetch()} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={Bell}
        title="Bạn đã xem hết thông báo"
        description="Nhắc tên, giao việc và bình luận mới sẽ được gom tại Hộp thư."
      />
    );
  }
  return (
    <ul className="flex w-full flex-col gap-0.5 self-stretch p-2">
      {items.map((notification) => (
        <li key={notification.id}>
          <NotificationItem notification={notification} onOpen={open} compact />
        </li>
      ))}
    </ul>
  );
};
