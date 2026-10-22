import { cn } from "cn";
import {
  AlarmClock,
  CheckCheck,
  CircleCheck,
  CircleDashed,
  Clock3,
  History,
  Hourglass,
  ListChecks,
  MessageSquareWarning,
  PackageCheck,
  RotateCcw,
  ScanEye,
  TimerOff,
  TriangleAlert,
  Truck,
  UserRound,
  UserX,
  type LucideIcon
} from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { UserAvatar, type AvatarUser } from "@/components/shared/user-avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OverviewJob } from "@/contracts/production-overview";
import { colorForId, toneClass } from "@/lib/colors";

import { formatInteger } from "../../format";
import {
  agoLabel,
  barRatio,
  dateTimeLabel,
  jobMetaLine,
  percentOf,
  type Bar,
  type BarFocus,
  type DeadlineState,
  type FlagTone,
  type JobFlag
} from "../model";

/**
 * PD-082 — the small pieces of "Tổng quan" shared by the desktop table and the phone cards, so both read the same: one
 * chip style (size, radius, icon, colour scale), one status pill, one progress bar, one deadline wording, one "—".
 */

/** The one empty mark of the page. */
export const EmptyMark = ({ label, className }: { label: string; className?: string }) => (
  <span className={cn("text-[13px] text-foreground-subtle", className)}>
    <span aria-hidden="true">—</span>
    <span className="sr-only">{label}</span>
  </span>
);

const flagTones: Record<FlagTone, string> = {
  risk: "tone tone-orange",
  danger: "tone tone-red",
  warning: "tone tone-amber",
  info: "tone tone-sky",
  feedback: "tone tone-pink",
  muted: "tone tone-slate",
  success: "tone tone-green"
};

/** An icon per flag, so the colour is never the only signal. */
const flagIcons: Record<string, LucideIcon> = {
  risk: TriangleAlert,
  late: AlarmClock,
  clientLate: AlarmClock,
  rework: RotateCcw,
  qcLeave: UserX,
  staffLeave: UserX,
  stale: TimerOff,
  qc: ScanEye,
  noTasks: CircleDashed,
  unassigned: CircleDashed,
  feedback: MessageSquareWarning,
  ready: CheckCheck,
  complete: PackageCheck,
  matched: ListChecks
};

const chipClass =
  "inline-flex h-6 max-w-full min-w-0 shrink-0 items-center gap-1 rounded-md bg-(--tone-soft) px-1.5 text-xs leading-none font-medium whitespace-nowrap text-(--tone-text) [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-(--tone)";

export const FlagChip = ({ flag, className }: { flag: JobFlag; className?: string | undefined }) => {
  const Icon = flagIcons[flag.key];
  const chip = (
    <span className={cn(flagTones[flag.tone], chipClass, flag.tone === "danger" && "font-semibold")}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {flag.detail ? (
        <>
          <span aria-hidden="true" className="min-w-0 truncate">
            {flag.label}
          </span>
          <span className="sr-only">{flag.detail}</span>
        </>
      ) : (
        <span className="min-w-0 truncate">{flag.label}</span>
      )}
    </span>
  );
  return flag.detail ? (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("inline-flex max-w-full min-w-0", className)} />}>{chip}</TooltipTrigger>
      <TooltipContent>{flag.detail}</TooltipContent>
    </Tooltip>
  ) : (
    <span className={cn("inline-flex max-w-full min-w-0", className)} title={flag.label}>
      {chip}
    </span>
  );
};

/**
 * Flags that wrap onto at most `lines` lines (the table) — what does not fit becomes "+N" (names in its tooltip and for
 * screen readers). Without `lines` every flag wraps (phone cards). The fit is measured after layout and again on resize.
 */
export const FlagList = ({
  flags,
  lines,
  className,
  empty
}: {
  flags: readonly JobFlag[];
  lines?: number;
  className?: string;
  empty?: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const signature = flags.map((flag) => `${flag.key}:${flag.label}`).join("|");
  const [fit, setFit] = useState({ signature, shown: flags.length, width: 0 });
  // New flags: start again from all of them (adjusting state during render, not in an effect).
  if (fit.signature !== signature) setFit({ signature, shown: flags.length, width: fit.width });
  const shown = Math.min(fit.shown, flags.length);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !lines) return;
    const children = [...element.children] as HTMLElement[];
    const first = children[0];
    if (!first || shown <= 1) return;
    const top = first.getBoundingClientRect().top;
    const height = first.getBoundingClientRect().height;
    const last = children[children.length - 1]!.getBoundingClientRect();
    // Rows of chips are `height` tall with a 4 px gap: anything starting below the last allowed row overflows.
    if (height > 0 && last.top - top > (lines - 1) * (height + 4) + 2) setFit((current) => ({ ...current, shown: shown - 1 }));
    // Measured again whenever the flags, the count shown or the width change (each step shows one flag fewer).
  }, [lines, shown, signature, fit.width]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !lines || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry?.contentRect.width ?? 0);
      setFit((current) => (current.width === width ? current : { ...current, width, shown: flags.length }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [lines, flags.length]);

  if (flags.length === 0) return <>{empty ?? null}</>;
  const hidden = flags.slice(shown);
  return (
    <div ref={ref} className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {flags.slice(0, shown).map((flag, index) => (
        // The last chip before "+N" gives way (truncates) so the "+N" stays on its line.
        <FlagChip key={flag.key} flag={flag} className={hidden.length > 0 && index === shown - 1 ? "max-w-[calc(100%-2.5rem)]" : undefined} />
      ))}
      {hidden.length > 0 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-muted px-1.5 text-xs font-semibold text-foreground-muted tabular-nums ring-1 ring-border ring-inset" />
            }
          >
            <span aria-hidden="true">+{hidden.length}</span>
            <span className="sr-only">Thêm: </span>
            {hidden.map((flag) => (
              <span key={flag.key} className="sr-only">
                {flag.label}
                {flag.detail ? ` (${flag.detail})` : ""}
              </span>
            ))}
          </TooltipTrigger>
          <TooltipContent className="flex-col items-start gap-0.5">
            {hidden.map((flag) => (
              <span key={flag.key}>{flag.detail ?? flag.label}</span>
            ))}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
};

/** The job / task status: a pill in the status colour (a dot too: never the colour alone). */
export const StatusPill = ({ name, color, className }: { name: string; color: string; className?: string }) => (
  <span
    title={name}
    className={cn(
      toneClass(color),
      "inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full bg-(--tone-soft) px-2.5 text-xs leading-none font-medium whitespace-nowrap text-(--tone-text) ring-1 ring-(--tone)/20 ring-inset",
      className
    )}
  >
    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--tone)" />
    <span className="min-w-0 truncate">{name}</span>
  </span>
);

/** Done green · Đang làm amber · Chưa chia hatched; parts outside the filter are dimmed. Same height everywhere. */
export const ProgressBar = ({ bar, focus, className }: { bar: Bar; focus: BarFocus; className?: string }) => {
  const parts = [
    { key: "done" as const, label: "Xong", value: bar.done, className: "bg-success" },
    { key: "inProgress" as const, label: "Đang làm", value: bar.inProgress, className: "bg-warning" },
    {
      key: "unassigned" as const,
      label: "Chưa chia",
      value: bar.unassigned,
      className: "bg-[repeating-linear-gradient(135deg,var(--color-border-strong)_0_3px,transparent_3px_6px)]"
    }
  ].filter((part) => part.value > 0);
  return (
    <span
      role="img"
      aria-label={`Xong ${bar.done}, đang làm ${bar.inProgress}, chưa chia ${bar.unassigned} / ${bar.total} tấm`}
      className={cn("flex h-2 w-full min-w-0 gap-0.5 overflow-hidden rounded-full bg-muted", className)}
    >
      {bar.total > 0
        ? parts.map((part) => (
            <span
              key={part.key}
              title={`${part.label}: ${formatInteger(part.value)} tấm`}
              className={cn("h-full transition-opacity first:rounded-l-full last:rounded-r-full", part.className, focus && focus !== part.key && "opacity-25")}
              style={{ width: `${(part.value / bar.total) * 100}%` }}
            />
          ))
        : null}
    </span>
  );
};

/** "20 / 39" (done — or the focused part — over the total) and the share under it; "—" without any image. */
export const BarRatio = ({ bar, focus, className }: { bar: Bar; focus: BarFocus; className?: string }) => {
  if (bar.total <= 0) {
    return (
      <span className={cn("flex flex-col items-end leading-tight", className)}>
        <EmptyMark label="Chưa có số tấm" />
        <span aria-hidden="true" className="text-[11px]">
          &nbsp;
        </span>
      </span>
    );
  }
  const [part, total] = barRatio(bar, focus).split(" / ");
  return (
    <span className={cn("flex flex-col items-end leading-tight tabular-nums", className)}>
      <span className="text-[12.5px] whitespace-nowrap">
        <span className="font-semibold text-foreground">{part}</span>
        <span className="text-foreground-subtle"> / {total}</span>
      </span>
      <span className="text-[11px] text-foreground-muted">{percentOf(focus ? bar[focus] : bar.done, bar.total)}%</span>
    </span>
  );
};

const deadlineTones = {
  danger: "font-semibold text-danger",
  warning: "font-medium text-warning",
  muted: "text-foreground-muted",
  done: "text-foreground-muted"
} as const;

const deadlineIcons: Record<DeadlineState["kind"], LucideIcon> = {
  late: AlarmClock,
  soon: Hourglass,
  later: Clock3,
  delivered: CircleCheck,
  delivering: Truck,
  done: CircleCheck,
  qc: ScanEye
};

/** The relative line of a deadline: an icon, then "Trễ 5 ngày 13h" / "Còn 8h 9m" / "Đã giao". */
export const DeadlineLabel = ({ state, className }: { state: DeadlineState; className?: string }) => {
  const Icon = deadlineIcons[state.kind];
  return (
    <span title={state.title} className={cn("inline-flex max-w-full min-w-0 items-center gap-1 text-xs tabular-nums", deadlineTones[state.tone], className)}>
      <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", state.kind === "delivered" || state.kind === "done" ? "text-success" : "")} />
      <span className="min-w-0 truncate">{state.label}</span>
    </span>
  );
};

/** Who works on a job: up to `max` avatars, then "+N"; every name in the tooltip (and for screen readers). */
export const PeopleStack = ({ people, max = 3, empty = "Chưa có nhân viên" }: { people: readonly AvatarUser[]; max?: number; empty?: string }) => {
  if (people.length === 0) return <EmptyMark label={empty} />;
  const shown = people.slice(0, max);
  const hidden = people.length - shown.length;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex min-w-0 items-center -space-x-1" />}>
        {shown.map((user) => (
          <UserAvatar key={user.id} user={user} size="sm" className="ring-2 ring-surface" />
        ))}
        {hidden > 0 ? (
          <span className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground-muted tabular-nums ring-2 ring-surface">
            <span aria-hidden="true">+{hidden}</span>
            <span className="sr-only">
              và {people.slice(max).map((user) => user.displayName).join(", ")}
            </span>
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent>{people.map((user) => user.displayName).join(", ")}</TooltipContent>
    </Tooltip>
  );
};

/** A project's code in the project's own colour (the job list's project chip, a size up). */
export const ProjectCode = ({ project, className }: { project: { id: string; code: string; name: string }; className?: string }) => (
  <span
    title={project.name}
    className={cn(
      toneClass(colorForId(project.id)),
      "inline-flex h-6 max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-md bg-(--tone-soft) px-2 text-xs font-bold tracking-wide text-(--tone-text) ring-1 ring-(--tone)/25 ring-inset",
      className
    )}
  >
    <span aria-hidden="true" className="size-2 shrink-0 rounded-[3px] bg-(--tone)" />
    <span className="min-w-0 truncate">{project.code}</span>
  </span>
);

const Dot = () => (
  <span aria-hidden="true" className="shrink-0 text-foreground-subtle">
    ·
  </span>
);

/**
 * The second line of a job: Leader · nhận dd/MM · cập nhật … on one line. The Leader's name gives way first; in a narrow
 * column (container query) "nhận dd/MM" steps out, then the "trước" of the last update — the whole line and the last
 * action's time stay in the tooltip.
 */
export const JobMeta = ({
  job,
  now,
  timeZone,
  className
}: {
  job: Pick<OverviewJob, "leader" | "receivedAt" | "lastActivityAt">;
  now: Date;
  timeZone: string;
  className?: string;
}) => {
  const ago = agoLabel(job.lastActivityAt, now);
  const [agoHead, agoTail] = ago.endsWith(" trước") ? [ago.slice(0, -" trước".length), " trước"] : [ago, ""];
  return (
    <span
      title={`${jobMetaLine(job, now, timeZone)} (thao tác cuối ${dateTimeLabel(job.lastActivityAt, timeZone)})`}
      className={cn("@container/meta block w-full min-w-0", className)}
    >
      <span className="flex min-w-0 items-center gap-1 text-xs text-foreground-muted">
        <UserRound aria-hidden="true" className="size-3 shrink-0 text-foreground-subtle" />
        <span className="min-w-0 truncate">
          {job.leader ? (
            <>
              <span className="sr-only">Leader </span>
              {job.leader.displayName}
            </>
          ) : (
            "Chưa có Leader"
          )}
        </span>
        <span className="hidden shrink-0 items-center gap-1 @[16rem]/meta:inline-flex">
          <Dot />
          <span className="tabular-nums">nhận {dateTimeLabel(job.receivedAt, timeZone).slice(0, 5)}</span>
        </span>
        <Dot />
        <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap">
          <History aria-hidden="true" className="size-3 text-foreground-subtle" />
          <span className="sr-only">cập nhật </span>
          {agoHead}
          {agoTail ? <span className="hidden @[11rem]/meta:inline">{agoTail}</span> : null}
        </span>
      </span>
    </span>
  );
};
