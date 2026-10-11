import { closestCenter, DndContext, useSensor, useSensors, type DragEndEvent, type Modifier } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  CornerLeftUp,
  Ellipsis,
  Folder,
  FolderOpen,
  FolderPlus,
  Inbox,
  Layers,
  Pencil,
  Plus,
  Trash2
} from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { ActionsContextMenu, ActionsDropdown, type RowAction } from "@/components/shared/row-actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { knowledgeLimits, type KnowledgeCategory, type KnowledgeSpaceDetail } from "@/contracts/knowledge";
import { createControlAwareSensors } from "@/lib/dnd-sensors";
import { moveItem } from "@/lib/ordering";

import { useCategoryMutations } from "../hooks";
import { buildCategoryTree, categoryTotal, parentChoices, siblingsOf, type CategoryNode } from "../model/categories";

/** Selected filter: all items, items without a category, or one category. */
export type CategorySelection = null | "none" | (string & {});

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const { MouseSensor: TreeMouseSensor, TouchSensor: TreeTouchSensor } = createControlAwareSensors(
  "button, input, [role='menuitem'], [data-no-drag]"
);

/** A drag ends with a click on the moved row: swallow it so it does not also select the row. */
let suppressClicksUntil = 0;

type Props = {
  space: KnowledgeSpaceDetail;
  canManage: boolean;
  selected: CategorySelection;
  onSelect: (selection: CategorySelection) => void;
  className?: string;
};

/**
 * "Chuyên mục" tree of a space (2 levels, PD-031). Everyone filters with it; managers add, rename,
 * move under another category, reorder (drag, or Alt+↑/↓ and the row menu) and delete.
 * Keyboard: ↑/↓/Home/End move, Enter selects, F2 renames, Shift+F10 opens the menu (WAI-ARIA tree).
 */
export const CategoryTree = ({ space, canManage, selected, onSelect, className }: Props) => {
  const tree = useMemo(() => buildCategoryTree(space.categories), [space.categories]);
  const mutations = useCategoryMutations(space.id);
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeCategory | null>(null);
  const sensors = useSensors(
    useSensor(TreeMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TreeTouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  );

  const reorder = (category: KnowledgeCategory, ordered: KnowledgeCategory[]) =>
    mutations.reorder.mutate({ categoryId: category.id, ordered });

  const move = (category: KnowledgeCategory, step: -1 | 1) => {
    const siblings = siblingsOf(space.categories, category);
    const from = siblings.findIndex((entry) => entry.id === category.id);
    const to = from + step;
    if (from === -1 || to < 0 || to >= siblings.length) return;
    reorder(category, moveItem(siblings, from, to));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    suppressClicksUntil = performance.now() + 250;
    if (!over || active.id === over.id) return;
    const category = space.categories.find((entry) => entry.id === active.id);
    const target = space.categories.find((entry) => entry.id === over.id);
    if (!category || !target || category.parentId !== target.parentId) return;
    const siblings = siblingsOf(space.categories, category);
    reorder(category, moveItem(siblings, siblings.findIndex((entry) => entry.id === category.id), siblings.findIndex((entry) => entry.id === target.id)));
  };

  const focusable = selected ?? "all";
  const rowProps = { selected, onSelect, tabStopId: focusable };

  return (
    <nav aria-label="Chuyên mục" className={cn("flex min-h-0 flex-col gap-1", className)}>
      <div className="flex h-8 items-center gap-1 px-2">
        <h2 className="flex-1 text-[11px] font-semibold tracking-[0.06em] text-foreground-subtle uppercase">Chuyên mục</h2>
        {canManage ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Thêm chuyên mục"
            title="Thêm chuyên mục"
            onClick={() => setAdding({ parentId: null })}
            className="text-foreground-muted"
          >
            <Plus />
          </Button>
        ) : null}
      </div>
      <div role="tree" aria-label="Chuyên mục" className="flex flex-col gap-px">
        <StaticRow id="all" icon={<Layers />} label="Tất cả mục" count={space.itemCount} active={selected === null} {...rowProps} value={null} />
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            suppressClicksUntil = performance.now() + 250;
          }}
          accessibility={{ screenReaderInstructions: { draggable: "" } }}
        >
          <SortableContext items={tree.map((node) => node.id)} strategy={verticalListSortingStrategy}>
            {tree.map((node) => (
              <RootNode
                key={node.id}
                node={node}
                space={space}
                canManage={canManage}
                adding={adding?.parentId === node.id}
                onAddChild={() => setAdding({ parentId: node.id })}
                onAddDone={() => setAdding(null)}
                onMove={move}
                onDelete={setDeleting}
                {...rowProps}
              />
            ))}
          </SortableContext>
        </DndContext>
        {adding?.parentId === null ? (
          <NewCategoryRow
            depth={0}
            pending={mutations.create.isPending}
            onCancel={() => setAdding(null)}
            onSubmit={(name) => mutations.create.mutate({ name, parentId: null }, { onSuccess: () => setAdding(null) })}
          />
        ) : null}
        <StaticRow id="none" icon={<Inbox />} label="Chưa phân loại" active={selected === "none"} {...rowProps} value="none" />
      </div>
      {tree.length === 0 && canManage && !adding ? (
        <button
          type="button"
          onClick={() => setAdding({ parentId: null })}
          className="mx-2 mt-1 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-left text-xs text-foreground-muted outline-none hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FolderPlus className="size-4 shrink-0" aria-hidden="true" />
          Chia mục theo chuyên mục, ví dụ “Quy trình › Retouch”.
        </button>
      ) : null}
      <DeleteCategoryDialog
        category={deleting}
        hasChildren={deleting ? space.categories.some((entry) => entry.parentId === deleting.id) : false}
        pending={mutations.remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={(category) =>
          mutations.remove.mutate(category.id, {
            onSuccess: () => {
              if (selected === category.id) onSelect(null);
              setDeleting(null);
            }
          })
        }
      />
    </nav>
  );
};

// --- Rows ---------------------------------------------------------------------------------------------

const rowClass = (active: boolean, depth: 0 | 1) =>
  cn(
    "group/row relative flex h-8 w-full items-center gap-2 rounded-md pr-1 text-[13px] text-foreground/85 outline-none select-none pointer-coarse:h-10",
    "transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
    "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-foreground-subtle",
    depth === 0 ? "pl-2" : "pl-7",
    active && "bg-brand-soft font-medium text-brand-text hover:bg-brand-soft hover:text-brand-text [&>svg]:text-brand-text"
  );

/** The sortable node being dragged (a root carries its sub-categories). */
const draggingClass = "z-10 rounded-md bg-surface shadow-lg ring-1 ring-border";

const focusRow = (from: HTMLElement, pick: (rows: HTMLElement[], index: number) => HTMLElement | undefined) => {
  const tree = from.closest<HTMLElement>("[role=tree]");
  if (!tree) return;
  const rows = [...tree.querySelectorAll<HTMLElement>("[data-category-row]")];
  pick(rows, rows.indexOf(from))?.focus();
};

const navigationKeys = (event: KeyboardEvent<HTMLElement>) => {
  const row = event.currentTarget;
  if (event.key === "ArrowDown" && !event.altKey) focusRow(row, (rows, index) => rows[index + 1]);
  else if (event.key === "ArrowUp" && !event.altKey) focusRow(row, (rows, index) => rows[index - 1]);
  else if (event.key === "Home") focusRow(row, (rows) => rows[0]);
  else if (event.key === "End") focusRow(row, (rows) => rows.at(-1));
  else return false;
  event.preventDefault();
  return true;
};

type RowSelection = {
  selected: CategorySelection;
  onSelect: (selection: CategorySelection) => void;
  tabStopId: string;
};

const StaticRow = ({
  id,
  icon,
  label,
  count,
  active,
  value,
  onSelect,
  tabStopId
}: RowSelection & { id: string; icon: ReactNode; label: string; count?: number; active: boolean; value: CategorySelection }) => (
  <div
    role="treeitem"
    aria-selected={active}
    aria-level={1}
    tabIndex={tabStopId === id ? 0 : -1}
    data-category-row=""
    onClick={() => onSelect(value)}
    onKeyDown={(event) => {
      if (navigationKeys(event)) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(value);
      }
    }}
    className={cn(rowClass(active, 0), "cursor-pointer")}
  >
    {icon}
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {count !== undefined ? <span className="pr-1 text-[11px] tabular-nums text-foreground-subtle">{count}</span> : null}
  </div>
);

type NodeProps = RowSelection & {
  space: KnowledgeSpaceDetail;
  canManage: boolean;
  onMove: (category: KnowledgeCategory, step: -1 | 1) => void;
  onDelete: (category: KnowledgeCategory) => void;
};

const RootNode = ({
  node,
  adding,
  onAddChild,
  onAddDone,
  ...props
}: NodeProps & { node: CategoryNode; adding: boolean; onAddChild: () => void; onAddDone: () => void }) => {
  const mutations = useCategoryMutations(props.space.id);
  const sensors = useSensors(
    useSensor(TreeMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TreeTouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    suppressClicksUntil = performance.now() + 250;
    if (!over || active.id === over.id) return;
    const from = node.children.findIndex((child) => child.id === active.id);
    const to = node.children.findIndex((child) => child.id === over.id);
    const moved = node.children[from];
    if (from === -1 || to === -1 || !moved) return;
    mutations.reorder.mutate({ categoryId: moved.id, ordered: moveItem(node.children, from, to) });
  };
  // The whole block (row + sub-categories) is the sortable node, so a dragged root carries its children.
  const { setNodeRef, transform, transition, isDragging, listeners } = useSortable({ id: node.id, disabled: !props.canManage });
  return (
    <div
      ref={setNodeRef}
      role="none"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && draggingClass)}
    >
      <CategoryRow category={node} depth={0} count={categoryTotal(node)} onAddChild={onAddChild} drag={{ listeners, isDragging }} {...props} />
      {node.children.length > 0 || adding ? (
        <div role="group" className="flex flex-col gap-px pt-px">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onDragEnd}
            accessibility={{ screenReaderInstructions: { draggable: "" } }}
          >
            <SortableContext items={node.children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
              {node.children.map((child) => (
                <ChildNode key={child.id} category={child} {...props} />
              ))}
            </SortableContext>
          </DndContext>
          {adding ? (
            <NewCategoryRow
              depth={1}
              pending={mutations.create.isPending}
              onCancel={onAddDone}
              onSubmit={(name) => mutations.create.mutate({ name, parentId: node.id }, { onSuccess: onAddDone })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const CategoryRow = ({
  category,
  depth,
  count,
  space,
  canManage,
  selected,
  onSelect,
  tabStopId,
  onMove,
  onDelete,
  onAddChild,
  drag
}: NodeProps & {
  category: KnowledgeCategory;
  depth: 0 | 1;
  count: number;
  onAddChild?: () => void;
  /** Drag handlers of the sortable node around this row (the root block or the sub-category). */
  drag: Pick<ReturnType<typeof useSortable>, "listeners" | "isDragging">;
}) => {
  const mutations = useCategoryMutations(space.id);
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const { isDragging, listeners } = drag;
  const active = selected === category.id;
  const hasChildren = depth === 0 && space.categories.some((entry) => entry.parentId === category.id);
  const otherRoots = space.categories.some((entry) => entry.parentId === null && entry.id !== category.id);
  const siblings = siblingsOf(space.categories, category);
  const index = siblings.findIndex((entry) => entry.id === category.id);
  const parents = parentChoices(space.categories, category);
  const parent = category.parentId ? space.categories.find((entry) => entry.id === category.parentId) : null;
  const atDepthLimit = depth + 1 >= knowledgeLimits.categoryDepth;

  const actions: RowAction[] = canManage
    ? [
        ...(depth === 0 && onAddChild && !atDepthLimit ? [{ key: "child", label: "Thêm chuyên mục con", icon: FolderPlus, onSelect: onAddChild }] : []),
        { key: "rename", label: "Đổi tên", icon: Pencil, shortcut: "F2", onSelect: () => setRenaming(true) },
        { key: "up", label: "Di chuyển lên", icon: ArrowUp, shortcut: "Alt+↑", separated: true, disabled: index <= 0, onSelect: () => onMove(category, -1) },
        { key: "down", label: "Di chuyển xuống", icon: ArrowDown, shortcut: "Alt+↓", disabled: index >= siblings.length - 1, onSelect: () => onMove(category, 1) },
        ...parents.map((target, position) => ({
          key: `into-${target.id}`,
          label: `Chuyển vào “${target.name}”`,
          icon: CornerDownRight,
          separated: position === 0,
          onSelect: () => mutations.update.mutate({ categoryId: category.id, parentId: target.id })
        })),
        // Only 2 levels: say why a category with sub-categories cannot move under another one.
        ...(hasChildren && otherRoots
          ? [{ key: "into-blocked", label: "Chuyển vào… (bỏ chuyên mục con trước)", icon: CornerDownRight, separated: true, disabled: true, onSelect: () => undefined }]
          : []),
        ...(parent
          ? [{ key: "to-root", label: "Đưa lên cấp 1", icon: CornerLeftUp, separated: parents.length === 0, onSelect: () => mutations.update.mutate({ categoryId: category.id, parentId: null }) }]
          : []),
        { key: "delete", label: "Xoá chuyên mục", icon: Trash2, variant: "destructive" as const, separated: true, onSelect: () => onDelete(category) }
      ]
    : [];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (canManage && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      onMove(category, event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (navigationKeys(event)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(category.id);
    } else if (event.key === "F2" && canManage) {
      event.preventDefault();
      setRenaming(true);
    } else if ((event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) && actions.length > 0) {
      event.preventDefault();
      setMenuOpen(true);
    }
  };

  const Icon = active ? FolderOpen : Folder;

  return (
    <ActionsContextMenu actions={actions}>
      <div
        ref={rowRef}
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={active}
        aria-label={`${category.name}, ${count} mục`}
        tabIndex={tabStopId === category.id ? 0 : -1}
        data-category-row=""
        onKeyDown={onKeyDown}
        onClickCapture={(event) => {
          if (performance.now() < suppressClicksUntil) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onClick={(event) => {
          // Clicks in the row menu (a portal) bubble here through React: they must not select the row.
          if (renaming || !(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
          onSelect(category.id);
        }}
        {...(renaming ? {} : listeners)}
        className={cn(rowClass(active, depth), "cursor-pointer", isDragging && "cursor-grabbing")}
      >
        <Icon aria-hidden="true" />
        {renaming ? (
          <NameInput
            initial={category.name}
            onCancel={() => setRenaming(false)}
            onSubmit={(name) => {
              setRenaming(false);
              if (name !== category.name) mutations.update.mutate({ categoryId: category.id, name });
            }}
          />
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">{category.name}</span>
            <span className={cn("pr-1 text-[11px] tabular-nums text-foreground-subtle", actions.length > 0 && "pointer-fine:group-hover/row:hidden pointer-fine:group-focus-visible/row:hidden pointer-fine:has-data-popup-open:hidden")}>
              {count}
            </span>
            {actions.length > 0 ? (
              <div className="hidden shrink-0 items-center group-hover/row:flex group-focus-visible/row:flex has-data-popup-open:flex pointer-coarse:flex">
                <ActionsDropdown
                  actions={actions}
                  open={menuOpen}
                  onOpenChange={setMenuOpen}
                  finalFocus={rowRef}
                  align="end"
                  triggerLabel={`Tùy chọn chuyên mục ${category.name}`}
                  triggerClassName="relative z-[1] flex size-6 items-center justify-center rounded-md text-foreground-muted outline-none pointer-coarse:size-8 hover:bg-border/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:flex data-popup-open:bg-border/70 [&_svg]:size-3.5"
                  trigger={<Ellipsis />}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </ActionsContextMenu>
  );
};

/** A sub-category: its own sortable node inside the parent's list. */
const ChildNode = ({ category, ...props }: NodeProps & { category: KnowledgeCategory }) => {
  const { setNodeRef, transform, transition, isDragging, listeners } = useSortable({ id: category.id, disabled: !props.canManage });
  return (
    <div
      ref={setNodeRef}
      role="none"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && draggingClass)}
    >
      <CategoryRow category={category} depth={1} count={category.itemCount} drag={{ listeners, isDragging }} {...props} />
    </div>
  );
};

const NameInput = ({
  initial,
  placeholder,
  onSubmit,
  onCancel
}: {
  initial: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) => {
  const done = useRef(false);
  const finish = (value: string) => {
    if (done.current) return;
    done.current = true;
    const trimmed = value.trim().slice(0, 80);
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };
  return (
    <input
      autoFocus
      defaultValue={initial}
      placeholder={placeholder}
      aria-label={placeholder ?? "Tên chuyên mục"}
      maxLength={80}
      onFocus={(event) => event.currentTarget.select()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish(event.currentTarget.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
      className="relative z-[1] h-6 min-w-0 flex-1 rounded-[5px] border border-ring bg-background px-1.5 text-[13px] text-foreground outline-none pointer-coarse:h-8"
    />
  );
};

const NewCategoryRow = ({
  depth,
  pending,
  onSubmit,
  onCancel
}: {
  depth: 0 | 1;
  pending: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) => (
  <div role="none" className={cn("flex h-8 items-center gap-2 pr-1 pointer-coarse:h-10", depth === 0 ? "pl-2" : "pl-7")}>
    {pending ? <Spinner className="size-4 text-foreground-subtle" /> : <FolderPlus className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />}
    {pending ? (
      <span className="text-[13px] text-foreground-muted">Đang tạo…</span>
    ) : (
      <NameInput initial="" placeholder={depth === 0 ? "Tên chuyên mục" : "Tên chuyên mục con"} onSubmit={onSubmit} onCancel={onCancel} />
    )}
  </div>
);

const DeleteCategoryDialog = ({
  category,
  hasChildren,
  pending,
  onClose,
  onConfirm
}: {
  category: KnowledgeCategory | null;
  hasChildren: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (category: KnowledgeCategory) => void;
}) => (
  <AlertDialog open={category !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Xoá chuyên mục “{category?.name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {hasChildren
            ? "Chuyên mục còn chuyên mục con. Chuyển hoặc xoá chúng trước."
            : category && category.itemCount > 0
              ? `Chuyên mục đang có ${category.itemCount} mục. Chuyển các mục sang chuyên mục khác trước khi xoá.`
              : "Chuyên mục trống sẽ bị xoá. Thao tác được ghi vào nhật ký kho."}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
        <Button
          variant="destructive"
          disabled={pending || hasChildren || (category?.itemCount ?? 0) > 0}
          onClick={() => category && onConfirm(category)}
        >
          {pending ? <Spinner /> : <Trash2 />}
          Xoá
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
