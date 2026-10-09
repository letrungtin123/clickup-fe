import { addDays, nextMonday, nextSaturday, startOfDay } from "date-fns";
import { CalendarX2, UserRoundX } from "lucide-react";
import { useState } from "react";

import { PriorityFlag } from "@/components/shared/task-meta";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import type { TaskPriority, TaskStatus, UserRef } from "@/contracts/work";
import { priorityMeta } from "@/lib/task-meta";

import { dayToIso, formatFullDate } from "../due";
import { useDirectory, useWorkflow } from "../hooks";
import { rankPeople } from "../people";
import { useDebouncedValue } from "../use-debounced-value";
import { Calendar } from "./calendar";
import { StatusIcon } from "./status-icon";

/**
 * Picker panels used inside popovers (inline cells, detail panel, create dialog). Each panel is
 * keyboard driven (type to filter, ↑/↓, Enter) through cmdk.
 */

const categoryLabels = { active: "Đang làm", done: "Hoàn thành", closed: "Đã đóng" } as const;

export const StatusPanel = ({
  projectId,
  listId,
  currentId,
  onSelect
}: {
  projectId: string;
  listId: string;
  currentId: string | null;
  onSelect: (status: TaskStatus) => void;
}) => {
  const workflow = useWorkflow(projectId, listId);
  const statuses = workflow.data?.items ?? [];
  return (
    <Command loop className="w-60">
      <CommandInput placeholder="Đổi trạng thái…" autoFocus />
      <CommandList>
        {workflow.isPending ? (
          <div className="flex flex-col gap-2 p-2" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-5" />
            ))}
          </div>
        ) : (
          <>
            <CommandEmpty>Không có trạng thái phù hợp</CommandEmpty>
            {(["active", "done", "closed"] as const).map((category) => {
              const items = statuses.filter((status) => status.category === category);
              if (items.length === 0) return null;
              return (
                <CommandGroup key={category} heading={categoryLabels[category]}>
                  {items.map((status) => (
                    <CommandItem
                      key={status.id}
                      value={status.id}
                      keywords={[status.name]}
                      data-checked={status.id === currentId}
                      onSelect={() => onSelect(status)}
                    >
                      <StatusIcon status={status} />
                      <span className="truncate">{status.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </>
        )}
      </CommandList>
    </Command>
  );
};

const priorityOrder: readonly TaskPriority[] = ["urgent", "high", "normal", "low"];

export const PriorityPanel = ({
  current,
  onSelect
}: {
  current: TaskPriority;
  onSelect: (priority: TaskPriority) => void;
}) => (
  <Command loop className="w-48">
    <CommandList>
      <CommandGroup heading="Mức ưu tiên">
        {priorityOrder.map((priority) => (
          <CommandItem
            key={priority}
            value={priority}
            keywords={[priorityMeta[priority].label]}
            data-checked={priority === current}
            onSelect={() => onSelect(priority)}
          >
            <PriorityFlag priority={priority} showLabel className="text-sm text-foreground" />
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  </Command>
);

export const AssigneePanel = ({
  projectId,
  assignees,
  onToggle,
  disabled = false
}: {
  projectId: string;
  assignees: readonly UserRef[];
  onToggle: (user: UserRef, assigned: boolean) => void;
  disabled?: boolean;
}) => {
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 200);
  const directory = useDirectory({ projectId, q: q || undefined });
  const selectedIds = new Set(assignees.map((user) => user.id));
  const results = rankPeople((directory.data?.items ?? []).filter((user) => !selectedIds.has(user.id)), q);
  const matches = (user: UserRef) =>
    !q || user.displayName.toLocaleLowerCase("vi").includes(q.toLocaleLowerCase("vi"));

  return (
    <Command shouldFilter={false} loop className="w-72">
      <CommandInput placeholder="Tìm người…" value={query} onValueChange={setQuery} autoFocus />
      <CommandList>
        {assignees.filter(matches).length > 0 ? (
          <CommandGroup heading="Đã giao">
            {assignees.filter(matches).map((user) => (
              <CommandItem
                key={user.id}
                value={`assigned:${user.id}`}
                data-checked
                disabled={disabled}
                onSelect={() => onToggle(user, true)}
              >
                <UserAvatar user={user} size="xs" />
                <span className="truncate">{user.displayName}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        <CommandGroup heading={q ? "Kết quả" : "Thành viên"}>
          {directory.isPending ? (
            <div className="flex flex-col gap-2 p-2" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex items-center gap-2">
                  <Skeleton className="size-5 rounded-full" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-3 text-[13px] text-foreground-muted">
              <UserRoundX className="size-4" aria-hidden="true" />
              {q ? "Không tìm thấy ai phù hợp" : "Mọi thành viên đã được giao"}
            </div>
          ) : (
            results.map((user) => (
              <CommandItem
                key={user.id}
                value={user.id}
                disabled={disabled}
                onSelect={() => onToggle(user, false)}
              >
                <UserAvatar user={user} size="xs" />
                <span className="min-w-0 flex-1 truncate">{user.displayName}</span>
                {user.email ? (
                  <span className="max-w-[45%] truncate text-xs text-foreground-subtle">{user.email}</span>
                ) : null}
              </CommandItem>
            ))
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

type QuickDate = { key: string; label: string; date: () => Date };

const quickDates: readonly QuickDate[] = [
  { key: "today", label: "Hôm nay", date: () => new Date() },
  { key: "tomorrow", label: "Ngày mai", date: () => addDays(new Date(), 1) },
  { key: "weekend", label: "Cuối tuần này", date: () => nextSaturday(startOfDay(new Date())) },
  { key: "next-week", label: "Thứ 2 tuần sau", date: () => nextMonday(startOfDay(new Date())) },
  { key: "two-weeks", label: "2 tuần nữa", date: () => addDays(new Date(), 14) }
];

export const DatePanel = ({
  value,
  kind,
  min,
  max,
  onChange
}: {
  value: string | null;
  kind: "due" | "start";
  /** Earliest selectable day (due ≥ start). */
  min?: string | null | undefined;
  /** Latest selectable day (start ≤ due). */
  max?: string | null | undefined;
  onChange: (iso: string | null) => void;
}) => {
  const selected = value ? new Date(value) : undefined;
  const minDay = min ? startOfDay(new Date(min)) : null;
  const maxDay = max ? startOfDay(new Date(max)) : null;
  const allowed = (day: Date) =>
    (!minDay || startOfDay(day) >= minDay) && (!maxDay || startOfDay(day) <= maxDay);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="flex flex-row flex-wrap gap-1 sm:w-36 sm:flex-col sm:flex-nowrap sm:border-r sm:pr-2">
        <p className="hidden px-2 pt-1 pb-0.5 text-xs font-medium text-foreground-muted sm:block">
          {kind === "due" ? "Hạn chót" : "Ngày bắt đầu"}
        </p>
        {quickDates.map((option) => {
          const day = option.date();
          const enabled = allowed(day);
          return (
            <button
              key={option.key}
              type="button"
              disabled={!enabled}
              onClick={() => onChange(dayToIso(day, kind))}
              className="rounded-md px-2 py-1.5 text-left text-[13px] outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              {option.label}
            </button>
          );
        })}
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] text-danger outline-none hover:bg-danger-soft focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarX2 className="size-3.5" aria-hidden="true" />
            Xóa ngày
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Calendar
          mode="single"
          selected={selected}
          {...(selected ?? minDay ? { defaultMonth: selected ?? minDay ?? new Date() } : {})}
          onSelect={(day) => (day ? onChange(dayToIso(day, kind)) : onChange(null))}
          disabled={(day) => !allowed(day)}
          autoFocus
        />
        {value ? (
          <p className="px-1 text-xs text-foreground-muted first-letter:uppercase">{formatFullDate(value)}</p>
        ) : null}
      </div>
    </div>
  );
};
