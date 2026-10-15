import { cn } from "cn";
import { Archive, ArchiveRestore, BadgeCheck, Info, Trash2, Workflow } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Process } from "@/contracts/production-catalog";
import { hasDuplicateName, nextSortOrder } from "@/features/production/catalog";
import {
  ActiveState,
  ArchivedToggle,
  ConfirmDialog,
  InfoNote,
  InlineText,
  PageIntro,
  QuickAdd,
  RowMenu,
  RowsSkeleton,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { SortableList } from "@/features/production/components/sortable-list";
import { productionErrorMessage, toastProductionError } from "@/features/production/errors";
import {
  useProcesses,
  useProcessMutations,
  useReorderProcesses
} from "@/features/production/hooks";

const nameConflict = "Đã có quy trình cùng tên (không phân biệt hoa thường).";
const qcConflict = "Chỉ được có một quy trình QC đang dùng. Bỏ QC ở quy trình kia trước.";

/**
 * Retouch processes shared by every project (SPEC Phase 1). Exactly one active process is the QC
 * process (Checking, PD-037): a normal work line done by the QC person, whose points are recorded at
 * its Done at the project's Checking rate (Khoán points on a Khoán shift). A process nobody has used
 * yet can be deleted; once tasks, rates or scores refer to it the API answers 409 PROCESS_IN_USE and
 * it can only be archived.
 */
export const ProductionProcessesRoute = () => {
  const processes = useProcesses();
  const mutations = useProcessMutations();
  const reorder = useReorderProcesses();
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [qcSwitch, setQcSwitch] = useState<{ from: Process; to: Process } | null>(null);
  const [switching, setSwitching] = useState(false);
  const [deleting, setDeleting] = useState<Process | null>(null);
  // Keep the wording while the dialog animates out.
  const [shownDelete, setShownDelete] = useState<Process | null>(null);
  if (deleting && deleting !== shownDelete) setShownDelete(deleting);

  const items = useMemo(() => processes.data?.items ?? [], [processes.data]);
  const active = useMemo(
    () => items.filter((item) => item.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [items]
  );
  const archived = items.filter((item) => !item.active);
  const currentQc = active.find((item) => item.isQc) ?? null;
  const validate = (exceptId: string | null) => (name: string) =>
    hasDuplicateName(items, name, exceptId) ? nameConflict : null;

  const update = (
    process: Process,
    patch: Partial<Pick<Process, "name" | "isQc" | "active">>,
    message?: string
  ) =>
    mutations.update
      .mutateAsync({
        id: process.id,
        input: patch
      })
      .then(
        () => {
          setEditingId(null);
          if (message) toast.success(message);
          return true;
        },
        (error: unknown) => {
          toastProductionError(error, {
            conflict: patch.isQc || patch.active ? qcConflict : nameConflict
          });
          return false;
        }
      );

  const setQc = (process: Process, isQc: boolean) => {
    if (isQc && currentQc && currentQc.id !== process.id) {
      setQcSwitch({ from: currentQc, to: process });
      return;
    }
    void update(
      process,
      { isQc },
      isQc ? `${process.name} là quy trình QC` : `${process.name} không còn là quy trình QC`
    );
  };

  /** Moves the QC flag: the old process first (single-QC index), then the new one. */
  const confirmSwitch = async () => {
    if (!qcSwitch) return;
    setSwitching(true);
    const cleared = await update(qcSwitch.from, { isQc: false });
    const set =
      cleared && (await update(qcSwitch.to, { isQc: true }, `${qcSwitch.to.name} là quy trình QC`));
    setSwitching(false);
    if (set || !cleared) setQcSwitch(null);
  };

  /** Hard delete: only a process nothing refers to; the 409 message says to archive instead. */
  const confirmDelete = () => {
    if (!deleting) return;
    const target = deleting;
    mutations.remove.mutate(target.id, {
      onSuccess: () => {
        setDeleting(null);
        if (editingId === target.id) setEditingId(null);
        toast.success(`Đã xoá quy trình ${target.name}`);
      },
      onError: (error) => {
        setDeleting(null);
        toastProductionError(error);
      }
    });
  };

  const row = (process: Process, handle?: ReactNode) => (
    <div
      className={cn("flex items-center gap-2 px-3 py-2 md:px-4", !process.active && "bg-muted/30")}
    >
      {handle ?? <span className="size-6 shrink-0" aria-hidden="true" />}
      {editingId === process.id ? (
        <InlineText
          value={process.name}
          label={`Tên mới cho quy trình ${process.name}`}
          maxLength={120}
          validate={validate(process.id)}
          pending={mutations.update.isPending}
          onSubmit={(name) => void update(process, { name })}
          onCancel={() => setEditingId(null)}
        />
      ) : (
        <button
          type="button"
          title="Bấm để đổi tên"
          onClick={() => setEditingId(process.id)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded text-left text-[13px] font-medium outline-none hover:text-brand-text focus-visible:ring-2 focus-visible:ring-ring",
            !process.active && "text-foreground-muted"
          )}
        >
          <span className="truncate">{process.name}</span>
          {process.isQc ? (
            <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 text-[11px] font-medium text-success">
              <BadgeCheck className="size-3" aria-hidden="true" />
              QC
            </span>
          ) : null}
        </button>
      )}
      {process.active ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <label className="hidden shrink-0 cursor-pointer items-center gap-2 text-xs text-foreground-muted sm:flex" />
            }
          >
            <Switch
              size="sm"
              checked={process.isQc}
              onCheckedChange={(checked) => setQc(process, checked)}
              aria-label={`Quy trình QC: ${process.name}`}
            />
            QC
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            Task của người QC: điểm ghi khi task Done, theo đơn giá của quy trình này trong dự
            án (ca Khoán: điểm Khoán)
          </TooltipContent>
        </Tooltip>
      ) : (
        <ActiveState active={false} className="hidden sm:inline-flex" />
      )}
      <RowMenu
        label={process.name}
        active={process.active}
        onEdit={() => setEditingId(process.id)}
        extra={
          <>
            {process.active ? (
              <DropdownMenuItem onClick={() => setQc(process, !process.isQc)}>
                <BadgeCheck />
                {process.isQc ? "Bỏ đánh dấu QC" : "Đặt làm quy trình QC"}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                void update(
                  process,
                  { active: !process.active },
                  process.active ? `Đã lưu trữ ${process.name}` : `Đã khôi phục ${process.name}`
                )
              }
            >
              {process.active ? <Archive /> : <ArchiveRestore />}
              {process.active ? "Lưu trữ" : "Khôi phục"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(process)}>
              <Trash2 />
              Xoá
            </DropdownMenuItem>
          </>
        }
      />
    </div>
  );

  return (
    <SettingsPage>
      <PageIntro slug="processes" />
      <InfoNote icon={BadgeCheck} tone="brand">
        Quy trình QC (thường là “Checking”) là một task bình thường do người QC làm: điểm QC
        được ghi khi task Checking chuyển Done, theo đơn giá Checking của dự án; làm trong ca Khoán
        thì là điểm Khoán. Luôn có đúng một quy trình đang dùng là QC.
      </InfoNote>
      <SettingsSection
        title="Danh sách quy trình"
        description="Kéo để sắp xếp thứ tự hiển thị trong bảng đơn giá và form chia task."
        actions={
          <ArchivedToggle
            checked={showArchived}
            onChange={setShowArchived}
            count={archived.length}
          />
        }
      >
        <QuickAdd
          label="Tên quy trình mới"
          placeholder="Tên quy trình, ví dụ: Retouch nhẹ"
          buttonLabel="Thêm quy trình"
          maxLength={120}
          validate={validate(null)}
          onAdd={(name) =>
            mutations.create.mutateAsync({ name, sortOrder: nextSortOrder(active) }).then(
              () => {
                toast.success(`Đã thêm quy trình ${name}`);
                return true;
              },
              (error: unknown) => {
                toastProductionError(error, { conflict: nameConflict });
                return false;
              }
            )
          }
        />
        {processes.isPending ? (
          <RowsSkeleton rows={5} />
        ) : processes.isError ? (
          <ErrorState size="sm" error={processes.error} onRetry={() => void processes.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Workflow}
            title="Chưa có quy trình"
            description="Thêm các quy trình retouch (ví dụ Retouch thường, Cắt nền, Kiểm tra) rồi nhập đơn giá theo dự án."
          />
        ) : (
          <>
            <SortableList
              aria-label="Quy trình đang dùng"
              items={active}
              disabled={reorder.isPending}
              onReorder={(ordered) =>
                reorder.mutate(ordered, {
                  onError: (error) =>
                    toast.error(
                      productionErrorMessage(error, { fallback: "Không lưu được thứ tự." })
                    )
                })
              }
              renderItem={(process, handle) =>
                row(process, handle({ label: `Kéo để sắp xếp ${process.name}` }))
              }
            />
            {showArchived && archived.length > 0 ? (
              <ul aria-label="Quy trình đã lưu trữ" className="divide-y border-t">
                {archived.map((process) => (
                  <li key={process.id}>{row(process)}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
        {!processes.isPending && items.length > 0 && !currentQc ? (
          <div className="border-t p-3">
            <InfoNote icon={Info} tone="warning">
              Chưa có quy trình QC. Đánh dấu một quy trình (thường là “Checking”) là QC để giao task
              Checking cho người QC và ghi điểm QC khi task đó Done.
            </InfoNote>
          </div>
        ) : null}
      </SettingsSection>

      <ConfirmDialog
        open={qcSwitch !== null}
        onOpenChange={(open) => !open && !switching && setQcSwitch(null)}
        title={`Chuyển QC sang ${qcSwitch?.to.name ?? ""}?`}
        description={`Chỉ một quy trình được là QC. ${qcSwitch?.from.name ?? ""} sẽ không còn là quy trình QC; điểm đã ghi không thay đổi.`}
        confirmLabel="Chuyển QC"
        pending={switching}
        onConfirm={() => void confirmSwitch()}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !mutations.remove.isPending && setDeleting(null)}
        title={`Xoá quy trình ${shownDelete?.name ?? ""}?`}
        description={
          <>
            Chỉ xoá được quy trình chưa từng được dùng (chưa có task, đơn giá hay điểm nào). Nếu đã
            dùng, hãy Lưu trữ để tắt quy trình mà vẫn giữ lịch sử điểm.
            {shownDelete?.isQc && shownDelete.active
              ? " Đây đang là quy trình QC: sau khi xoá, hãy đánh dấu một quy trình khác là QC."
              : null}
          </>
        }
        confirmLabel="Xoá quy trình"
        destructive
        pending={mutations.remove.isPending}
        onConfirm={confirmDelete}
      />
    </SettingsPage>
  );
};
