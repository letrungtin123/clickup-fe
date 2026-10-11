import { cn } from "cn";
import type { ReactNode } from "react";

/** A card of "Cài đặt kho" (same shape as the project settings), labelled by its heading. */
export const SettingsSection = ({
  id,
  title,
  description,
  actions,
  children,
  tone = "default"
}: {
  /** Base id: the heading is `${id}-title`. */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tone?: "default" | "danger";
}) => (
  <section
    aria-labelledby={`${id}-title`}
    className={cn(
      "min-w-0 rounded-xl border bg-surface shadow-xs",
      tone === "danger" && "border-danger/30"
    )}
  >
    <div className="flex flex-wrap items-start gap-3 border-b px-4 py-4 sm:px-5">
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
        <h2
          id={`${id}-title`}
          className={cn(
            "flex items-center gap-2 text-sm font-semibold",
            tone === "danger" && "text-danger"
          )}
        >
          {title}
        </h2>
        {description ? (
          <div className="text-[13px] leading-relaxed text-foreground-muted">{description}</div>
        ) : null}
      </div>
      {actions}
    </div>
    <div className="px-4 py-5 sm:px-5">{children}</div>
  </section>
);
