import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { downloadExport } from "@/features/production/reports/export";

import { knowledgeApi } from "../../api";
import { knowledgeErrorMessage } from "../../errors";
import type { ApiQuery } from "../../model/filters";
import { auditExportFileName, isExportUnsupported } from "./audit-view";

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * "Xuất Excel" of the filtered log (GET …/audit/export, same filters as the screen). The file is fetched
 * with the session, checked to be a spreadsheet and saved — the page keeps working when the server does
 * not offer the export yet.
 */
export const AuditExportButton = ({
  spaceId,
  spaceName,
  query,
  disabled = false
}: {
  spaceId: string;
  spaceName: string;
  /** The audit query of the current filters (no cursor). */
  query: ApiQuery;
  disabled?: boolean;
}) => {
  const [pending, setPending] = useState(false);

  const run = async () => {
    if (pending) return;
    setPending(true);
    try {
      const file = await downloadExport(
        { method: "GET", path: knowledgeApi.auditExportPath(spaceId, query) },
        auditExportFileName(spaceName)
      );
      toast.success(`Đã tải ${file.name}`, { description: sizeLabel(file.size) });
    } catch (error) {
      toast.error(
        isExportUnsupported(error)
          ? "Máy chủ chưa hỗ trợ xuất Excel nhật ký kho."
          : knowledgeErrorMessage(error, "Không xuất được tệp Excel. Thử lại sau.")
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={() => void run()}
    >
      {pending ? <Spinner /> : <Download />}
      <span className="max-sm:sr-only">{pending ? "Đang xuất…" : "Xuất Excel"}</span>
    </Button>
  );
};
