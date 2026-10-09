import { cn } from "cn";
import {
  RefreshCw,
  SearchX,
  ShieldOff,
  TriangleAlert,
  WifiOff,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage, isApiError } from "@/lib/api/errors";

type EmptyStateProps = {
  icon?: LucideIcon | undefined;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string | undefined;
  size?: "sm" | "md" | undefined;
};

/** Explains what the area is, why it is empty and the next useful action (product §59). */
export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = "md"
}: EmptyStateProps) => (
  <div
    className={cn(
      "mx-auto flex max-w-sm flex-col items-center text-center",
      size === "md" ? "gap-3 px-6 py-14" : "gap-2 px-4 py-8",
      className
    )}
  >
    {Icon ? (
      <span
        className={cn(
          "flex items-center justify-center rounded-xl border bg-surface text-foreground-muted shadow-xs",
          size === "md" ? "size-11 [&_svg]:size-5" : "size-9 [&_svg]:size-4"
        )}
      >
        <Icon strokeWidth={1.75} />
      </span>
    ) : null}
    <div className="flex flex-col gap-1">
      <h2
        className={cn("font-semibold text-foreground", size === "md" ? "text-[15px]" : "text-sm")}
      >
        {title}
      </h2>
      {description ? (
        <p className="text-[13px] leading-relaxed text-foreground-muted">{description}</p>
      ) : null}
    </div>
    {action ? (
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>
    ) : null}
  </div>
);

type ErrorStateProps = {
  error?: unknown;
  title?: string | undefined;
  onRetry?: (() => void) | undefined;
  retrying?: boolean | undefined;
  className?: string | undefined;
  size?: "sm" | "md" | undefined;
};

const errorVisual = (error: unknown): { icon: LucideIcon; title: string } => {
  if (isApiError(error)) {
    if (error.status === 0) return { icon: WifiOff, title: "Mất kết nối" };
    if (error.status === 403) return { icon: ShieldOff, title: "Không có quyền truy cập" };
    if (error.status === 404) return { icon: SearchX, title: "Không tìm thấy" };
  }
  return { icon: TriangleAlert, title: "Không tải được dữ liệu" };
};

/** Friendly error with optional retry; keeps surrounding context intact (product §60). */
export const ErrorState = ({
  error,
  title,
  onRetry,
  retrying = false,
  className,
  size = "md"
}: ErrorStateProps) => {
  const visual = errorVisual(error);
  const isPermanent = isApiError(error) && (error.status === 403 || error.status === 404);
  return (
    <div role="alert">
      <EmptyState
        icon={visual.icon}
        title={title ?? visual.title}
        description={getErrorMessage(error)}
        size={size}
        className={className}
        action={
          onRetry && !isPermanent ? (
            <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
              <RefreshCw className={cn(retrying && "animate-spin")} />
              Thử lại
            </Button>
          ) : undefined
        }
      />
    </div>
  );
};

/** Stack of skeleton rows for list-like content. */
export const SkeletonRows = ({ rows = 6, className }: { rows?: number; className?: string }) => (
  <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="flex items-center gap-3">
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-3.5" style={{ width: `${55 + ((index * 37) % 35)}%` }} />
      </div>
    ))}
  </div>
);
