import { Archive, ShieldOff, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/shared/states";
import type { KnowledgeSpaceDetail, KnowledgeTrashedItem } from "@/contracts/knowledge";
import { LoadMoreFooter } from "@/features/knowledge/components/audit/audit-log";
import { uniqueById } from "@/features/knowledge/components/audit/audit-view";
import { ReasonDialog } from "@/features/knowledge/components/reason-dialog";
import { SpaceHeader } from "@/features/knowledge/components/space-header";
import { TrashRetentionNote, TrashRow, TrashSkeleton } from "@/features/knowledge/components/trash/trash-row";
import { restoreDestination, trashReasonMode } from "@/features/knowledge/components/trash/trash-view";
import { isReasonRequired, knowledgeErrorMessage } from "@/features/knowledge/errors";
import { useKnowledgeTrash, usePurgeItem, useRestoreItem } from "@/features/knowledge/hooks";
import type { SpaceUi } from "@/features/knowledge/model/access";
import { pagedErrorKind } from "@/lib/paging";

import { useKnowledgeSpaceOutlet } from "./space-context";

const description = "Mục đã xoá của kho. Khôi phục để đưa mục về đúng chuyên mục cũ.";

/**
 * /k/:spaceId/trash — the space trash (PD-031 §08): deleted items are kept 30 days, restored to their
 * original category, purged for good only by space managers holding `knowledge.delete` (the audit log
 * of a purged item is kept).
 */
export const KnowledgeTrashRoute = () => {
  const { space, ui } = useKnowledgeSpaceOutlet();
  if (!ui.canViewTrash) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <SpaceHeader space={space} ui={ui} title="Thùng rác" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {ui.readOnly ? (
            <EmptyState
              icon={Archive}
              title="Kho đang được lưu trữ"
              description="Kho lưu trữ chỉ xem được. Khôi phục kho trong Cài đặt để dùng lại thùng rác."
            />
          ) : (
            <EmptyState
              icon={ShieldOff}
              title="Bạn không xem được thùng rác của kho này"
              description="Chỉ Thành viên và Quản lý của kho xem và khôi phục được mục đã xoá."
            />
          )}
        </div>
      </div>
    );
  }
  return <TrashScreen space={space} ui={ui} />;
};

type PendingAction = { kind: "restore" | "purge"; item: KnowledgeTrashedItem; forceReason: boolean };

const TrashScreen = ({ space, ui }: { space: KnowledgeSpaceDetail; ui: SpaceUi }) => {
  const navigate = useNavigate();
  const trash = useKnowledgeTrash(space.id);
  const items = useMemo(() => uniqueById(trash.data?.pages), [trash.data]);
  const errorKind = pagedErrorKind(trash);
  const restore = useRestoreItem(space.id);
  const purge = usePurgeItem(space.id);
  // The last action stays set while the dialog animates out (its wording must not flip).
  const [action, setAction] = useState<PendingAction | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = action?.kind === "purge" ? purge.isPending : restore.isPending;

  const start = (kind: PendingAction["kind"], item: KnowledgeTrashedItem) => {
    setError(null);
    setAction({ kind, item, forceReason: false });
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const confirm = (reason: string | undefined) => {
    if (!action) return;
    const { kind, item } = action;
    const variables = { itemId: item.id, ...(reason ? { reason } : {}) };
    const onError = (cause: unknown) => {
      if (isReasonRequired(cause)) setAction({ ...action, forceReason: true });
      setError(
        knowledgeErrorMessage(cause, kind === "restore" ? "Không khôi phục được mục." : "Không xoá vĩnh viễn được mục.")
      );
    };
    setError(null);
    if (kind === "restore") {
      restore.mutate(variables, {
        onSuccess: () => {
          close();
          toast.success(`Đã khôi phục “${item.title}”`, {
            description: `Mục đã trở lại ${restoreDestination(space.categories, item.categoryId)}.`,
            action: { label: "Mở mục", onClick: () => void navigate(`/k/${space.id}/i/${item.id}`) }
          });
        },
        onError
      });
    } else {
      purge.mutate(variables, {
        onSuccess: () => {
          close();
          toast.success(`Đã xoá vĩnh viễn “${item.title}”`, { description: "Nhật ký của mục vẫn được giữ." });
        },
        onError
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SpaceHeader space={space} ui={ui} title="Thùng rác" description={description} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4 md:px-6 md:py-5">
          <TrashRetentionNote canPurge={ui.canPurge} />
          {trash.isPending ? (
            <TrashSkeleton />
          ) : errorKind === "initial" ? (
            <ErrorState error={trash.error} onRetry={() => void trash.refetch()} retrying={trash.isFetching} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Trash2}
              title="Thùng rác trống"
              description="Mục bị xoá sẽ nằm ở đây 30 ngày để bạn khôi phục khi cần."
            />
          ) : (
            <>
              <ul className="divide-y overflow-hidden rounded-xl border bg-surface" aria-label="Mục đã xoá">
                {items.map((item) => (
                  <TrashRow
                    key={item.id}
                    item={item}
                    spaceId={space.id}
                    categories={space.categories}
                    canRestore={item.canRestore}
                    canPurge={ui.canPurge && item.canPurge}
                    restoring={restore.isPending && restore.variables?.itemId === item.id}
                    purging={purge.isPending && purge.variables?.itemId === item.id}
                    onRestore={() => start("restore", item)}
                    onPurge={() => start("purge", item)}
                  />
                ))}
              </ul>
              <LoadMoreFooter
                hasMore={trash.hasNextPage}
                loading={trash.isFetchingNextPage}
                failed={errorKind === "next"}
                onLoad={() => void trash.fetchNextPage()}
              />
            </>
          )}
        </div>
      </div>
      <ReasonDialog
        open={open && action !== null}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title={action?.kind === "purge" ? "Xoá vĩnh viễn mục này?" : "Khôi phục mục này?"}
        description={
          action ? (
            action.kind === "purge" ? (
              <>
                <strong className="font-medium text-foreground">“{action.item.title}”</strong> cùng mọi phiên bản, bình
                luận và tệp đính kèm sẽ bị xoá vĩnh viễn, không thể hoàn tác. Nhật ký của mục vẫn được giữ lại.
              </>
            ) : (
              <>
                <strong className="font-medium text-foreground">“{action.item.title}”</strong> sẽ trở lại{" "}
                {restoreDestination(space.categories, action.item.categoryId)}, với nội dung và lịch sử như trước khi
                xoá.
              </>
            )
          ) : undefined
        }
        confirmLabel={action?.kind === "purge" ? "Xoá vĩnh viễn" : "Khôi phục"}
        destructive={action?.kind === "purge"}
        reason={action ? trashReasonMode(action.kind, action.item.importance, action.forceReason) : "none"}
        pending={pending}
        error={error}
        onConfirm={confirm}
      />
    </div>
  );
};
