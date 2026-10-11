import { useId } from "react";
import { toast } from "sonner";

import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { KnowledgeSpaceDetail } from "@/contracts/knowledge";

import { knowledgeErrorMessage } from "../../errors";
import { useUpdateSpace } from "../../hooks";
import { SettingsSection } from "./settings-section";

/** "Bước duyệt" (PD-031 §04): one switch, saved as soon as it flips. */
export const SpaceApprovalSection = ({ space }: { space: KnowledgeSpaceDetail }) => {
  const id = useId();
  const update = useUpdateSpace(space.id);
  // Show the requested state while it is being saved; the refetched space takes over afterwards.
  const checked = update.isPending
    ? (update.variables.approvalRequired ?? space.approvalRequired)
    : space.approvalRequired;

  const toggle = (next: boolean) =>
    update.mutate(
      { approvalRequired: next },
      {
        onSuccess: () => toast.success(next ? "Đã bật bước duyệt" : "Đã tắt bước duyệt"),
        onError: (error) =>
          toast.error(knowledgeErrorMessage(error, "Không đổi được bước duyệt. Vui lòng thử lại."))
      }
    );

  return (
    <SettingsSection
      id={`${id}-approval`}
      title="Bước duyệt"
      description="Kiểm soát ai được đưa thông tin thành chính thức."
    >
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/40 p-3 has-data-disabled:cursor-default">
        <Switch
          checked={checked}
          disabled={update.isPending}
          onCheckedChange={toggle}
          aria-describedby={`${id}-approval-help`}
          className="mt-0.5"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">Bật bước duyệt</span>
          <span
            id={`${id}-approval-help`}
            className="text-xs leading-relaxed text-foreground-muted"
          >
            Chỉ Quản lý kho mới chuyển được mục sang Đang áp dụng hoặc Hết hiệu lực, và sửa mục đã
            ban hành. Thành viên soạn xong thì để mục ở một trạng thái Bản nháp (ví dụ “Chờ duyệt”)
            để Quản lý duyệt.
          </span>
        </span>
        {update.isPending ? (
          <Spinner className="mt-0.5 size-4 shrink-0 text-foreground-subtle" />
        ) : null}
      </label>
    </SettingsSection>
  );
};
