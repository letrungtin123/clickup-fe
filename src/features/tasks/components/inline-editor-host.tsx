import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import { useCallback, useRef, useState, type ReactNode } from "react";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";
import type { TaskSummary, UserRef } from "@/contracts/work";

import {
  InlineEditorContext,
  type InlineEditorRequest,
  type RowMenuAction
} from "../inline-editor-context";
import { useTaskActions } from "../use-task-actions";
import { AssigneePanel, DatePanel, PriorityPanel, StatusPanel } from "./pickers";

/** Provides `useInlineEditor()` to its subtree and renders the single shared editing popover. */
export const InlineEditorHost = ({ children }: { children: ReactNode }) => {
  const [request, setRequest] = useState<(InlineEditorRequest & { seq: number }) | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const seq = useRef(0);

  const open = useCallback((next: InlineEditorRequest) => {
    anchorRef.current = next.anchor;
    seq.current += 1;
    setRequest({ ...next, seq: seq.current });
  }, []);
  const close = useCallback(() => setRequest(null), []);

  return (
    <InlineEditorContext value={open}>
      {children}
      <PopoverPrimitive.Root open={request !== null} onOpenChange={(next) => !next && close()}>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            anchor={request?.anchor ?? null}
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={8}
            className="isolate z-50"
          >
            <PopoverPrimitive.Popup
              finalFocus={anchorRef}
              onKeyDown={(event) => {
                // Keep Escape inside the popover (do not close the detail panel behind it).
                if (event.key === "Escape") event.stopPropagation();
              }}
              className={cn(
                "z-50 max-h-(--available-height) max-w-(--available-width) origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                request?.kind === "due" || request?.kind === "start" ? "p-2" : "p-0"
              )}
            >
              {request ? <EditorPanel key={request.seq} request={request} onDone={close} /> : null}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </InlineEditorContext>
  );
};

const EditorPanel = ({ request, onDone }: { request: InlineEditorRequest; onDone: () => void }) => {
  const actions = useTaskActions();
  const { task } = request;
  switch (request.kind) {
    case "status":
      return (
        <StatusPanel
          projectId={task.projectId}
          listId={task.listId}
          currentId={task.status.id}
          onSelect={(status) => {
            onDone();
            void actions.changeStatus(task, status);
          }}
        />
      );
    case "priority":
      return (
        <PriorityPanel
          current={task.priority}
          onSelect={(priority) => {
            onDone();
            actions.setPriority(task, priority);
          }}
        />
      );
    case "assignees":
      return <AssigneeEditor task={task} onToggle={actions.toggleAssignee} />;
    case "due":
      return (
        <DatePanel
          kind="due"
          value={task.dueAt}
          min={task.startAt}
          onChange={(dueAt) => {
            onDone();
            actions.setDates(task, { dueAt });
          }}
        />
      );
    case "start":
      return (
        <DatePanel
          kind="start"
          value={task.startAt}
          max={task.dueAt}
          onChange={(startAt) => {
            onDone();
            actions.setDates(task, { startAt });
          }}
        />
      );
    case "menu":
      return <MenuPanel actions={request.actions ?? []} onDone={onDone} />;
    default:
      return null;
  }
};

/** Keeps a local copy so several quick toggles build on each other before the server answers. */
const AssigneeEditor = ({
  task,
  onToggle
}: {
  task: TaskSummary;
  onToggle: (task: TaskSummary, user: UserRef) => void;
}) => {
  const [assignees, setAssignees] = useState(task.assignees);
  return (
    <AssigneePanel
      projectId={task.projectId}
      assignees={assignees}
      onToggle={(user, assigned) => {
        onToggle({ ...task, assignees }, user);
        setAssignees((current) =>
          assigned ? current.filter((entry) => entry.id !== user.id) : [...current, user]
        );
      }}
    />
  );
};

const MenuPanel = ({ actions, onDone }: { actions: RowMenuAction[]; onDone: () => void }) => {
  const regular = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  const item = (action: RowMenuAction) => (
    <CommandItem
      key={action.key}
      value={action.key}
      disabled={action.disabled ?? false}
      onSelect={() => {
        onDone();
        action.onSelect();
      }}
      className={cn(action.destructive && "text-destructive data-selected:bg-destructive/10 data-selected:text-destructive")}
    >
      {action.icon ? <action.icon className="size-4" /> : null}
      {action.label}
    </CommandItem>
  );
  return (
    <Command loop className="w-56 outline-none" tabIndex={0}>
      <CommandList>
        <CommandGroup>{regular.map(item)}</CommandGroup>
        {destructive.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup>{destructive.map(item)}</CommandGroup>
          </>
        ) : null}
      </CommandList>
    </Command>
  );
};
