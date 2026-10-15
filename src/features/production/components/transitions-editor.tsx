import { cn } from "cn";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, GitBranch, Info, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  transitionActors,
  type ProductionStatus,
  type ProductionWorkflow,
  type TransitionActor
} from "@/contracts/production-catalog";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { toneClass } from "@/lib/colors";

import { productionErrorMessage } from "../errors";
import { useStatusMutations } from "../hooks";
import {
  orderedStatuses,
  sortActors,
  toDraftTransitions,
  toTransitionsPayload,
  transitionActorHints,
  transitionActorLabels,
  transitionsChanged,
  validateTransitions,
  type DraftTransition
} from "../workflow";
import { FormAlert, SettingsSection } from "./settings-kit";

const ALL = "__all__";
let draftSeq = 0;
const newKey = () => `new-${(draftSeq += 1)}`;

/** Status label for selects; the code disambiguates statuses that share a display name. */
const StatusOption = ({
  status,
  showCode = false
}: {
  status: ProductionStatus;
  showCode?: boolean;
}) => (
  <span className={cn(toneClass(status.color), "flex min-w-0 items-center gap-1.5")}>
    <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-(--tone)" />
    <span className={cn("truncate", !status.active && "text-foreground-muted")}>{status.name}</span>
    {showCode ? (
      <span className="shrink-0 font-mono text-[10px] text-foreground-subtle">{status.code}</span>
    ) : null}
  </span>
);

/**
 * Transitions editor: who may move a task from one status to another and whether a note is
 * required (e.g. QC fail). Edits are local until saved; PUT /production/transitions replaces the set.
 * The grid scrolls inside its card with the "from" column pinned, so phones never scroll the page.
 * `readOnly` (PD-049, everyone but the organization superadmin): the same table without controls.
 */
export const TransitionsEditor = ({
  workflow,
  readOnly = false
}: {
  workflow: ProductionWorkflow;
  readOnly?: boolean;
}) => {
  const replace = useStatusMutations().replaceTransitions;
  const compact = useBreakpoint() === "mobile";
  const [drafts, setDrafts] = useState<DraftTransition[]>(() =>
    toDraftTransitions(workflow.transitions)
  );
  const [fromFilter, setFromFilter] = useState<string>(ALL);
  const [formError, setFormError] = useState<string | null>(null);

  const statuses = useMemo(() => orderedStatuses(workflow.statuses), [workflow.statuses]);
  const byId = useMemo(() => new Map(statuses.map((status) => [status.id, status])), [statuses]);
  const errors = validateTransitions(drafts);
  const dirty = transitionsChanged(drafts, workflow.transitions);
  const rows =
    fromFilter === ALL ? drafts : drafts.filter((draft) => draft.fromStatusId === fromFilter);
  const sharedNames = new Set(
    statuses
      .map((status) => status.name)
      .filter((name, index, names) => names.indexOf(name) !== index)
  );
  const statusItems = statuses.map((status) => ({
    value: status.id,
    label: sharedNames.has(status.name) ? `${status.name} (${status.code})` : status.name
  }));
  const filterItems = [{ value: ALL, label: "Mọi trạng thái nguồn" }, ...statusItems];

  const update = (key: string, patch: Partial<DraftTransition>) => {
    setFormError(null);
    setDrafts((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  /** First from → to pair not drafted yet, so a new row does not start as a duplicate (red). */
  const freePair = () => {
    const taken = new Set(drafts.map((draft) => `${draft.fromStatusId}>${draft.toStatusId}`));
    const froms =
      fromFilter !== ALL
        ? [fromFilter]
        : statuses.filter((status) => status.active).map((status) => status.id);
    for (const from of froms) {
      const to = statuses.find(
        (status) => status.active && status.id !== from && !taken.has(`${from}>${status.id}`)
      );
      if (to) return { from, to: to.id };
    }
    const from = froms[0] ?? statuses[0]?.id;
    const to = statuses.find((status) => status.id !== from)?.id;
    return from && to ? { from, to } : null;
  };

  const add = () => {
    const pair = freePair();
    if (!pair) return;
    const { from, to } = pair;
    const key = newKey();
    setDrafts((items) => [
      ...items,
      {
        key,
        fromStatusId: from,
        toStatusId: to,
        actors: ["ASSIGNEE"],
        requiresNote: false
      }
    ]);
    // The row is appended at the end of a long list: bring it into view (it is off-screen on phones).
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-draft="${key}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" })
    );
  };

  const save = () => {
    if (Object.keys(errors).length > 0) {
      setFormError("Sửa các dòng được đánh dấu đỏ trước khi lưu.");
      return;
    }
    replace.mutate(toTransitionsPayload(drafts), {
      onSuccess: (saved) => {
        setDrafts(toDraftTransitions(saved.transitions));
        toast.success("Đã lưu luồng chuyển trạng thái");
      },
      onError: (error) => setFormError(productionErrorMessage(error))
    });
  };

  // Fits the 1440px desktop without scrolling. Phones scroll the row sideways anyway: keep the
  // pinned "from" column narrower and the actor chips on one line (short rows).
  const template = compact
    ? "11rem 1.25rem 11rem max-content 6.5rem 2.75rem"
    : "minmax(9rem,13rem) 1.5rem minmax(9rem,13rem) minmax(22rem,1fr) 5.5rem 2.75rem";

  return (
    <SettingsSection
      title="Luồng chuyển"
      description="Mỗi dòng cho phép chuyển task từ trạng thái này sang trạng thái khác, ai được làm và có bắt buộc ghi chú không."
      actions={
        <>
          <Select
            items={filterItems}
            value={fromFilter}
            onValueChange={(value: string | null) => setFromFilter(value ?? ALL)}
          >
            <SelectTrigger className="w-full sm:w-52" aria-label="Lọc theo trạng thái nguồn">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filterItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {readOnly ? null : (
            <Button
              variant="outline"
              onClick={add}
              disabled={statuses.length < 2 || drafts.length >= 200}
            >
              <Plus />
              Thêm luồng
            </Button>
          )}
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          size="sm"
          icon={GitBranch}
          title={drafts.length === 0 ? "Chưa có luồng chuyển" : "Không có luồng từ trạng thái này"}
          description="Thêm luồng để quy định ai được chuyển task giữa các trạng thái."
        />
      ) : (
        // relative: the sr-only header is absolutely positioned and must be clipped by this
        // scroller, otherwise it widens <main> (hidden 1172px horizontal overflow on phones).
        <div className="relative overflow-x-auto overscroll-x-contain">
          <div
            role="table"
            aria-label="Luồng chuyển trạng thái"
            className="min-w-min"
            style={{ display: "grid", gridTemplateColumns: template }}
          >
            <div role="row" className="contents text-xs font-medium text-foreground-muted">
              <span
                role="columnheader"
                className="sticky left-0 z-10 border-b bg-surface px-3 py-2.5 shadow-[1px_0_0_var(--border)]"
              >
                Từ trạng thái
              </span>
              <span className="border-b" aria-hidden="true" />
              <span role="columnheader" className="border-b px-3 py-2.5">
                Đến trạng thái
              </span>
              <span role="columnheader" className="border-b px-3 py-2.5">
                Ai được chuyển
              </span>
              <span role="columnheader" className="border-b px-3 py-2.5">
                Bắt buộc ghi chú
              </span>
              <span role="columnheader" className="border-b">
                <span className="sr-only">Xóa</span>
              </span>
            </div>
            {rows.map((draft) => {
              const error = errors[draft.key];
              const cell = cn("flex items-center border-b px-3 py-2", error && "bg-danger-soft/40");
              return (
                <div key={draft.key} role="row" className="contents">
                  <div
                    role="cell"
                    data-draft={draft.key}
                    className={cn(
                      cell,
                      "sticky left-0 z-[1] flex-col items-stretch justify-center gap-1 bg-surface shadow-[1px_0_0_var(--border)]",
                      error && "bg-[color-mix(in_oklch,var(--surface),var(--danger)_6%)]"
                    )}
                  >
                    {readOnly ? (
                      <StatusLabel status={byId.get(draft.fromStatusId)} />
                    ) : (
                      <StatusSelect
                        statuses={statuses}
                        value={draft.fromStatusId}
                        onChange={(fromStatusId) => update(draft.key, { fromStatusId })}
                        label="Từ trạng thái"
                      />
                    )}
                    {error ? (
                      <span role="alert" className="text-[11px] leading-tight text-danger">
                        {error}
                      </span>
                    ) : null}
                  </div>
                  <div role="presentation" className={cn(cell, "justify-center px-0")}>
                    <ArrowRight className="size-3.5 text-foreground-subtle" aria-hidden="true" />
                  </div>
                  <div role="cell" className={cell}>
                    {readOnly ? (
                      <StatusLabel status={byId.get(draft.toStatusId)} />
                    ) : (
                      <StatusSelect
                        statuses={statuses}
                        value={draft.toStatusId}
                        onChange={(toStatusId) => update(draft.key, { toStatusId })}
                        label="Đến trạng thái"
                      />
                    )}
                  </div>
                  <div role="cell" className={cell}>
                    <ActorChips
                      readOnly={readOnly}
                      value={draft.actors}
                      onChange={(actors) => update(draft.key, { actors })}
                      label={`Ai được chuyển từ ${byId.get(draft.fromStatusId)?.name ?? ""} sang ${byId.get(draft.toStatusId)?.name ?? ""}`}
                    />
                  </div>
                  <div role="cell" className={cell}>
                    {readOnly ? (
                      <span className="text-[13px] text-foreground-muted">
                        {draft.requiresNote ? "Có" : "—"}
                      </span>
                    ) : (
                      <Switch
                        checked={draft.requiresNote}
                        onCheckedChange={(requiresNote) => update(draft.key, { requiresNote })}
                        aria-label="Bắt buộc ghi chú"
                      />
                    )}
                  </div>
                  <div role="cell" className={cn(cell, "justify-center px-1")}>
                    {readOnly ? null : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Xóa luồng chuyển"
                        className="text-foreground-subtle hover:text-danger"
                        onClick={() =>
                          setDrafts((items) => items.filter((item) => item.key !== draft.key))
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 p-3 md:px-4">
        <p className="flex items-start gap-2 text-xs text-foreground-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Quyền vai trò ở trạng thái đích (“Ai được đặt”) vẫn áp dụng; luồng chuyển giới hạn thêm
          theo người liên quan tới task.
        </p>
        <FormAlert>{formError}</FormAlert>
      </div>
      {/* A direct child of the section body so it stays pinned while the rows scroll by. */}
      <AnimatePresence>
        {dirty ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16 }}
            className="sticky bottom-3 z-20 mx-3 mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-surface-raised px-3 py-2.5 shadow-lg md:mx-4"
          >
            <span className="min-w-0 flex-1 text-[13px] max-sm:basis-full">
              Luồng chuyển có thay đổi chưa lưu.
            </span>
            <Button
              variant="ghost"
              className="max-sm:ml-auto"
              onClick={() => {
                setDrafts(toDraftTransitions(workflow.transitions));
                setFormError(null);
              }}
            >
              <Undo2 />
              Hoàn tác
            </Button>
            <Button onClick={save} disabled={replace.isPending}>
              {replace.isPending ? <Spinner /> : <Save />}
              Lưu luồng chuyển
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </SettingsSection>
  );
};

/** A status as text (read-only table). */
const StatusLabel = ({ status }: { status: ProductionStatus | undefined }) =>
  status ? (
    <span className="flex min-h-8 items-center text-[13px]">
      <StatusOption status={status} />
    </span>
  ) : (
    <span className="text-foreground-subtle">—</span>
  );

const StatusSelect = ({
  statuses,
  value,
  onChange,
  label
}: {
  statuses: readonly ProductionStatus[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) => {
  const current = statuses.find((status) => status.id === value);
  return (
    <Select
      items={statuses.map((status) => ({ value: status.id, label: status.name }))}
      value={value}
      onValueChange={(next: string | null) => next && onChange(next)}
    >
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue>{current ? <StatusOption status={current} /> : "—"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {statuses.map((status) => (
          <SelectItem key={status.id} value={status.id}>
            <StatusOption status={status} showCode />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const ActorChips = ({
  value,
  onChange,
  label,
  readOnly = false
}: {
  value: readonly TransitionActor[];
  onChange: (actors: TransitionActor[]) => void;
  label: string;
  /** Only the chosen actors, as plain chips. */
  readOnly?: boolean;
}) =>
  readOnly ? (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {value.map((actor) => (
        <span
          key={actor}
          title={transitionActorHints[actor]}
          className="inline-flex h-7 items-center rounded-full bg-brand-soft px-2.5 text-[11px] font-medium whitespace-nowrap text-brand-text"
        >
          {transitionActorLabels[actor]}
        </span>
      ))}
    </div>
  ) : (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {transitionActors.map((actor) => {
        const pressed = value.includes(actor);
        return (
          <button
            key={actor}
            type="button"
            aria-pressed={pressed}
            title={transitionActorHints[actor]}
            onClick={() =>
              onChange(
                sortActors(pressed ? value.filter((item) => item !== actor) : [...value, actor])
              )
            }
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring max-sm:h-9",
              pressed
                ? "border-transparent bg-brand-soft text-brand-text"
                : "border-dashed border-border-strong text-foreground-subtle hover:text-foreground"
            )}
          >
            {pressed ? (
              <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <Plus className="size-3 opacity-60" aria-hidden="true" />
            )}
            {transitionActorLabels[actor]}
          </button>
        );
      })}
    </div>
  );
