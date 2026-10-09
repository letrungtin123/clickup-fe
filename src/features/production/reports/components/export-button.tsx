import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { reportErrorMessage } from "../errors";
import { downloadExport, type ExportRequest } from "../export";

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * "Xuất Excel": fetches the export with the session and saves it (production-reports contract).
 * Errors (JSON before streaming) become toasts with the API's Vietnamese wording.
 */
export const ExcelExportButton = ({
  request,
  fallbackName,
  disabled = false,
  size = "default",
  variant = "outline",
  compactOnPhone = true,
  label = "Xuất Excel"
}: {
  request: ExportRequest;
  fallbackName: string;
  disabled?: boolean;
  size?: "default" | "sm";
  variant?: "outline" | "ghost" | "secondary";
  /** Icon only on phones (label kept for assistive tech). */
  compactOnPhone?: boolean;
  label?: string;
}) => {
  const [pending, setPending] = useState(false);
  const run = async () => {
    setPending(true);
    try {
      const file = await downloadExport(request, fallbackName);
      toast.success(`Đã tải ${file.name}`, { description: sizeLabel(file.size) });
    } catch (error) {
      toast.error(reportErrorMessage(error, "Không xuất được tệp Excel. Thử lại sau."));
    } finally {
      setPending(false);
    }
  };
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled || pending}
      onClick={() => void run()}
      aria-busy={pending}
    >
      {pending ? <Spinner /> : <Download />}
      <span className={compactOnPhone ? "max-sm:sr-only" : undefined}>
        {pending ? "Đang xuất…" : label}
      </span>
    </Button>
  );
};
