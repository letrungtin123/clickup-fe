import { cn } from "cn";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The status workflow failed to load: move buttons cannot be labelled (or placed on a board), so
 * the screen says so and offers a retry instead of silently showing nothing (BUG-PR-18).
 */
export const WorkflowUnavailable = ({
  onRetry,
  retrying,
  children,
  className
}: {
  onRetry: () => void;
  retrying: boolean;
  children: React.ReactNode;
  className?: string | undefined;
}) => (
  <div
    role="alert"
    className={cn(
      "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2.5 text-[13px]",
      className
    )}
  >
    <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
    <p className="min-w-0 flex-1">{children}</p>
    <Button
      size="sm"
      variant="outline"
      className="bg-surface max-sm:min-h-10"
      onClick={onRetry}
      disabled={retrying}
    >
      <RefreshCw className={cn(retrying && "animate-spin")} />
      Thử lại
    </Button>
  </div>
);
