import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * "Chi tiết thêm" of a line form ("Chia task", "Nhập công việc"): the optional details behind one toggle, with a single
 * "Tùy chọn" caption instead of a "(tùy chọn)" suffix on every label. Collapsed by default while nothing is filled;
 * open when something is (`hasValue`) and always while one of them is invalid (`forceOpen`). Collapsed, the toggle
 * says what is filled (`summary`, e.g. "QC: Tên · Link · Ghi chú") or what can be added (`placeholder`). The user's
 * own toggle wins over `hasValue`.
 */
export const OptionalDetails = ({
  id,
  summary,
  placeholder,
  hasValue,
  forceOpen = false,
  children,
  className
}: {
  /** id of the panel (aria-controls). */
  id: string;
  summary: string;
  placeholder: string;
  hasValue: boolean;
  forceOpen?: boolean;
  children: ReactNode;
  className?: string;
}) => {
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = forceOpen || (open ?? hasValue);
  return (
    <div className={cn("border-t pt-3", className)}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setOpen(!expanded)}
        className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-10"
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-foreground-muted transition-transform",
            expanded && "rotate-90"
          )}
          aria-hidden="true"
        />
        <span className="shrink-0 text-[13px] font-medium">Chi tiết thêm</span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[11px] text-foreground-muted">
          Tùy chọn
        </span>
        {expanded ? null : (
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs",
              summary ? "text-foreground-muted" : "text-foreground-subtle"
            )}
            title={summary || undefined}
          >
            {summary || placeholder}
          </span>
        )}
      </button>
      {expanded ? (
        <div id={id} className="mt-3">
          {children}
        </div>
      ) : null}
    </div>
  );
};
