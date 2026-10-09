import { cn } from "cn";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionStatus } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";
import { toneClass } from "@/lib/colors";

import { productionErrorMessage } from "../../errors";
import { useWorkflow } from "../../hooks";
import { useTransitionTask } from "../../jobs-hooks";
import { needsInput, splitTransitions } from "../../jobs-model";
import { sheetOnPhone } from "../../ui";
import { FormAlert } from "../settings-kit";

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
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} onClick={(event) => event.stopPropagation()}>
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
            render={<Button variant="ghost" size={size} aria-label={`Chuyển khác cho #${task.number}`} />}
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
              <>
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
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
};

const StatusDot = ({ status }: { status: ProductionStatus | undefined }) => (
  <span aria-hidden="true" className={cn(toneClass(status?.color ?? "gray"), "size-2 rounded-full bg-(--tone)")} />
);

