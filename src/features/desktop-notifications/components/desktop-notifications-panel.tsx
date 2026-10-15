import { cn } from "cn";
import {
  BellRing,
  BriefcaseBusiness,
  Eye,
  Info,
  Lock,
  MessageSquareText,
  MonitorSmartphone,
  Send,
  ShieldAlert
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { getDesktopSupport, useDesktopPermission, useDesktopPrefs } from "../hooks";
import { showDesktopNotification } from "../show";
import { writePrefs } from "../storage";
import { requestDesktopPermission, type DesktopPermission, type DesktopSupport } from "../support";

/**
 * Cài đặt › Hồ sơ › "Thông báo trên máy tính" (PD-055): browser permission status, enable / test buttons and the
 * per-device switches. Phones, plain http and old browsers get an explanation instead.
 */
export const DesktopNotificationsPanel = () => {
  const support = getDesktopSupport();
  if (support !== "supported") return <UnsupportedNote support={support} />;
  return <SupportedPanel />;
};

const unsupportedText: Record<Exclude<DesktopSupport, "supported">, { title: string; text: string }> = {
  mobile: {
    title: "Chỉ dùng được trên máy tính",
    text: "Trên điện thoại và máy tính bảng, trình duyệt không hiện thông báo hệ thống cho trang web. Bạn vẫn thấy tin mới qua chuông thông báo và số tin chưa đọc khi mở ứng dụng."
  },
  insecure: {
    title: "Cần mở trang qua HTTPS",
    text: "Trình duyệt chỉ cho phép thông báo trên máy tính khi trang được mở bằng địa chỉ https://. Hãy mở ứng dụng bằng đường dẫn https rồi bật lại tại đây."
  },
  unsupported: {
    title: "Trình duyệt chưa hỗ trợ",
    text: "Trình duyệt này không hỗ trợ thông báo trên máy tính. Hãy dùng Chrome, Edge hoặc Firefox bản mới."
  }
};

const UnsupportedNote = ({ support }: { support: Exclude<DesktopSupport, "supported"> }) => {
  const copy = unsupportedText[support];
  return (
    <div className="flex gap-3 rounded-lg bg-muted/60 px-3.5 py-3">
      <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-foreground-muted" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[13px] font-medium">{copy.title}</p>
        <p className="text-xs leading-relaxed text-foreground-muted">{copy.text}</p>
      </div>
    </div>
  );
};

const statusCopy: Record<DesktopPermission, { label: string; tone: "on" | "off" | "blocked" }> = {
  granted: { label: "Đã bật", tone: "on" },
  default: { label: "Chưa bật", tone: "off" },
  denied: { label: "Bị chặn", tone: "blocked" },
  unsupported: { label: "Không hỗ trợ", tone: "off" }
};

const SupportedPanel = () => {
  const permission = useDesktopPermission();
  const prefs = useDesktopPrefs();
  const [asking, setAsking] = useState(false);
  const status = statusCopy[permission];

  const enable = () => {
    setAsking(true);
    void requestDesktopPermission().then((result) => {
      setAsking(false);
      if (result === "granted") toast.success("Đã bật thông báo trên máy tính");
      else if (result === "denied") toast("Trình duyệt đang chặn thông báo — xem hướng dẫn bên dưới.");
    });
  };

  const sendTest = () => {
    const shown = showDesktopNotification({
      title: "Nesso Work · Thông báo thử",
      body: "Khi có tin nhắn mới, thông báo sẽ hiện như thế này.",
      tag: `desktop-notify:test:${Date.now()}`
    });
    if (shown) toast.success("Đã gửi thông báo thử", { description: "Xem ở góc màn hình." });
    else toast.error("Không hiện được thông báo thử — kiểm tra quyền thông báo của trình duyệt.");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            status.tone === "on" && "bg-success-soft text-success",
            status.tone === "off" && "bg-muted text-foreground-muted",
            status.tone === "blocked" && "bg-danger-soft text-danger"
          )}
        >
          {status.tone === "blocked" ? (
            <ShieldAlert className="size-4" aria-hidden="true" />
          ) : (
            <BellRing className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[13px] font-medium">
            Trên trình duyệt này
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold",
                status.tone === "on" && "bg-success-soft text-success",
                status.tone === "off" && "bg-muted text-foreground-muted",
                status.tone === "blocked" && "bg-danger-soft text-danger"
              )}
            >
              {status.label}
            </span>
          </span>
          <span className="text-xs leading-relaxed text-foreground-muted">
            {permission === "granted"
              ? "Tin nhắn mới hiện ở góc màn hình khi bạn ở tab khác, ứng dụng khác hoặc thu nhỏ trình duyệt."
              : permission === "denied"
                ? "Trình duyệt đã chặn thông báo của trang này."
                : "Bật để nhận thông báo của Windows / macOS cho tin nhắn và việc mới."}
          </span>
        </div>
        {permission === "granted" ? (
          <Button variant="outline" size="sm" onClick={sendTest} className="w-full sm:w-auto">
            <Send aria-hidden="true" />
            Gửi thử
          </Button>
        ) : permission === "default" ? (
          <Button size="sm" onClick={enable} disabled={asking} className="w-full sm:w-auto">
            <BellRing aria-hidden="true" />
            Bật thông báo
          </Button>
        ) : null}
      </div>

      {permission === "denied" ? (
        <div className="flex gap-3 rounded-lg border border-danger/20 bg-danger-soft/50 px-3.5 py-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-xs leading-relaxed">
            Bấm biểu tượng <strong>ổ khoá</strong> (hoặc biểu tượng cài đặt trang) bên trái thanh địa chỉ →{" "}
            <strong>Thông báo</strong> → <strong>Cho phép</strong>, rồi tải lại trang.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col divide-y border-t pt-1">
        <ToggleRow
          icon={<MessageSquareText className="size-4" aria-hidden="true" />}
          title="Tin nhắn"
          description="Tin nhắn riêng, nhóm và kênh theo mức thông báo của từng kênh (kênh đã tắt thông báo thì không hiện)."
          checked={prefs.chat}
          onChange={(chat) => writePrefs({ chat })}
        />
        <ToggleRow
          icon={<Eye className="size-4" aria-hidden="true" />}
          title="Hiện nội dung tin nhắn"
          description="Tắt đi thì thông báo chỉ ghi “Bạn có tin nhắn mới” — hợp khi người khác nhìn thấy màn hình."
          checked={prefs.chatPreview}
          disabled={!prefs.chat}
          onChange={(chatPreview) => writePrefs({ chatPreview })}
        />
        <ToggleRow
          icon={<BriefcaseBusiness className="size-4" aria-hidden="true" />}
          title="Thông báo công việc (giao việc, QC, nghỉ phép…)"
          description="Các thông báo trong Hộp thư, khi bạn không mở ứng dụng ở phía trước."
          checked={prefs.work}
          onChange={(work) => writePrefs({ work })}
        />
      </div>

      <div className="flex gap-2.5 text-xs leading-relaxed text-foreground-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <p>
          Thông báo chỉ đến khi trình duyệt đang mở (có thể thu nhỏ). Không thấy thông báo? Kiểm tra Windows: Cài đặt ›
          Hệ thống › Thông báo đã bật cho Chrome / Edge, và tắt chế độ Không làm phiền (Focus Assist).
        </p>
      </div>
    </div>
  );
};

const ToggleRow = ({
  icon,
  title,
  description,
  checked,
  disabled = false,
  onChange
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label
    className={cn(
      "flex min-h-12 cursor-pointer items-center gap-3 py-3 last:pb-0",
      disabled && "cursor-not-allowed opacity-60"
    )}
  >
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground-muted">
      {icon}
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[13px] font-medium">{title}</span>
      <span className="text-xs leading-relaxed text-foreground-muted">{description}</span>
    </span>
    <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
  </label>
);
