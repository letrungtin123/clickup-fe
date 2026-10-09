import { Bell, CalendarClock, Hash, ListTodo } from "lucide-react";
import { useParams } from "react-router";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route placeholders. Each is replaced in place by its feature (keep the export names used in
 * app/router.tsx): My tasks → tasks views; Inbox → notifications UI; Channel → chat UI.
 */

export const MyTasksRoute = () => (
  <div className="flex h-full flex-col">
    <PageHeader title="Việc của tôi" description="Công việc được giao cho bạn ở mọi dự án." />
    <div className="flex-1 overflow-y-auto">
      <EmptyState
        icon={ListTodo}
        title="Danh sách việc của bạn sẽ hiển thị ở đây"
        description="Gom theo hạn: quá hạn, hôm nay, tuần này và sau đó — kèm bộ lọc theo dự án và trạng thái."
      />
    </div>
  </div>
);

export const InboxRoute = () => (
  <div className="flex h-full flex-col">
    <PageHeader title="Hộp thư" description="Nhắc tên, giao việc, bình luận và hạn chót." />
    <div className="flex-1 overflow-y-auto">
      <EmptyState
        icon={Bell}
        title="Hộp thư đang được hoàn thiện"
        description="Thông báo mới vẫn được ghi nhận; bạn sẽ xem và đánh dấu đã đọc tại đây."
      />
    </div>
  </div>
);

export const ChannelRoute = () => {
  const { channelId } = useParams();
  return (
    <div className="flex h-full flex-col" data-channel-id={channelId}>
      <PageHeader
        leading={
          <span className="flex size-7 items-center justify-center rounded-md bg-muted text-foreground-muted">
            <Hash className="size-4" aria-hidden="true" />
          </span>
        }
        title={<Skeleton className="h-5 w-40" />}
        description="Kênh trò chuyện"
      />
      <div
        className="flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-hidden p-4 md:px-6"
        aria-hidden="true"
      >
        {[60, 40, 72, 52].map((width, index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3" style={{ width: `${width}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t p-3 md:px-6">
        <div className="flex h-10 items-center rounded-lg border bg-surface px-3 text-[13px] text-foreground-subtle">
          <CalendarClock className="mr-2 size-4" aria-hidden="true" />
          Trò chuyện sẽ sớm khả dụng
        </div>
      </div>
    </div>
  );
};
