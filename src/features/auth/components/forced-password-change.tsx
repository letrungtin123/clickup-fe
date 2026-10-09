import { KeyRound, LogOut } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { useLogout, useSessionContext } from "../hooks";
import { ChangePasswordForm } from "./change-password-form";

/** Blocking screen for admin-provisioned accounts still on a temporary password (PD-005). */
export const ForcedPasswordChange = () => {
  const session = useSessionContext();
  const navigate = useNavigate();
  const { logout, isPending } = useLogout();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl border bg-surface p-6 shadow-lg sm:p-8">
        <div className="flex flex-col gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">Đặt mật khẩu của bạn</h1>
            <p className="text-[13px] leading-relaxed text-foreground-muted">
              Chào {session.user.displayName}. Tài khoản đang dùng mật khẩu tạm thời do quản trị
              viên cấp. Hãy đặt mật khẩu riêng để tiếp tục.
            </p>
          </div>
        </div>
        <ChangePasswordForm
          currentLabel="Mật khẩu tạm thời"
          submitLabel="Lưu và tiếp tục"
          onChanged={({ reauthenticate }) => {
            if (reauthenticate) {
              toast.success("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
              logout();
              return;
            }
            toast.success("Đã đổi mật khẩu");
            void navigate("/", { replace: true });
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-foreground-muted"
          onClick={logout}
          disabled={isPending}
        >
          <LogOut />
          Đăng xuất
        </Button>
      </div>
    </main>
  );
};
