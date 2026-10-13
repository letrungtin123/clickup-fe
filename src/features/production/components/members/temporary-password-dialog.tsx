import { cn } from "cn";
import { Check, Copy, KeyRound, MailCheck, ShieldAlert } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

import { copyText, dialogAround } from "../../clipboard";
import { sheetOnPhone } from "../../ui";
import { InfoNote } from "../settings-kit";
import type { TemporarySecret } from "./member-admin";

/**
 * The one-time temporary password after "Thêm thành viên" or "Đặt lại mật khẩu". It lives only in
 * component state — never logged, cached or put in a toast — and the dialog closes only through
 * "Tôi đã lưu mật khẩu" (no outside click / Escape) so it is not lost by accident.
 */
export const TemporaryPasswordDialog = ({
  secret,
  onClose
}: {
  secret: TemporarySecret | null;
  onClose: () => void;
}) => {
  const ids = useId();
  const fieldRef = useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = useState(false);
  // Keep the last secret on screen while the dialog animates out (cleared when it is closed).
  const [shown, setShown] = useState(secret);
  if (secret && secret !== shown) {
    setShown(secret);
    setCopied(false);
  }
  const created = shown?.kind === "created";

  const copy = async () => {
    if (!shown) return;
    const ok = await copyText(shown.password, dialogAround(fieldRef.current));
    if (ok) {
      setCopied(true);
      toast.success("Đã sao chép mật khẩu tạm thời");
      return;
    }
    // Last resort: select the visible value so it can be copied by hand.
    fieldRef.current?.focus();
    fieldRef.current?.select();
    toast.error("Không sao chép tự động được. Mật khẩu đã được chọn — hãy sao chép thủ công.");
  };

  return (
    <Dialog
      open={secret !== null}
      // Only the footer button closes it.
      onOpenChange={() => undefined}
      // Drop the value from state once the dialog is gone.
      onOpenChangeComplete={(open) => {
        if (!open) setShown(null);
      }}
      disablePointerDismissal
    >
      <DialogContent showCloseButton={false} className={cn("sm:max-w-md", sheetOnPhone)}>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text"
            >
              <KeyRound className="size-[18px]" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="leading-snug">
                {created ? `Đã tạo tài khoản cho ${shown.name}` : `Mật khẩu mới của ${shown?.name}`}
              </DialogTitle>
              <DialogDescription className="text-[13px]">
                {created
                  ? "Gửi email đăng nhập và mật khẩu tạm thời dưới đây cho người dùng."
                  : `${shown?.name ?? ""} đã bị đăng xuất khỏi mọi thiết bị. Gửi mật khẩu tạm thời dưới đây cho họ.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {shown?.email ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground-muted">Email đăng nhập</span>
              <span className="truncate rounded-lg border bg-muted/50 px-3 py-2 text-[13px] select-all">
                {shown.email}
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${ids}-password`}
              className="text-xs font-medium text-foreground-muted"
            >
              Mật khẩu tạm thời
            </label>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 py-1.5 pr-1.5 pl-3">
              <input
                ref={fieldRef}
                id={`${ids}-password`}
                readOnly
                value={shown?.password ?? ""}
                autoComplete="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 bg-transparent font-mono text-[15px] font-semibold tracking-wider text-foreground outline-none"
              />
              <Button
                type="button"
                size="sm"
                variant={copied ? "outline" : "default"}
                onClick={() => void copy()}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Đã sao chép" : "Sao chép"}
              </Button>
            </div>
          </div>
          <InfoNote icon={ShieldAlert} tone="warning">
            Mật khẩu chỉ hiện một lần — hãy gửi cho người dùng qua kênh an toàn; họ phải đổi mật
            khẩu khi đăng nhập lần {created ? "đầu" : "tới"}.
          </InfoNote>
          {created && shown.whitelisted ? (
            <InfoNote icon={MailCheck}>
              Email đã có trong Whitelist email: người này cũng đăng nhập được bằng Google.
            </InfoNote>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            <Check />
            Tôi đã lưu mật khẩu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
