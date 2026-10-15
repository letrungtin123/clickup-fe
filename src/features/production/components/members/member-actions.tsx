import {
  BriefcaseBusiness,
  Building2,
  Ellipsis,
  KeyRound,
  Lock,
  UserCheck,
  UserX
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { ProductionMember } from "@/contracts/production-catalog";
import type { LedJob } from "@/contracts/users-admin";

import { toastProductionError } from "../../errors";
import { useResetProductionUserPassword, useSetProductionUserActive } from "../../hooks";
import type { AccountLock } from "../../org-admins";
import { ConfirmDialog } from "../settings-kit";
import type { TemporarySecret } from "./member-admin";

/** Account actions of one member row. */
export type MemberAction = "led-jobs" | "departments" | "reset" | "deactivate" | "activate";

/**
 * "⋯" menu of a member row: "Xem job đang dẫn" for everyone; "Đổi phòng ban" (PD-041), "Đặt lại mật
 * khẩu" and "Vô hiệu hóa" / "Kích hoạt lại" unless the row is protected (yourself, a superadmin, an
 * organization admin for a non-superadmin — org-admins.ts), in which case the menu says why.
 * `readOnly` (PD-050: everyone but the organization superadmin): only "Xem job đang dẫn".
 */
export const MemberActionsMenu = ({
  member,
  lock,
  readOnly = false,
  onAction
}: {
  member: ProductionMember;
  lock: AccountLock | null;
  readOnly?: boolean;
  onAction: (action: MemberAction) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Tùy chọn tài khoản của ${member.displayName}`}
          title="Tùy chọn tài khoản"
        />
      }
    >
      <Ellipsis />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-64">
      <DropdownMenuItem onClick={() => onAction("led-jobs")}>
        <BriefcaseBusiness />
        Xem job đang dẫn
      </DropdownMenuItem>
      {readOnly ? null : <DropdownMenuSeparator />}
      {readOnly ? null : lock ? (
        <p className="flex items-start gap-2 px-1.5 py-1.5 text-xs leading-relaxed text-foreground-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{lock.reason}</span>
        </p>
      ) : member.active ? (
        <>
          <DropdownMenuItem onClick={() => onAction("departments")}>
            <Building2 />
            Đổi phòng ban
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction("reset")}>
            <KeyRound />
            Đặt lại mật khẩu
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => onAction("deactivate")}>
            <UserX />
            Vô hiệu hóa tài khoản
          </DropdownMenuItem>
        </>
      ) : (
        <DropdownMenuItem onClick={() => onAction("activate")}>
          <UserCheck />
          Kích hoạt lại
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

export type AccountRequest = { kind: "deactivate" | "reset"; member: ProductionMember };

/**
 * In-page confirmation of the account actions that cut someone off: "Vô hiệu hóa" (sessions end,
 * sign-in blocked until re-enabled) and "Đặt lại mật khẩu" (sessions end, a one-time password).
 */
export const MemberAccountConfirm = ({
  request,
  onClose,
  onSecret,
  onDeactivated
}: {
  request: AccountRequest | null;
  onClose: () => void;
  onSecret: (secret: TemporarySecret) => void;
  onDeactivated: (member: ProductionMember, orphanedJobs: LedJob[]) => void;
}) => {
  const setActive = useSetProductionUserActive();
  const reset = useResetProductionUserPassword();
  // Keep the wording while the dialog animates out.
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);
  const pending = setActive.isPending || reset.isPending;
  const member = shown?.member;
  const name = member?.displayName ?? "";
  const deactivate = shown?.kind === "deactivate";

  const confirm = () => {
    if (!shown) return;
    const target = shown.member;
    if (shown.kind === "deactivate") {
      setActive.mutate(
        { userId: target.userId, active: false },
        {
          onSuccess: (result) => {
            onClose();
            toast.success(`Đã vô hiệu hóa tài khoản của ${target.displayName}`);
            onDeactivated(result.member, result.orphanedJobs);
          },
          onError: (error) => {
            onClose();
            toastProductionError(error);
          }
        }
      );
      return;
    }
    reset.mutate(target.userId, {
      onSuccess: (result) => {
        onClose();
        onSecret({
          kind: "reset",
          name: target.displayName,
          email: target.email,
          password: result.temporaryPassword,
          whitelisted: false
        });
      },
      onError: (error) => {
        onClose();
        toastProductionError(error);
      }
    });
  };

  return (
    <ConfirmDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={deactivate ? `Vô hiệu hóa tài khoản của ${name}?` : `Đặt lại mật khẩu cho ${name}?`}
      description={
        deactivate
          ? `${name} sẽ bị đăng xuất khỏi mọi thiết bị và không đăng nhập được cho tới khi được kích hoạt lại. Vai trò, điểm và lịch sử công việc vẫn được giữ nguyên${
              member?.roles.includes("LEADER")
                ? "; các job người này đang dẫn cần giao cho Leader khác"
                : ""
            }.`
          : `Mật khẩu hiện tại hết hiệu lực và ${name} bị đăng xuất khỏi mọi thiết bị. Bạn sẽ nhận một mật khẩu tạm thời (chỉ hiện một lần) để gửi cho họ; họ phải đổi mật khẩu khi đăng nhập.`
      }
      confirmLabel={deactivate ? "Vô hiệu hóa" : "Đặt lại mật khẩu"}
      destructive={deactivate}
      pending={pending}
      onConfirm={confirm}
    />
  );
};
