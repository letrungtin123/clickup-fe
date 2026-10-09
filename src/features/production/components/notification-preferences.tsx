import { BellRing, Mail } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

import { productionErrorMessage } from "../errors";
import { useNotificationPreferences, useUpdateNotificationPreferences } from "../hooks";

/**
 * Personal notification channels (GET/PATCH /me/notification-preferences, any user). Email
 * delivery (at most one digest per 5 minutes, PD-013) starts once the server has SMTP configured.
 */
export const NotificationPreferencesPanel = () => {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  if (preferences.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-hidden="true">
        {[0, 1].map((index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
        ))}
      </div>
    );
  }
  if (preferences.isError) {
    return (
      <ErrorState size="sm" error={preferences.error} onRetry={() => void preferences.refetch()} />
    );
  }

  const set = (input: { notifyWeb?: boolean; notifyEmail?: boolean }, message: string) =>
    update.mutate(input, {
      onSuccess: () => toast.success(message),
      onError: (error) =>
        toast.error(
          productionErrorMessage(error, { fallback: "Không lưu được cài đặt thông báo." })
        )
    });

  return (
    <div className="flex flex-col divide-y">
      <PreferenceRow
        icon={<BellRing className="size-4" aria-hidden="true" />}
        title="Thông báo trên web"
        description="Chuông thông báo và hộp thư trong ứng dụng."
        checked={preferences.data.notifyWeb}
        onChange={(notifyWeb) =>
          set({ notifyWeb }, notifyWeb ? "Đã bật thông báo trên web" : "Đã tắt thông báo trên web")
        }
      />
      <PreferenceRow
        icon={<Mail className="size-4" aria-hidden="true" />}
        title="Thông báo qua email"
        description={
          preferences.data.emailAvailable
            ? "Gửi tóm tắt tối đa mỗi 5 phút tới email của bạn."
            : "Gửi tóm tắt tối đa mỗi 5 phút tới email của bạn. Máy chủ chưa cấu hình gửi email (SMTP): lựa chọn được lưu và có hiệu lực khi email được bật."
        }
        checked={preferences.data.notifyEmail}
        onChange={(notifyEmail) =>
          set(
            { notifyEmail },
            notifyEmail ? "Đã bật thông báo qua email" : "Đã tắt thông báo qua email"
          )
        }
      />
    </div>
  );
};

const PreferenceRow = ({
  icon,
  title,
  description,
  checked,
  onChange
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="flex min-h-12 cursor-pointer items-center gap-3 py-3 first:pt-0 last:pb-0">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground-muted">
      {icon}
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[13px] font-medium">{title}</span>
      <span className="text-xs leading-relaxed text-foreground-muted">{description}</span>
    </span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
);
