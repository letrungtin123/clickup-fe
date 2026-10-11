import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import {
  ArrowRight,
  CircleAlert,
  GripVertical,
  Info,
  Plus,
  Trash2,
  TriangleAlert
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ColorSwatchPicker } from "@/components/shared/radio-controls";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type {
  KnowledgeSpaceDetail,
  KnowledgeStatus,
  KnowledgeStatusGroup
} from "@/contracts/knowledge";
import { colorTokenLabels } from "@/lib/colors";

import { knowledgeErrorMessage } from "../../errors";
import { useReplaceStatuses } from "../../hooks";
import { statusGroupMeta, statusGroupOrder } from "../../model/labels";
import {
  buildReplaceStatusesRequest,
  defaultReassign,
  groupStatuses,
  insertStatusDraft,
  isReassignComplete,
  maxStatuses,
  moveStatusDraft,
  newStatusDraft,
  reassignTargets,
  regroupedStatuses,
  removedStatuses,
  statusDraftsChanged,
  statusesSignature,
  statusNameMaxLength,
  toStatusDrafts,
  validateStatusDrafts,
  type KeptStatusDraft,
  type StatusDraft
} from "../../model/statuses";
import { KnowledgeStatusChip } from "../badges";
import { SettingsSection } from "./settings-section";
import { StatusGroupDot } from "./status-group-dot";

let draftSeq = 0;
const newDraftKey = () => `new-${(draftSeq += 1)}`;

const groupItems = statusGroupOrder.map((group) => ({
  value: group,
  label: statusGroupMeta[group].label
}));

/** Controls inside a row that keep focus after a keyboard move (Alt + ↑/↓). */
type RowPart = "handle" | "name";

/** "Trạng thái" (PD-031 §04): managers edit the list inline; everyone else sees it by group. */
export const SpaceStatusesSection = ({
  space,
  editable
}: {
  space: KnowledgeSpaceDetail;
  editable: boolean;
}) => {
  const id = useId();
  return (
    <SettingsSection
      id={`${id}-statuses`}
      title="Trạng thái"
      description={
        editable
          ? `Mỗi kho tự đặt tên, màu và thứ tự trạng thái (từ 3 đến ${maxStatuses}). Mỗi trạng thái thuộc một trong 3 nhóm cố định để hệ thống biết ai thấy mục và cách xếp trong tìm kiếm.`
          : space.archivedAt
            ? "Kho đã lưu trữ nên không sửa được trạng thái."
            : "Trạng thái của kho theo nhóm. Chỉ Quản lý kho mới sửa được."
      }
    >
      {editable ? <StatusEditor space={space} /> : <StatusOverview statuses={space.statuses} />}
    </SettingsSection>
  );
};

// --- Read-only ------------------------------------------------------------------------------------

const StatusOverview = ({ statuses }: { statuses: readonly KnowledgeStatus[] }) => (
  <div className="flex flex-col divide-y">
    {groupStatuses(statuses).map(({ group, statuses: list }) => (
      <div
        key={group}
        className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-6"
      >
        <div className="flex flex-col gap-0.5 sm:w-56 sm:shrink-0">
          <span className="flex items-center gap-1.5 text-[13px] font-medium">
            <StatusGroupDot group={group} color="slate" />
            {statusGroupMeta[group].label}
          </span>
          <span className="text-xs leading-relaxed text-foreground-muted">
            {statusGroupMeta[group].description}
          </span>
        </div>
        {list.length > 0 ? (
          <ul
            className="flex min-w-0 flex-wrap gap-1.5"
            aria-label={`Trạng thái nhóm ${statusGroupMeta[group].label}`}
          >
            {list.map((status) => (
              <li key={status.id} className="max-w-full min-w-0">
                <KnowledgeStatusChip status={status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-foreground-subtle">Chưa có trạng thái.</p>
        )}
      </div>
    ))}
  </div>
);

// --- Editor ---------------------------------------------------------------------------------------

const StatusEditor = ({ space }: { space: KnowledgeSpaceDetail }) => {
  const ids = useId();
  const current = space.statuses;
  const signature = statusesSignature(current);
  const save = useReplaceStatuses(space.id);
  const listRef = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  /** The saved list the drafts started from: unsaved changes are measured against it. */
  const [baseline, setBaseline] = useState(() => ({ signature, statuses: current }));
  const [drafts, setDrafts] = useState<StatusDraft[]>(() => toStatusDrafts(current));
  const [step, setStep] = useState<"edit" | "reassign">("edit");
  const [reassign, setReassign] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);
  /**
   * Signature of the saved list our save replaced. The refetched list reaches React after the save
   * promise settles (query notifications are batched to a later task), so "saving" alone cannot tell
   * our own result from someone else's change.
   */
  const [savedOver, setSavedOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const saving = save.isPending;

  const dirty = statusDraftsChanged(baseline.statuses, drafts);
  const serverChanged = baseline.signature !== signature;
  const adopt = serverChanged && (!dirty || savedOver === baseline.signature);

  // A new saved list arrived (our own save, or another manager): adopt it when nothing would be lost.
  // Otherwise keep the drafts and say so (adjusting state while rendering, no effect round-trip).
  if (adopt) {
    setBaseline({ signature, statuses: current });
    setDrafts(toStatusDrafts(current));
    setStep("edit");
    setReassign({});
    setAttempted(false);
    setSavedOver(null);
  }
  const stale = serverChanged && !adopt;

  const removed = useMemo(() => removedStatuses(current, drafts), [current, drafts]);
  const issues = useMemo(() => validateStatusDrafts(drafts, current), [drafts, current]);
  const regrouped = useMemo(() => regroupedStatuses(current, drafts), [current, drafts]);
  const targets = useMemo(() => reassignTargets(drafts), [drafts]);
  const shownIssues = attempted ? issues : [];
  const invalidKeys = new Set(shownIssues.flatMap((issue) => issue.keys));

  // Leaving the page (reload, closing the tab) with unsaved statuses asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const focusLater = (find: () => HTMLElement | null | undefined) =>
    requestAnimationFrame(() => find()?.focus());
  const rowControl = (key: string, part: RowPart | "remove") =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])
      .find((row) => row.dataset.row === key)
      ?.querySelector<HTMLElement>(`[data-part="${part}"]`);

  const nameOf = (key: UniqueIdentifier) => {
    const name = drafts.find((draft) => draft.key === key)?.name.trim();
    return name ? `“${name}”` : "trạng thái chưa đặt tên";
  };
  const positionOf = (key: UniqueIdentifier) => drafts.findIndex((draft) => draft.key === key) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Đã nhấc ${nameOf(active.id)} ở vị trí ${positionOf(active.id)} trên ${drafts.length}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} đang ở vị trí ${positionOf(over.id)} trên ${drafts.length}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Đã đặt ${nameOf(active.id)} ở vị trí ${positionOf(over.id)} trên ${drafts.length}.`
        : `Đã đặt ${nameOf(active.id)}.`,
    onDragCancel: ({ active }) => `Đã huỷ, ${nameOf(active.id)} về lại vị trí cũ.`
  };

  const edit = (next: StatusDraft[]) => {
    setError(null);
    setDrafts(next);
  };

  const update = (key: string, patch: Partial<Pick<StatusDraft, "name" | "color" | "group">>) =>
    edit(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));

  const add = () => {
    if (drafts.length >= maxStatuses) return;
    edit(insertStatusDraft(drafts, newStatusDraft(newDraftKey(), drafts)));
  };

  const remove = (key: string) => {
    const index = drafts.findIndex((draft) => draft.key === key);
    const next = drafts.filter((draft) => draft.key !== key);
    edit(next);
    const neighbour = next[Math.min(index, next.length - 1)];
    focusLater(() => (neighbour ? rowControl(neighbour.key, "remove") : addRef.current));
  };

  const move = (key: string, offset: -1 | 1, part: RowPart) => {
    const next = moveStatusDraft(drafts, key, offset);
    const position = next.findIndex((draft) => draft.key === key) + 1;
    if (next.every((draft, index) => draft.key === drafts[index]?.key)) return;
    edit(next);
    setAnnouncement(`Đã chuyển ${nameOf(key)} tới vị trí ${position} trên ${next.length}.`);
    focusLater(() => rowControl(key, part));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = drafts.findIndex((draft) => draft.key === active.id);
    const to = drafts.findIndex((draft) => draft.key === over.id);
    if (from < 0 || to < 0) return;
    const next = [...drafts];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    edit(next);
  };

  const revert = () => {
    setBaseline({ signature, statuses: current });
    setDrafts(toStatusDrafts(current));
    setStep("edit");
    setReassign({});
    setAttempted(false);
    setError(null);
  };

  // mutateAsync: the result is handled even if the refetched space re-renders this editor meanwhile.
  const send = async (map: Record<string, string>) => {
    setError(null);
    setSavedOver(baseline.signature);
    try {
      await save.mutateAsync(buildReplaceStatusesRequest(drafts, removed, map));
      toast.success("Đã lưu trạng thái của kho");
      setStep("edit");
      setAttempted(false);
    } catch (failure) {
      setSavedOver(null);
      setError(knowledgeErrorMessage(failure, "Không lưu được trạng thái. Vui lòng thử lại."));
    }
  };

  const onSave = () => {
    setError(null);
    if (step === "reassign") {
      if (!isReassignComplete(removed, reassign, drafts)) {
        setError("Chọn trạng thái nhận mục cho từng trạng thái bị xoá.");
        return;
      }
      void send(reassign);
      return;
    }
    setAttempted(true);
    if (issues.length > 0) {
      focusLater(() => listRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]'));
      return;
    }
    if (removed.length > 0) {
      setReassign(defaultReassign(removed, drafts));
      setStep("reassign");
      focusLater(() => document.getElementById(`${ids}-reassign-title`));
      return;
    }
    void send({});
  };

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
        {statusGroupOrder.map((group) => (
          <div key={group} className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-xs font-semibold">
              <StatusGroupDot group={group} color="slate" />
              {statusGroupMeta[group].label}
            </dt>
            <dd className="text-xs leading-relaxed text-foreground-muted">
              {statusGroupMeta[group].description}
            </dd>
          </div>
        ))}
      </dl>
      {space.approvalRequired ? (
        <p className="-mt-1 flex items-start gap-1.5 text-xs text-foreground-muted">
          <Info className="mt-px size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
          Kho đang bật bước duyệt: chỉ Quản lý kho chuyển được mục sang các trạng thái nhóm Đang áp
          dụng và Hết hiệu lực.
        </p>
      ) : null}

      {stale ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-foreground"
        >
          <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span className="min-w-0 flex-1 basis-48">
            Trạng thái của kho vừa được thay đổi ở nơi khác. Lưu bây giờ sẽ thay bằng danh sách của
            bạn.
          </span>
          <Button size="xs" variant="outline" onClick={revert}>
            Tải bản mới
          </Button>
        </div>
      ) : null}

      {/* Frozen while saving: the saved list replaces the drafts, so edits typed meanwhile would be lost. */}
      <fieldset
        disabled={saving}
        aria-busy={saving}
        className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0"
      >
        {step === "reassign" ? (
          <ReassignStep
            titleId={`${ids}-reassign-title`}
            removed={removed}
            targets={targets}
            reassign={reassign}
            onChange={(statusId, targetId) => {
              setError(null);
              setReassign((map) => ({ ...map, [statusId]: targetId }));
            }}
          />
        ) : (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
              accessibility={{
                announcements,
                screenReaderInstructions: {
                  draggable:
                    "Nhấn Space để nhấc trạng thái, dùng phím mũi tên lên xuống để di chuyển, Space để đặt xuống, Esc để huỷ. Có thể giữ Alt và nhấn mũi tên lên xuống để chuyển từng bước."
                }
              }}
            >
              <SortableContext
                items={drafts.map((draft) => draft.key)}
                strategy={verticalListSortingStrategy}
              >
                <ol
                  ref={listRef}
                  className="flex flex-col gap-1.5"
                  aria-label="Trạng thái của kho, theo thứ tự"
                >
                  {drafts.map((draft, index) => (
                    <StatusRow
                      key={draft.key}
                      draft={draft}
                      index={index}
                      invalid={invalidKeys.has(draft.key)}
                      onChange={(patch) => update(draft.key, patch)}
                      onRemove={() => remove(draft.key)}
                      onMove={(offset, part) => move(draft.key, offset, part)}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button
                ref={addRef}
                variant="ghost"
                size="sm"
                className="text-foreground-muted"
                disabled={drafts.length >= maxStatuses}
                title={
                  drafts.length >= maxStatuses
                    ? `Mỗi kho có tối đa ${maxStatuses} trạng thái`
                    : undefined
                }
                onClick={add}
              >
                <Plus />
                Thêm trạng thái
              </Button>
              <span className="text-xs text-foreground-subtle tabular-nums">
                {drafts.length}/{maxStatuses}
              </span>
              <span className="hidden text-xs text-foreground-subtle sm:ml-auto pointer-fine:sm:inline">
                Kéo <GripVertical className="inline size-3 align-[-2px]" aria-hidden="true" /> hoặc
                Alt + ↑/↓ để đổi thứ tự
              </span>
            </div>

            {regrouped.length > 0 ? (
              <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-foreground-muted">
                <Info
                  className="mt-px size-3.5 shrink-0 text-foreground-subtle"
                  aria-hidden="true"
                />
                <span>
                  Đổi nhóm:{" "}
                  {regrouped
                    .map(
                      (entry) =>
                        `“${entry.name}” ${statusGroupMeta[entry.from].label} → ${statusGroupMeta[entry.to].label}`
                    )
                    .join("; ")}
                  . Các mục đang ở những trạng thái này sẽ theo nhóm mới (về Bản nháp thì người xem
                  thường không thấy nữa).
                </span>
              </p>
            ) : null}

            {shownIssues.length > 0 ? (
              <ul
                role="alert"
                className="flex flex-col gap-1 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger"
              >
                {shownIssues.map((issue) => (
                  <li key={issue.code} className="flex items-start gap-1.5">
                    <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {step === "edit" && dirty ? (
          <span className="mr-auto text-xs text-foreground-subtle">Có thay đổi chưa lưu</span>
        ) : null}
        {step === "reassign" ? (
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setError(null);
              setStep("edit");
            }}
          >
            Quay lại
          </Button>
        ) : (
          <Button variant="ghost" disabled={!dirty || saving} onClick={revert}>
            Hoàn tác
          </Button>
        )}
        <Button onClick={onSave} disabled={!dirty || saving}>
          {saving ? <Spinner /> : null}
          {step === "reassign" ? "Chuyển mục & lưu" : "Lưu trạng thái"}
        </Button>
      </div>
    </div>
  );
};

const StatusRow = ({
  draft,
  index,
  invalid,
  onChange,
  onRemove,
  onMove
}: {
  draft: StatusDraft;
  index: number;
  invalid: boolean;
  onChange: (patch: Partial<Pick<StatusDraft, "name" | "color" | "group">>) => void;
  onRemove: () => void;
  onMove: (offset: -1 | 1, part: RowPart) => void;
}) => {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: draft.key,
    attributes: { roleDescription: "trạng thái có thể sắp xếp" }
  });
  const label = draft.name.trim() ? `“${draft.name.trim()}”` : `trạng thái thứ ${index + 1}`;
  return (
    <li
      ref={setNodeRef}
      data-row={draft.key}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onKeyDown={(event) => {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        const part = event.target instanceof HTMLElement ? event.target.dataset.part : undefined;
        if (part !== "handle" && part !== "name") return;
        event.preventDefault();
        onMove(event.key === "ArrowUp" ? -1 : 1, part);
      }}
      className={cn(
        // Phones: the group select drops to a second line so the name keeps the width (like workflow-editor).
        "flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border bg-surface px-2 py-1.5 sm:flex-nowrap sm:gap-2",
        invalid && "border-danger/50",
        isDragging && "relative z-10 shadow-lg ring-1 ring-brand/30"
      )}
    >
      <button
        type="button"
        data-part="handle"
        aria-label={`Kéo để sắp xếp ${label}`}
        className="inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-foreground-subtle outline-none pointer-coarse:h-10 pointer-coarse:w-8 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <Popover>
        <PopoverTrigger
          aria-label={`Màu của ${label}: ${colorTokenLabels[draft.color]}`}
          title="Đổi màu"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md outline-none pointer-coarse:size-8 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-surface-hover"
        >
          <StatusGroupDot group={draft.group} color={draft.color} className="size-3" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <span className="text-xs font-medium text-foreground-muted">Màu trạng thái</span>
          <ColorSwatchPicker
            aria-label="Màu trạng thái"
            value={draft.color}
            onChange={(color) => onChange({ color })}
          />
        </PopoverContent>
      </Popover>
      <input
        data-part="name"
        value={draft.name}
        maxLength={statusNameMaxLength}
        placeholder="Tên trạng thái"
        aria-label={`Tên trạng thái thứ ${index + 1}`}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        // A row the manager just added: type its name straight away.
        autoFocus={!draft.id && draft.name === ""}
        onChange={(event) => onChange({ name: event.target.value })}
        className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-sm outline-none placeholder:text-foreground-subtle pointer-coarse:h-9 hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:ring-1 aria-invalid:ring-danger/60"
      />
      <Select
        items={groupItems}
        value={draft.group}
        onValueChange={(value: KnowledgeStatusGroup | null) => {
          if (value) onChange({ group: value });
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label={`Nhóm của ${label}`}
          className="order-last ml-[3.75rem] basis-[calc(100%-3.75rem)] pointer-coarse:ml-[4.75rem] pointer-coarse:basis-[calc(100%-4.75rem)] sm:order-none sm:ml-0 sm:w-40 sm:shrink-0 sm:basis-auto pointer-coarse:sm:ml-0 pointer-coarse:sm:basis-auto"
        >
          <SelectValue>
            <StatusGroupDot group={draft.group} color="slate" />
            <span className="truncate">{statusGroupMeta[draft.group].label}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {statusGroupOrder.map((group) => (
            <SelectItem key={group} value={group}>
              <StatusGroupDot group={group} color="slate" />
              {statusGroupMeta[group].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon-sm"
        data-part="remove"
        aria-label={`Xoá ${label}`}
        title="Xoá trạng thái"
        onClick={onRemove}
        className="shrink-0 text-foreground-subtle hover:text-danger"
      >
        <Trash2 />
      </Button>
    </li>
  );
};

const ReassignStep = ({
  titleId,
  removed,
  targets,
  reassign,
  onChange
}: {
  titleId: string;
  removed: readonly KnowledgeStatus[];
  targets: readonly KeptStatusDraft[];
  reassign: Readonly<Record<string, string>>;
  onChange: (statusId: string, targetId: string) => void;
}) => (
  <div className="flex flex-col gap-3">
    <h3
      id={titleId}
      tabIndex={-1}
      className="rounded text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Chuyển các mục của trạng thái bị xoá sang…
    </h3>
    <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs leading-relaxed text-foreground">
      <Info className="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
      Bạn đã xoá {removed.length} trạng thái. Chọn trạng thái nhận các mục đang ở đó (chỉ chọn được
      trạng thái đã có từ trước, không phải trạng thái vừa thêm). Mỗi mục được chuyển đều ghi vào
      nhật ký kho.
    </p>
    <ul className="flex flex-col gap-2">
      {removed.map((status) => {
        const target = targets.find((draft) => draft.id === reassign[status.id]);
        return (
          <li
            key={status.id}
            className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border px-3 py-2"
          >
            <KnowledgeStatusChip status={status} />
            <span className="flex min-w-0 flex-1 basis-56 items-center gap-2">
              <ArrowRight className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
              <Select
                value={reassign[status.id] ?? null}
                onValueChange={(value: string | null) => {
                  if (value) onChange(status.id, value);
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="min-w-0 flex-1 sm:max-w-64"
                  aria-label={`Chuyển các mục của “${status.name}” sang`}
                >
                  <SelectValue>
                    {target ? (
                      <>
                        <StatusGroupDot group={target.group} color={target.color} />
                        <span className="truncate">{target.name.trim()}</span>
                      </>
                    ) : (
                      <span className="truncate text-foreground-subtle">Chọn trạng thái</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {targets.map((draft) => (
                    <SelectItem key={draft.id} value={draft.id}>
                      <StatusGroupDot group={draft.group} color={draft.color} />
                      <span className="truncate">{draft.name.trim()}</span>
                      <span className="text-xs text-foreground-subtle">
                        · {statusGroupMeta[draft.group].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
          </li>
        );
      })}
    </ul>
  </div>
);
