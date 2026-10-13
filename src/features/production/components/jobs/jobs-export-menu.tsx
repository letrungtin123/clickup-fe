import { ChevronDown, Download, FileSpreadsheet, Rows3 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { QueryValue } from "@/lib/api/client";

import { queryPath } from "../../list-filters";
import { reportErrorMessage } from "../../reports/errors";
import { downloadExport } from "../../reports/export";
import { touchTargets } from "../../ui";

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const exportKinds = {
  jobs: { view: undefined, fallbackName: "Danh sách job.xlsx" },
  worklog: { view: "worklog", fallbackName: "Work log.xlsx" }
} as const;

/**
 * "Xuất Excel" of the job list (GET /production/jobs/export, same filters and visibility as the list): the list
 * itself (one row per job) or the work log (`view=worklog`: one row per line with the work-log Excel columns,
 * PD-035). Icon only on phones, like the other export buttons.
 */
export const JobsExportMenu = ({
  query,
  disabled = false
}: {
  /** The list's API query (jobQueryFromFilters); tags / custom-field values repeat their parameter. */
  query: Record<string, QueryValue>;
  disabled?: boolean;
}) => {
  const [pending, setPending] = useState(false);
  const run = async (kind: keyof typeof exportKinds) => {
    const { view, fallbackName } = exportKinds[kind];
    setPending(true);
    try {
      const file = await downloadExport(
        { method: "GET", path: queryPath("/production/jobs/export", { ...query, view }) },
        fallbackName
      );
      toast.success(`Đã tải ${file.name}`, { description: sizeLabel(file.size) });
    } catch (error) {
      toast.error(reportErrorMessage(error, "Không xuất được tệp Excel. Thử lại sau."));
    } finally {
      setPending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled || pending}
            aria-busy={pending}
          />
        }
      >
        {pending ? <Spinner /> : <Download />}
        <span className="max-sm:sr-only">{pending ? "Đang xuất…" : "Xuất Excel"}</span>
        <ChevronDown className="text-muted-foreground max-sm:hidden" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={`w-72 max-w-[calc(100vw-2rem)] ${touchTargets}`}>
        <DropdownMenuItem onClick={() => void run("jobs")} className="items-start py-2">
          <FileSpreadsheet className="mt-0.5" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium">Danh sách job</span>
            <span className="text-xs text-pretty text-foreground-muted">
              Mỗi job một hàng: gói, tiến độ, người làm, trễ.
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void run("worklog")} className="items-start py-2">
          <Rows3 className="mt-0.5" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium">Work log (từng dòng)</span>
            <span className="text-xs text-pretty text-foreground-muted">
              Mỗi dòng công việc một hàng, đúng các cột của file work log.
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
