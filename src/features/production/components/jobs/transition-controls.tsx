import { cn } from "cn";
import { ArrowRight, ChevronDown, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { ProductionStatus } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";
import { toneClass } from "@/lib/colors";

import { splitTransitions } from "../../jobs-model";
import { useStatusLookup } from "./use-task-mover";

/** Normal moves as buttons; ADMIN overrides tucked in a menu (reason required). */
export const TransitionButtons = ({
  task,
  onMove,
  busy,
  size = "sm",
  className,
  max
}: {
  task: ProductionTask;
  onMove: (option: TaskTransitionOption) => void;
  busy?: boolean;
  size?: "sm" | "xs";
  className?: string;
  /** Cap of visible buttons; the rest go to the menu. */
  max?: number;
}) => {
  const lookup = useStatusLookup();
  const { normal, overrides } = splitTransitions(task.capabilities.transitions);
  const shown = max === undefined ? normal : normal.slice(0, max);
  const extra = max === undefined ? [] : normal.slice(max);
  if (normal.length === 0 && overrides.length === 0) return null;
  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      onClick={(event) => event.stopPropagation()}
    >
      {shown.map((option) => {
        const target = lookup.byId.get(option.toStatusId);
        return (
          <Button
            key={option.toStatusId}
            variant="outline"
            size={size}
            disabled={busy}
            onClick={() => onMove(option)}
            className={cn(toneClass(target?.color ?? "gray"), "gap-1.5")}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-(--tone)" />
            {target?.name ?? "…"}
          </Button>
        );
      })}
      {extra.length > 0 || overrides.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            render={
              <Button variant="ghost" size={size} aria-label={`Chuyển khác cho #${task.code}`} />
            }
          >
            <ArrowRight />
            {shown.length === 0 ? "Chuyển" : "Khác"}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {extra.map((option) => (
              <DropdownMenuItem key={option.toStatusId} onClick={() => onMove(option)}>
                <StatusDot status={lookup.byId.get(option.toStatusId)} />
                {lookup.byId.get(option.toStatusId)?.name ?? "…"}
              </DropdownMenuItem>
            ))}
            {overrides.length > 0 ? (
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-foreground-muted">
                  <ShieldAlert className="size-3.5 text-warning" aria-hidden="true" />
                  Ngoài luồng (Quản trị, cần lý do)
                </DropdownMenuLabel>
                {overrides.map((option) => (
                  <DropdownMenuItem key={option.toStatusId} onClick={() => onMove(option)}>
                    <StatusDot status={lookup.byId.get(option.toStatusId)} />
                    {lookup.byId.get(option.toStatusId)?.name ?? "…"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
};

/**
 * PD-044: the task's status as a coloured chip that is also its move menu ("chuyển trạng thái dạng dropdown"). With
 * moves, the chip shows a chevron and opens the list (normal moves first, ADMIN overrides below their label); without
 * moves it is a plain chip. A subtask's status follows its line: plain chip, the tooltip says so.
 */
export const StatusSelect = ({
  task,
  onMove,
  busy,
  size = "md",
  className,
  align = "start"
}: {
  task: ProductionTask;
  onMove: (option: TaskTransitionOption) => void;
  busy?: boolean;
  size?: "sm" | "md";
  className?: string;
  align?: "start" | "end";
}) => {
  const lookup = useStatusLookup();
  const { normal, overrides } = splitTransitions(task.capabilities.transitions);
  const color = lookup.byId.get(task.status.id)?.color ?? task.status.color;
  const chip = cn(
    toneClass(color),
    "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-(--tone-soft) font-medium whitespace-nowrap text-(--tone-text)",
    size === "md" ? "h-7 px-2.5 text-xs" : "h-6 px-2 text-[11px]",
    className
  );
  const dot = <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--tone)" />;
  if (normal.length === 0 && overrides.length === 0) {
    return (
      <span className={chip} title={task.isSubtask ? "Trạng thái theo task gốc" : task.status.name}>
        {dot}
        <span className="min-w-0 truncate">{task.status.name}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          aria-label={`Trạng thái #${task.code}: ${task.status.name} — đổi trạng thái`}
          className={cn(
            chip,
            "cursor-pointer outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 dark:hover:brightness-110"
          )}
        >
          {dot}
          <span className="min-w-0 truncate">{task.status.name}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-60">
          {normal.length > 0 ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-foreground-muted">
                Chuyển sang
              </DropdownMenuLabel>
              {normal.map((option) => (
                <DropdownMenuItem key={option.toStatusId} onClick={() => onMove(option)}>
                  <StatusDot status={lookup.byId.get(option.toStatusId)} />
                  <span className="min-w-0 flex-1 truncate">
                    {lookup.byId.get(option.toStatusId)?.name ?? "…"}
                  </span>
                  {option.requiresNote ? (
                    <span className="text-[11px] text-foreground-subtle">cần lý do</span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : null}
          {overrides.length > 0 ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-foreground-muted">
                <ShieldAlert className="size-3.5 text-warning" aria-hidden="true" />
                Ngoài luồng (Quản trị, cần lý do)
              </DropdownMenuLabel>
              {overrides.map((option) => (
                <DropdownMenuItem key={option.toStatusId} onClick={() => onMove(option)}>
                  <StatusDot status={lookup.byId.get(option.toStatusId)} />
                  {lookup.byId.get(option.toStatusId)?.name ?? "…"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
};

const StatusDot = ({ status }: { status: ProductionStatus | undefined }) => (
  <span
    aria-hidden="true"
    className={cn(toneClass(status?.color ?? "gray"), "size-2 rounded-full bg-(--tone)")}
  />
);
