import { cn } from "cn";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Leading visual (project icon, emoji-free glyph). */
  leading?: ReactNode;
  /** Above the title: breadcrumbs or eyebrow. */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Row under the title: tabs, view switcher, filters. */
  children?: ReactNode;
  className?: string;
};

/** Consistent page heading for routed content. The h1 lives here — one per page. */
export const PageHeader = ({
  title,
  description,
  leading,
  eyebrow,
  actions,
  children,
  className
}: PageHeaderProps) => (
  <header className={cn("flex flex-col gap-3 border-b px-4 pt-4 pb-3 md:px-6 md:pt-5", className)}>
    {eyebrow ? <div className="text-xs text-foreground-muted">{eyebrow}</div> : null}
    <div className="flex min-w-0 items-start gap-3">
      {leading ? <div className="mt-0.5 shrink-0">{leading}</div> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 className="truncate text-lg leading-7 font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="line-clamp-2 text-[13px] text-foreground-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
    {children}
  </header>
);
