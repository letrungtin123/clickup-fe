import { cn } from "cn";
import { LockKeyhole } from "lucide-react";

import { UserAvatar } from "@/components/shared/user-avatar";
import type { LeavePart, LeaveStatus } from "@/contracts/production-leave";
import type { UserRef } from "@/contracts/work";

import {
  ADMIN_ONLY_DECISION,
  leavePartLabels,
  leavePartShort,
  leaveStatusLabels
} from "../calendar";

/** Replaces Duyệt / Từ chối on a queued request the viewer may not decide (PD-057). */
export const AdminOnlyDecisionNote = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-foreground-muted",
      className
    )}
  >
    <LockKeyhole className="size-3.5 shrink-0" aria-hidden="true" />
    {ADMIN_ONLY_DECISION}
  </span>
);

/** Status chip: approved = success, pending = warning (dashed), rejected = danger, cancelled = muted. */
export const LeaveStatusBadge = ({
  status,
  className
}: {
  status: LeaveStatus;
  className?: string;
}) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center rounded px-1.5 py-px text-[11px] font-medium whitespace-nowrap",
      status === "APPROVED" && "bg-success-soft text-success",
      status === "PENDING" && "bg-warning-soft text-foreground ring-1 ring-warning/50 ring-inset",
      status === "REJECTED" && "bg-danger-soft text-danger",
      status === "CANCELLED" && "bg-muted text-foreground-subtle line-through",
      className
    )}
  >
    {leaveStatusLabels[status]}
  </span>
);

/**
 * Avatar of a person on leave: pending requests get a dashed ring and lower emphasis, half days a
 * small S (sáng) / C (chiều) marker. The name, part and status are in the accessible label.
 */
export const LeaveAvatar = ({
  user,
  part,
  status,
  size = "sm"
}: {
  user: UserRef;
  part: LeavePart;
  status: LeaveStatus;
  size?: "xs" | "sm" | "md";
}) => {
  const pending = status === "PENDING";
  const marker = leavePartShort[part];
  return (
    <span
      className="relative inline-flex shrink-0"
      role="img"
      aria-label={`${user.displayName}: ${leavePartLabels[part].toLocaleLowerCase("vi")}${pending ? ", chờ duyệt" : ""}`}
      title={`${user.displayName} · ${leavePartLabels[part]}${pending ? " · chờ duyệt" : ""}`}
    >
      <span
        className={cn(
          "inline-flex rounded-full",
          pending
            ? "opacity-70 outline-2 outline-offset-1 outline-warning outline-dashed"
            : "ring-2 ring-surface"
        )}
      >
        <UserAvatar user={user} size={size} />
      </span>
      {marker ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full bg-foreground text-[8px] leading-none font-bold text-background ring-1 ring-surface"
        >
          {marker}
        </span>
      ) : null}
    </span>
  );
};
