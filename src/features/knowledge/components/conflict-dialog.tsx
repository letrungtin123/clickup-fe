import { ClipboardCopy, GitCompareArrows, Save, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { KnowledgeItemDetail } from "@/contracts/knowledge";
import { fullDateTime, relativeTime } from "@/features/tasks/time";

import type { VersionSnapshot } from "../model/diff";
import { VersionDiff } from "./diff-view";

/**
 * "Có người vừa lưu bản mới" (PD-031 §06): a save was refused because someone saved a newer version.
 * Never overwrites silently — the writer chooses:
 *   Xem khác biệt              compare the latest saved version with what they wrote;
 *   Giữ bản của tôi …          save their text as the next version (the other version stays in history);
 *   Chép nội dung của tôi      copy their text and reload the editor from the latest version.
 */
export const ConflictDialog = ({
  open,
  latest,
  mine,
  saving,
  onKeepMine,
  onCopyMine,
  onClose
}: {
  open: boolean;
  /** Fresh detail of the item (null while it loads). */
  latest: KnowledgeItemDetail | null;
  mine: VersionSnapshot;
  saving: boolean;
  onKeepMine: () => void;
  onCopyMine: () => void;
  onClose: () => void;
}) => {
  const [showDiff, setShowDiff] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) {
          setShowDiff(false);
          onClose();
        }
      }}
    >
      <DialogContent mobileLayout={showDiff ? "fullscreen" : "sheet"} className="kb-touch flex max-h-[min(90dvh,52rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="gap-2 px-5 pt-5 pb-3 pr-12">
          <DialogTitle className="flex items-center gap-2 text-[16px] font-semibold">
            <TriangleAlert className="size-5 text-warning" aria-hidden="true" />
            Có người vừa lưu bản mới
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Phiên bản bạn đang sửa đã cũ. Nội dung của bạn chưa bị mất và không có gì bị ghi đè — hãy chọn cách xử lý.
          </DialogDescription>
          {latest ? (
            <div className="mt-1 flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2 text-[13px]">
              {latest.updatedBy ? <UserAvatar user={latest.updatedBy} size="sm" /> : null}
              <span className="min-w-0 flex-1">
                <span className="font-medium">{latest.updatedBy?.displayName ?? "Ai đó"}</span> đã lưu{" "}
                <span className="font-mono font-medium">v{latest.version}</span>{" "}
                <time dateTime={latest.updatedAt} title={fullDateTime(latest.updatedAt)} className="text-foreground-muted">
                  {relativeTime(latest.updatedAt)}
                </time>
              </span>
            </div>
          ) : (
            <Skeleton className="mt-1 h-10 w-full rounded-lg" />
          )}
        </DialogHeader>

        {showDiff ? (
          <div className="min-h-0 flex-1 overflow-y-auto border-t px-5 py-4">
            <p className="mb-3 text-xs text-foreground-muted">
              So với <span className="font-mono">v{latest?.version}</span>: phần xanh là của bạn thêm, phần đỏ là có trong bản mới nhưng bạn không có.
            </p>
            {latest ? (
              <VersionDiff before={{ title: latest.title, summary: latest.summary, body: latest.body }} after={mine} />
            ) : (
              <Skeleton className="h-32 w-full" />
            )}
          </div>
        ) : null}

        <DialogFooter className="mx-0 mb-0 flex-col gap-2 px-5 py-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="ghost" disabled={!latest || saving} onClick={() => setShowDiff((value) => !value)}>
            <GitCompareArrows />
            {showDiff ? "Ẩn khác biệt" : "Xem khác biệt"}
          </Button>
          <Button variant="outline" disabled={!latest || saving} onClick={onCopyMine}>
            <ClipboardCopy />
            Chép nội dung của tôi
          </Button>
          <Button disabled={!latest || saving} onClick={onKeepMine}>
            {saving ? <Spinner /> : <Save />}
            Giữ bản của tôi thành phiên bản mới
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
