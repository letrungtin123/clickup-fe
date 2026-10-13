import { cn } from "cn";
import { useRef, useState, type MouseEvent } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { JobPeople } from "@/contracts/production-jobs";

import { formatInteger } from "../../format";
import { jobPeopleStack } from "../../jobs-model";
import { touchTargets } from "../../ui";

/** The row / card is a link to the job: clicks on the stack (and in its portaled popup) stay here. */
const keepInRow = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

/**
 * "Người làm" of a job list row: the workers' avatars (at most 4, then "+N"), optionally with
 * "N người làm". Hover, keyboard focus or a tap opens a small popover listing every worker with their
 * images ("Tên · 25 tấm", most first) and the QC people below. "—" before the job is split.
 */
export const JobPeopleStack = ({
  people,
  showCount = false,
  className
}: {
  people: JobPeople;
  /** "3 người làm" after the avatars (phone cards). */
  showCount?: boolean;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  // Opened by keyboard focus: leaving the trigger closes it (pointer opens close on outside press).
  const byFocus = useRef(false);
  const { shown, hidden } = jobPeopleStack(people.workers);
  if (people.workers.length === 0) {
    return <span className={cn("text-foreground-subtle", className)}>—</span>;
  }
  const names = people.workers.map((worker) => worker.user.displayName).join(", ");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        byFocus.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={100}
        aria-label={`Người làm: ${names}${people.qc.length > 0 ? ` · QC: ${people.qc.map((user) => user.displayName).join(", ")}` : ""}`}
        onClick={keepInRow}
        // Keyboard focus opens it too (a tap or a mouse click focuses without :focus-visible).
        onFocus={(event) => {
          if (!event.currentTarget.matches(":focus-visible")) return;
          byFocus.current = true;
          setOpen(true);
        }}
        onBlur={() => {
          if (byFocus.current) setOpen(false);
          byFocus.current = false;
        }}
        className={cn(
          "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full p-0.5 text-xs text-foreground-muted outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-muted",
          className
        )}
      >
        <span className="flex shrink-0 items-center -space-x-0.5">
          {shown.map((worker) => (
            <UserAvatar
              key={worker.user.id}
              user={worker.user}
              size="xs"
              className="ring-2 ring-surface"
            />
          ))}
          {hidden > 0 ? (
            <span className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground-muted ring-2 ring-surface">
              +{hidden}
            </span>
          ) : null}
        </span>
        {showCount ? (
          <span className="truncate pr-1 whitespace-nowrap">{people.workers.length} người làm</span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        initialFocus={false}
        finalFocus={false}
        onClick={keepInRow}
        className={cn("w-64 max-w-[calc(100vw-2rem)] gap-0 p-0", touchTargets)}
      >
        <PeopleList people={people} />
      </PopoverContent>
    </Popover>
  );
};

const PeopleList = ({ people }: { people: JobPeople }) => (
  <div className="flex max-h-80 flex-col overflow-y-auto overscroll-contain py-1.5">
    <p className="px-3 pt-0.5 pb-1 text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase">
      Người làm · {people.workers.length}
    </p>
    <ul className="flex flex-col">
      {people.workers.map((worker) => (
        <li key={worker.user.id} className="flex min-w-0 items-center gap-2 px-3 py-1 text-[13px]">
          <UserAvatar user={worker.user} size="xs" />
          <span className="min-w-0 flex-1 truncate">{worker.user.displayName}</span>
          <span className="shrink-0 text-foreground-muted tabular-nums">
            · {formatInteger(worker.qty)} tấm
          </span>
        </li>
      ))}
    </ul>
    {people.qc.length > 0 ? (
      <>
        <div aria-hidden="true" className="mx-3 my-1.5 h-px bg-border" />
        <p className="px-3 pb-1 text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase">
          QC · {people.qc.length}
        </p>
        <ul className="flex flex-col">
          {people.qc.map((user) => (
            <li key={user.id} className="flex min-w-0 items-center gap-2 px-3 py-1 text-[13px]">
              <UserAvatar user={user} size="xs" />
              <span className="min-w-0 flex-1 truncate">{user.displayName}</span>
            </li>
          ))}
        </ul>
      </>
    ) : null}
  </div>
);
