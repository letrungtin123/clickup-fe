import { FileSpreadsheet } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import {
  downloadLeaveExport,
  LEAVE_EXPORT_HINT,
  leaveExportErrorMessage,
  leaveExportScope
} from "../export";
import type { LeaveWindow } from "../range";

/**
 * "Xuất Excel" of the Lịch nghỉ page (PD-057, Quản trị only — the caller renders it for ADMIN): the
 * payroll attendance workbook for the CURRENT filter (shown month or chosen range, plus the team).
 * Disabled while the range is invalid. What the file holds is the tooltip and the button's
 * accessible description.
 */
export const LeaveExportButton = ({
  span,
  teamId,
  className
}: {
  /** The filter's days; null while the range is incomplete or invalid. */
  span: LeaveWindow | null;
  teamId: string | null;
  className?: string;
}) => {
  const hintId = useId();
  const [pending, setPending] = useState(false);
  const scope = leaveExportScope(span);

  const run = async () => {
    if (!span || pending) return;
    setPending(true);
    try {
      const name = await downloadLeaveExport(span, teamId);
      toast.success("Đã xuất bảng chấm công nghỉ phép", { description: name });
    } catch (error) {
      toast.error(leaveExportErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              className={className}
              disabled={!span || pending}
              aria-busy={pending || undefined}
              aria-describedby={hintId}
              onClick={() => void run()}
            />
          }
        >
          {pending ? <Spinner /> : <FileSpreadsheet />}
          Xuất Excel
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="flex-col items-start gap-0.5">
          <span className="font-medium">{scope}</span>
          <span>{LEAVE_EXPORT_HINT}</span>
        </TooltipContent>
      </Tooltip>
      <span id={hintId} className="sr-only">
        {scope}. {LEAVE_EXPORT_HINT}
      </span>
    </>
  );
};
