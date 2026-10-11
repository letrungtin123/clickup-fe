import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { KnowledgeSpace } from "@/contracts/knowledge";

import { knowledgeErrorMessage } from "../../errors";
import { useArchiveSpace } from "../../hooks";
import { dateToDay, formatDay } from "../../model/dates";

/**
 * "Kho đã lưu trữ — chỉ xem": top of every screen of an archived space (space page, item page, settings).
 * Its members and org admins still read everything; nobody adds, edits, comments or changes settings until
 * it is restored. "Khôi phục kho" only for `capabilities.canArchive` (Quản lý + knowledge.delete).
 */
export const ArchivedSpaceNotice = ({
  space,
  canRestore
}: {
  space: Pick<KnowledgeSpace, "id" | "name" | "archivedAt">;
  canRestore: boolean;
}) => {
  const archive = useArchiveSpace();
  const archivedOn = space.archivedAt ? formatDay(dateToDay(new Date(space.archivedAt))) : null;

  const restore = async () => {
    try {
      await archive.mutateAsync({ spaceId: space.id, archived: false });
      toast.success(`Đã khôi phục kho “${space.name}”`);
    } catch (error) {
      toast.error(knowledgeErrorMessage(error, "Không khôi phục được kho. Vui lòng thử lại."));
    }
  };

  return (
    <div
      role="note"
      aria-label="Kho đã lưu trữ"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3"
    >
      <Archive
        className="size-4 shrink-0 self-start text-warning max-sm:mt-0.5 sm:self-center"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
        <p className="text-[13px] font-semibold text-foreground">Kho đã lưu trữ — chỉ xem</p>
        <p className="text-[13px] leading-relaxed text-foreground-muted">
          {archivedOn ? `Lưu trữ ngày ${archivedOn}. ` : ""}
          Thành viên của kho vẫn đọc được mọi mục, phiên bản và bình luận; không ai thêm, sửa mục,
          bình luận hay đổi cài đặt.{" "}
          {canRestore ? "Khôi phục để mở lại." : "Cần sửa, hãy nhờ Quản lý kho khôi phục."}
        </p>
      </div>
      {canRestore ? (
        <Button
          size="sm"
          variant="outline"
          className="max-sm:ml-7"
          disabled={archive.isPending}
          onClick={() => void restore()}
        >
          {archive.isPending ? <Spinner /> : <ArchiveRestore />}
          Khôi phục kho
        </Button>
      ) : null}
    </div>
  );
};
