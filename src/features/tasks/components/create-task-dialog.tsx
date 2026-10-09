import { CalendarDays, CalendarPlus, Flag, UserPlus } from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PriorityFlag } from "@/components/shared/task-meta";
import { AvatarGroup } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { RichTextDoc } from "@/contracts/rich-text";
import type { List, Project, TaskPriority, TaskStatus, UserRef } from "@/contracts/work";
import { useInFlightGuard } from "@/hooks/use-in-flight-guard";
import { isModKey } from "@/lib/keyboard";

import { prepareDoc } from "@/components/shared/rich-text/helpers";
import { datesValid, formatShortDate } from "../due";
import { useCreateTask, useMentionSource, useWorkflow } from "../hooks";
import { useTaskAbilities } from "../use-task-abilities";
import { AssigneePanel, DatePanel, PriorityPanel, StatusPanel } from "./pickers";
import { StatusIcon } from "./status-icon";

const RichTextEditor = lazy(() =>
  import("@/components/shared/rich-text/rich-text-editor").then((module) => ({ default: module.RichTextEditor }))
);

type CreateTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  list: List;
  openTask: (taskId: string) => void;
  /** Pre-selected status (e.g. from a group). */
  initialStatusId?: string | undefined;
};

/** "+ Công việc": full create form (title, description, status, people, priority, dates). */
export const CreateTaskDialog = ({ open, onOpenChange, ...rest }: CreateTaskDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="gap-0 p-0 sm:max-w-xl" showCloseButton>
      {open ? <CreateTaskForm {...rest} onClose={() => onOpenChange(false)} /> : null}
    </DialogContent>
  </Dialog>
);

const CreateTaskForm = ({
  project,
  list,
  openTask,
  initialStatusId,
  onClose
}: Omit<CreateTaskDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) => {
  const workflow = useWorkflow(project.id, list.id);
  const abilities = useTaskAbilities(project);
  const mentionSource = useMentionSource(project.id);
  const create = useCreateTask();
  const guard = useInFlightGuard();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<RichTextDoc | null>(null);
  const [statusId, setStatusId] = useState<string | undefined>(initialStatusId);
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [assignees, setAssignees] = useState<UserRef[]>([]);
  const [startAt, setStartAt] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statuses = workflow.data?.items ?? [];
  const status: TaskStatus | undefined =
    statuses.find((item) => item.id === statusId) ?? statuses.find((item) => item.isInitial) ?? statuses[0];

  const submit = () => {
    // Enter + Ctrl+Enter / double clicks while the request is in flight create one task (BUG-WK-15).
    if (guard.active) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Nhập tên công việc.");
      return;
    }
    if (!datesValid(startAt, dueAt)) {
      setError("Hạn chót phải sau hoặc trùng ngày bắt đầu.");
      return;
    }
    const prepared = description ? prepareDoc(description, "description", { allowEmpty: true }) : null;
    if (prepared && !prepared.ok) {
      setError(prepared.message);
      return;
    }
    const doc = prepared?.ok && prepared.text.trim() ? prepared.doc : null;
    if (!guard.tryEnter()) return;
    create.mutate(
      {
        projectId: project.id,
        input: {
          listId: list.id,
          title: trimmed,
          description: doc,
          ...(status ? { statusId: status.id } : {}),
          priority,
          assigneeIds: assignees.map((user) => user.id),
          startAt,
          dueAt
        }
      },
      {
        onSuccess: (task) => {
          onClose();
          toast.success(`Đã tạo ${task.key}`, {
            description: task.title,
            action: { label: "Mở", onClick: () => openTask(task.id) }
          });
        },
        onSettled: guard.release
      }
    );
  };

  return (
    <form
      className="flex max-h-[min(44rem,90dvh)] flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (isModKey(event, "Enter")) {
          event.preventDefault();
          submit();
        }
      }}
    >
      <DialogHeader className="border-b px-4 pt-4 pb-3 pr-12">
        <DialogTitle className="flex items-center gap-2 text-sm">
          <span className="text-foreground-muted">{project.name}</span>
          <span className="text-foreground-subtle">/</span>
          {list.name}
        </DialogTitle>
        <DialogDescription className="sr-only">Tạo công việc mới trong danh sách {list.name}</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <input
          autoFocus
          value={title}
          maxLength={240}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
          placeholder="Tên công việc"
          aria-label="Tên công việc"
          aria-invalid={error ? true : undefined}
          className="w-full bg-transparent text-lg font-semibold tracking-[-0.01em] outline-none placeholder:text-foreground-subtle"
        />
        <Suspense fallback={<Skeleton className="h-20 w-full" />}>
          <RichTextEditor
            variant="description"
            value={description}
            onChange={setDescription}
            placeholder="Mô tả (không bắt buộc) — gõ @ để nhắc tên"
            mentionSource={mentionSource}
            toolbar
            className="rounded-lg border px-3 py-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30"
            contentClassName="min-h-20 max-h-64 overflow-y-auto"
          />
        </Suspense>
        <div className="flex flex-wrap items-center gap-1.5">
          <PropertyPopover
            label="Trạng thái"
            trigger={
              status ? (
                <>
                  <StatusIcon status={status} />
                  {status.name}
                </>
              ) : (
                <Spinner className="size-3" />
              )
            }
          >
            {(close) => (
              <StatusPanel
                projectId={project.id}
                listId={list.id}
                currentId={status?.id ?? null}
                onSelect={(next) => {
                  setStatusId(next.id);
                  close();
                }}
              />
            )}
          </PropertyPopover>
          {abilities.canAssign ? (
            <PropertyPopover
              label="Người thực hiện"
              trigger={
                assignees.length > 0 ? (
                  <AvatarGroup users={assignees} max={3} size="xs" />
                ) : (
                  <>
                    <UserPlus />
                    Giao cho
                  </>
                )
              }
            >
              {() => (
                <AssigneePanel
                  projectId={project.id}
                  assignees={assignees}
                  onToggle={(user, assigned) =>
                    setAssignees((current) => (assigned ? current.filter((entry) => entry.id !== user.id) : [...current, user]))
                  }
                />
              )}
            </PropertyPopover>
          ) : null}
          <PropertyPopover
            label="Ưu tiên"
            trigger={priority === "normal" ? <><Flag />Ưu tiên</> : <PriorityFlag priority={priority} showLabel />}
          >
            {(close) => (
              <PriorityPanel
                current={priority}
                onSelect={(next) => {
                  setPriority(next);
                  close();
                }}
              />
            )}
          </PropertyPopover>
          <PropertyPopover
            label="Ngày bắt đầu"
            padded
            trigger={<><CalendarPlus />{startAt ? formatShortDate(startAt) : "Bắt đầu"}</>}
          >
            {(close) => (
              <DatePanel
                kind="start"
                value={startAt}
                max={dueAt}
                onChange={(next) => {
                  setStartAt(next);
                  close();
                }}
              />
            )}
          </PropertyPopover>
          <PropertyPopover
            label="Hạn chót"
            padded
            trigger={<><CalendarDays />{dueAt ? formatShortDate(dueAt) : "Hạn chót"}</>}
          >
            {(close) => (
              <DatePanel
                kind="due"
                value={dueAt}
                min={startAt}
                onChange={(next) => {
                  setDueAt(next);
                  close();
                }}
              />
            )}
          </PropertyPopover>
        </div>
        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter className="mx-0 mb-0 items-center px-4 py-3 sm:justify-between">
        <span className="hidden text-xs text-foreground-subtle sm:inline">Ctrl/⌘ + Enter để tạo</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={create.isPending || !title.trim()}>
            {create.isPending ? <Spinner /> : null}
            Tạo công việc
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
};

const PropertyPopover = ({
  label,
  trigger,
  children,
  padded = false
}: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  padded?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        render={<Button type="button" variant="outline" size="sm" className="font-normal text-foreground-muted" />}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent align="start" className={padded ? "w-auto p-2" : "w-auto p-0"}>
        {open ? children(() => setOpen(false)) : null}
      </PopoverContent>
    </Popover>
  );
};
