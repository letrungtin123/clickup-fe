import { cn } from "cn";
import { ChevronDown, UserX } from "lucide-react";
import { useState, type ReactNode } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";

import { periodLabel } from "../../scores/periods";
import type { MissingPerson } from "../missing";

/** How many names show before "+N người nữa". */
const PREVIEW = 12;

/**
 * PD-066 — KPI is mandatory: "Còn N người chưa có KPI kỳ này" with who (avatar, name, roles · team), the first
 * PREVIEW names then "+N người nữa". Used by Cấu hình → KPI (banner) and the settlement page (blocked state; also from
 * the 409 KPI_TARGETS_MISSING details, which carry names only). `action`: what to do about it (a link or a button).
 */
export const KpiMissingNotice = ({
  period,
  people,
  requiredCount,
  title,
  description,
  action,
  className
}: {
  period: string;
  people: readonly MissingPerson[];
  /** People who must have a KPI (null when unknown, e.g. from a 409). */
  requiredCount?: number | null | undefined;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const shown = open ? people : people.slice(0, PREVIEW);
  const hidden = people.length - shown.length;
  return (
    <section
      role="status"
      aria-label={`Người chưa có KPI ${periodLabel(period)}`}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-warning/35 bg-warning-soft/60 p-4 shadow-xs",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-64 items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-warning shadow-xs">
            <UserX className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-[15px] leading-snug font-semibold">
              {title ??
                `Còn ${people.length} người chưa có KPI ${periodLabel(period).toLocaleLowerCase("vi")}`}
            </p>
            <p className="text-xs leading-relaxed text-foreground-muted">
              {description ??
                `KPI là bắt buộc với mọi thành viên Photo Retouch (trừ Director và Siêu quản trị)${
                  requiredCount ? ` — ${people.length}/${requiredCount} người chưa có` : ""
                }. Chưa set đủ thì không chốt được KPI của kỳ.`}
            </p>
          </div>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Danh sách người chưa có KPI">
        {shown.map((person) => (
          <li
            key={person.id}
            title={person.detail ? `${person.displayName} · ${person.detail}` : person.displayName}
            className="flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-surface py-0.5 pr-2.5 pl-0.5 text-[13px] shadow-xs ring-1 ring-border/60"
          >
            <UserAvatar
              user={{
                id: person.id,
                displayName: person.displayName,
                avatarUrl: person.avatarUrl ?? null
              }}
              size="sm"
            />
            <span className="min-w-0 truncate">{person.displayName}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 || open ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-8 items-center gap-1 self-start rounded text-xs font-medium text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-10"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
          {open ? "Thu gọn" : `+${hidden} người nữa`}
        </button>
      ) : null}
    </section>
  );
};
