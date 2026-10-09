import { cn } from "cn";
import { AlarmClock, MessageSquareWarning, RotateCcw, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import type { ProductionStatusRef, TaskKind } from "@/contracts/production-jobs";
import type { UserRef } from "@/contracts/work";
import { toneClass } from "@/lib/colors";

/** Small presentational pieces shared by the job and task screens. */

export const StatusChip = ({
  status,
  className,
  size = "md"
}: {
  status: Pick<ProductionStatusRef, "name" | "color"> | null;
  className?: string;
  size?: "sm" | "md";
}) =>
  status ? (
    <span
      className={cn(
        toneClass(status.color),
        "inline-flex max-w-full items-center gap-1.5 rounded-full bg-(--tone-soft) font-medium whitespace-nowrap text-(--tone-text)",
        size === "md" ? "h-6 px-2.5 text-xs" : "h-5 px-2 text-[11px]",
        className
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--tone)" />
      <span className="truncate">{status.name}</span>
    </span>
  ) : (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border border-dashed px-2.5 text-xs whitespace-nowrap text-foreground-subtle",
        className
      )}
    >
      Chưa chia
    </span>
  );

const kindLabels: Record<Exclude<TaskKind, "NORMAL">, string> = {
  FB_WRONG: "FB sai",
  FB_EXTRA: "FB thêm"
};

/** Feedback task marker (PLAN §3: kind FB sai / FB thêm). */
export const KindBadge = ({ kind, className }: { kind: TaskKind; className?: string }) =>
  kind === "NORMAL" ? null : (
    <span
      title={
        kind === "FB_WRONG"
          ? "Làm lại theo feedback sai của khách"
          : "Làm thêm theo yêu cầu của khách"
      }
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold",
        kind === "FB_WRONG" ? "bg-danger-soft text-danger" : "bg-warning-soft text-foreground",
        className
      )}
    >
      {kind === "FB_WRONG" ? (
        <RotateCcw className="size-3" aria-hidden="true" />
      ) : (
        <Sparkles className="size-3" aria-hidden="true" />
      )}
      {kindLabels[kind]}
    </span>
  );

export const LateBadge = ({ className, label = "Trễ" }: { className?: string; label?: string }) => (
  <span
    className={cn(
      "inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-danger-soft px-1.5 text-[11px] font-semibold text-danger",
      className
    )}
  >
    <AlarmClock className="size-3" aria-hidden="true" />
    {label}
  </span>
);

export const FeedbackBadge = ({ count, className }: { count: number; className?: string }) =>
  count > 0 ? (
    <span
      title={`${count} feedback đang mở`}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-warning-soft px-1.5 text-[11px] font-semibold text-foreground",
        className
      )}
    >
      <MessageSquareWarning className="size-3 text-warning" aria-hidden="true" />
      {count}
    </span>
  ) : null;

export const Person = ({
  user,
  className,
  size = "sm",
  fallback = "—"
}: {
  user: Pick<UserRef, "id" | "displayName" | "avatarUrl"> | null;
  className?: string;
  size?: "xs" | "sm";
  fallback?: string;
}) =>
  user ? (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <UserAvatar user={user} size={size} />
      <span className="truncate">{user.displayName}</span>
    </span>
  ) : (
    <span className={cn("text-foreground-subtle", className)}>{fallback}</span>
  );

/** Thin progress bar (value 0–100). */
export const MiniBar = ({
  value,
  tone = "brand",
  className
}: {
  value: number;
  tone?: "brand" | "success" | "muted" | "warning";
  className?: string;
}) => (
  <span
    aria-hidden="true"
    className={cn("block h-1 w-full overflow-hidden rounded-full bg-muted", className)}
  >
    <span
      className={cn(
        "block h-full rounded-full transition-[width] duration-300",
        tone === "brand" && "bg-brand",
        tone === "success" && "bg-success",
        tone === "muted" && "bg-foreground-subtle",
        tone === "warning" && "bg-warning"
      )}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </span>
);

/** Label/value pair used in detail headers. */
export const Fact = ({
  label,
  children,
  className
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
    <dt className="text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase">
      {label}
    </dt>
    <dd className="min-w-0 text-[13px]">{children}</dd>
  </div>
);
