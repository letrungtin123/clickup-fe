import { cn } from "cn";
import { BadgeCheck, Info, Workflow } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
 * process (Checking): its credit is what QC earns per checked image (PD-010).
 */
export const ProductionProcessesRoute = () => {
  const processes = useProcesses();
  const mutations = useProcessMutations();
  const reorder = useReorderProcesses();
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [qcSwitch, setQcSwitch] = useState<{ from: Process; to: Process } | null>(null);
  const [switching, setSwitching] = useState(false);

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
          <TooltipContent>
            Credit của quy trình QC là điểm QC nhận cho mỗi tấm được kiểm
          </TooltipContent>
        </Tooltip>
      ) : (
        <ActiveState active={false} className="hidden sm:inline-flex" />
      )}
      <RowMenu
        label={process.name}
        active={process.active}
        onEdit={() => setEditingId(process.id)}
        onToggleActive={() =>
          void update(
            process,
            { active: !process.active },
            process.active ? `Đã lưu trữ ${process.name}` : `Đã khôi phục ${process.name}`
          )
        }
        extra={
          process.active ? (
            <DropdownMenuItem onClick={() => setQc(process, !process.isQc)}>
              <BadgeCheck />
              {process.isQc ? "Bỏ đánh dấu QC" : "Đặt làm quy trình QC"}
            </DropdownMenuItem>
          ) : null
        }
      />
    </div>
  );

  return (
    <SettingsPage>
      <PageIntro slug="processes" />
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
              Chưa có quy trình QC. Đánh dấu một quy trình (thường là “Checking”) để hệ thống tính
              điểm QC.
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
    </SettingsPage>
  );
};
