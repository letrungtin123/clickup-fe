import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import { ArrowRight, GripVertical, Info, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ColorSwatchPicker, SegmentedControl } from "@/components/shared/radio-controls";
import { ErrorState } from "@/components/shared/states";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { ColorToken, List, Project, TaskStatus } from "@/contracts/work";
import { toneClass } from "@/lib/colors";
import { moveItem } from "@/lib/ordering";

import { taskErrorMessage } from "../errors";
import { useReplaceWorkflow, useWorkflow } from "../hooks";
import { StatusIcon } from "./status-icon";

type Category = TaskStatus["category"];

type DraftStatus = { key: string; id?: string; name: string; category: Category; color: ColorToken };

const categoryOptions: readonly { value: Category; label: string }[] = [
  { value: "active", label: "Đang làm" },
  { value: "done", label: "Hoàn thành" },
  { value: "closed", label: "Đã đóng" }
];

const scopeLabel = { global: "mặc định của tổ chức", project: "dự án", list: "danh sách" } as const;

let draftSeq = 0;
const newKey = () => `new-${(draftSeq += 1)}`;

const toDraft = (status: TaskStatus): DraftStatus => ({
  key: status.id,
  id: status.id,
  name: status.name,
  category: status.category,
  color: status.color
});

type Props = { open: boolean; onOpenChange: (open: boolean) => void; project: Project; list: List };

/** Status workflow editor for a list or the whole project (inheritance, reorder, remap on delete). */
export const WorkflowEditorDialog = ({ open, onOpenChange, project, list }: Props) => {
  const [scope, setScope] = useState<"list" | "project">("list");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="gap-3 border-b px-4 pt-4 pb-3 pr-12">
          <DialogTitle>Quy trình trạng thái</DialogTitle>
          <DialogDescription>
            Trạng thái dùng cho các nhóm, cột bảng và việc hoàn thành. Danh sách có thể dùng quy trình riêng hoặc kế thừa từ dự án.
          </DialogDescription>
          <SegmentedControl
            aria-label="Phạm vi"
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: "list", label: `Danh sách “${list.name}”` },
              { value: "project", label: "Toàn dự án" }
            ]}
            // A long list name ellipsizes on phones instead of spilling past the dialog edge.
            className="max-w-full self-start [&>button]:min-w-0 [&>button]:flex-auto [&>button>span]:truncate"
          />
        </DialogHeader>
        <WorkflowForm key={scope} project={project} list={list} scope={scope} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
};

const WorkflowForm = ({
  project,
  list,
  scope,
  onClose
}: {
  project: Project;
  list: List;
  scope: "list" | "project";
  onClose: () => void;
}) => {
  const listId = scope === "list" ? list.id : null;
  const workflow = useWorkflow(project.id, listId);
  if (workflow.isPending) {
    return (
      <div className="flex flex-col gap-2 p-4" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-9" />
        ))}
      </div>
    );
  }
  if (workflow.isError) {
    return <ErrorState size="sm" error={workflow.error} onRetry={() => void workflow.refetch()} />;
  }
  return <WorkflowEditor key={workflow.dataUpdatedAt} project={project} listId={listId} scope={scope} current={workflow.data.items} currentScope={workflow.data.scope} onClose={onClose} />;
};

const WorkflowEditor = ({
  project,
  listId,
  scope,
  current,
  currentScope,
  onClose
}: {
  project: Project;
  listId: string | null;
  scope: "list" | "project";
  current: TaskStatus[];
  currentScope: TaskStatus["scope"];
  onClose: () => void;
}) => {
  const inheritedInitially = currentScope !== scope;
  const [inherit, setInherit] = useState(inheritedInitially);
  const [drafts, setDrafts] = useState<DraftStatus[]>(() => current.map(toDraft));
  const [remap, setRemap] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useReplaceWorkflow(project.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const removed = useMemo(
    () => current.filter((status) => !drafts.some((draft) => draft.id === status.id)),
    [current, drafts]
  );

  const update = (key: string, patch: Partial<DraftStatus>) => {
    setError(null);
    setDrafts((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const validate = (): string | null => {
    if (drafts.length === 0) return "Quy trình cần ít nhất một trạng thái.";
    if (drafts.some((draft) => !draft.name.trim())) return "Tên trạng thái không được để trống.";
    if (drafts[0]?.category !== "active") return "Trạng thái đầu tiên phải là trạng thái đang làm.";
    if (!drafts.some((draft) => draft.category !== "active")) return "Cần ít nhất một trạng thái hoàn thành hoặc đóng.";
    const names = drafts.map((draft) => draft.name.trim().toLocaleLowerCase("vi"));
    if (new Set(names).size !== names.length) return "Tên trạng thái không được trùng nhau.";
    return null;
  };

  const submit = () => {
    if (inherit) {
      if (inheritedInitially) {
        onClose();
        return;
      }
      save.mutate(
        { listId, inherit: true },
        {
          onSuccess: () => {
            toast.success("Đã chuyển sang dùng trạng thái kế thừa");
            onClose();
          },
          onError: (failure) => setError(taskErrorMessage(failure))
        }
      );
      return;
    }
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    if (removed.length > 0 && remap === null) {
      // Ask where tasks of removed statuses go (default: first kept status of the same category).
      const defaults: Record<string, string> = {};
      for (const status of removed) {
        const fallback = drafts.find((draft) => draft.category === status.category) ?? drafts[0];
        if (fallback) defaults[status.id] = fallback.key;
      }
      setRemap(defaults);
      return;
    }
    save.mutate(
      {
        listId,
        inherit: false,
        statuses: drafts.map((draft) => ({
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name.trim(),
          category: draft.category,
          color: draft.color
        })),
        remap: removed.flatMap((status) => {
          const index = drafts.findIndex((draft) => draft.key === remap?.[status.id]);
          return index >= 0 ? [{ fromStatusId: status.id, toIndex: index }] : [];
        })
      },
      {
        onSuccess: () => {
          toast.success("Đã lưu quy trình trạng thái");
          onClose();
        },
        onError: (failure) => {
          setRemap(null);
          setError(taskErrorMessage(failure));
        }
      }
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = drafts.findIndex((draft) => draft.key === active.id);
    const to = drafts.findIndex((draft) => draft.key === over.id);
    setDrafts((items) => moveItem(items, from, to));
  };

  const parentLabel = scope === "list" ? "dự án (hoặc mặc định tổ chức)" : "mặc định của tổ chức";

  return (
    <>
      <div className="flex max-h-[min(36rem,70dvh)] flex-col gap-3 overflow-y-auto px-4 py-4">
        <label className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
          <Switch
            checked={inherit}
            onCheckedChange={(next) => {
              setInherit(next);
              setRemap(null);
              setError(null);
            }}
            className="mt-0.5"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Dùng trạng thái kế thừa</span>
            <span className="text-xs text-foreground-muted">
              {inherit
                ? `Đang dùng quy trình của ${parentLabel}. Tắt để tạo quy trình riêng cho ${scope === "list" ? "danh sách này" : "dự án"}.`
                : `Quy trình riêng của ${scopeLabel[scope]}. Bật để quay lại quy trình của ${parentLabel}; công việc được chuyển sang trạng thái tương ứng.`}
            </span>
          </span>
        </label>

        {remap ? (
          <RemapStep removed={removed} drafts={drafts} remap={remap} onChange={setRemap} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={drafts.map((draft) => draft.key)} strategy={verticalListSortingStrategy}>
              <ol className={cn("flex flex-col gap-1.5", inherit && "pointer-events-none opacity-55")} aria-label="Danh sách trạng thái">
                {drafts.map((draft, index) => (
                  <StatusDraftRow
                    key={draft.key}
                    draft={draft}
                    first={index === 0}
                    disabled={inherit}
                    onChange={(patch) => update(draft.key, patch)}
                    onRemove={() => setDrafts((items) => items.filter((item) => item.key !== draft.key))}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
        {!inherit && !remap ? (
          <Button
            variant="ghost"
            size="sm"
            className="self-start text-foreground-muted"
            disabled={drafts.length >= 40}
            onClick={() =>
              setDrafts((items) => [
                ...items,
                { key: newKey(), name: "", category: items.length === 0 ? "active" : "active", color: "sky" }
              ])
            }
          >
            <Plus />
            Thêm trạng thái
          </Button>
        ) : null}
        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter className="mx-0 mb-0 px-4 py-3">
        {remap ? (
          <Button variant="outline" onClick={() => setRemap(null)}>
            Quay lại
          </Button>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
        )}
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null}
          {remap ? "Chuyển công việc & lưu" : "Lưu quy trình"}
        </Button>
      </DialogFooter>
    </>
  );
};

const StatusDraftRow = ({
  draft,
  first,
  disabled,
  onChange,
  onRemove
}: {
  draft: DraftStatus;
  first: boolean;
  disabled: boolean;
  onChange: (patch: Partial<DraftStatus>) => void;
  onRemove: () => void;
}) => {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id: draft.key, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        // Phones (P5): the category select drops to a second line so the name keeps the width.
        "flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border bg-surface px-2 py-1.5 sm:flex-nowrap sm:gap-2",
        isDragging && "relative z-10 shadow-lg ring-1 ring-brand/30"
      )}
    >
      <button
        type="button"
        aria-label={`Kéo để sắp xếp ${draft.name || "trạng thái"}`}
        className="inline-flex size-6 cursor-grab touch-none items-center justify-center rounded text-foreground-subtle outline-none pointer-coarse:h-9 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <Popover>
        <PopoverTrigger
          aria-label="Màu trạng thái"
          className={cn(toneClass(draft.color), "inline-flex size-6 shrink-0 items-center justify-center rounded-md outline-none pointer-coarse:size-8 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring")}
        >
          <StatusIcon status={{ color: draft.color, category: draft.category }} size="lg" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <ColorSwatchPicker aria-label="Chọn màu" value={draft.color} onChange={(color) => onChange({ color })} />
        </PopoverContent>
      </Popover>
      <input
        value={draft.name}
        maxLength={80}
        placeholder="Tên trạng thái"
        aria-label="Tên trạng thái"
        autoFocus={!draft.id && !draft.name}
        onChange={(event) => onChange({ name: event.target.value })}
        className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-sm outline-none pointer-coarse:h-9 focus-visible:bg-surface-hover"
      />
      <Select value={draft.category} onValueChange={(value) => onChange({ category: value as Category })}>
        <SelectTrigger
          size="sm"
          className="order-last ml-[3.75rem] basis-[calc(100%-3.75rem)] pointer-coarse:ml-[4.25rem] pointer-coarse:basis-[calc(100%-4.25rem)] sm:order-none sm:ml-0 sm:w-32 sm:shrink-0 sm:basis-auto pointer-coarse:sm:ml-0 pointer-coarse:sm:basis-auto"
          aria-label="Loại trạng thái"
        >
          <SelectValue>{categoryOptions.find((option) => option.value === draft.category)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {categoryOptions.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={first && option.value !== "active"}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon-sm" aria-label={`Xóa ${draft.name || "trạng thái"}`} onClick={onRemove} className="text-foreground-subtle hover:text-danger">
        <Trash2 />
      </Button>
    </li>
  );
};

const RemapStep = ({
  removed,
  drafts,
  remap,
  onChange
}: {
  removed: TaskStatus[];
  drafts: DraftStatus[];
  remap: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) => (
  <div className="flex flex-col gap-3">
    <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
      Bạn đã xóa {removed.length} trạng thái. Chọn nơi chuyển các công việc đang ở những trạng thái này — lịch sử thay đổi được ghi lại cho từng công việc.
    </p>
    <ul className="flex flex-col gap-2">
      {removed.map((status) => (
        <li key={status.id} className="flex flex-wrap items-center gap-2">
          <span className={cn(toneClass(status.color), "inline-flex h-7 min-w-32 items-center gap-1.5 rounded-md bg-(--tone-soft) px-2 text-xs font-medium text-(--tone-text)")}>
            <StatusIcon status={status} size="sm" />
            {status.name}
          </span>
          <ArrowRight className="size-3.5 text-foreground-subtle" aria-hidden="true" />
          <Select value={remap[status.id] ?? ""} onValueChange={(value) => onChange({ ...remap, [status.id]: String(value) })}>
            <SelectTrigger size="sm" className="min-w-44" aria-label={`Chuyển công việc của ${status.name} sang`}>
              <SelectValue>{drafts.find((draft) => draft.key === remap[status.id])?.name ?? "Chọn trạng thái"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {drafts.map((draft) => (
                <SelectItem key={draft.key} value={draft.key}>
                  <StatusIcon status={{ color: draft.color, category: draft.category }} size="sm" />
                  {draft.name || "(chưa đặt tên)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </li>
      ))}
    </ul>
  </div>
);
