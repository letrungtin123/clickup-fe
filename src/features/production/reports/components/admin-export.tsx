import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { AdminDashboard } from "@/contracts/production-reports";

import { adminDashboardCsv, adminDashboardCsvName } from "../dashboard-export";
import { reportErrorMessage } from "../errors";
import { downloadExport, saveBlob, type ExportRequest } from "../export";

/**
 * "Xuất" on Quản trị số liệu (PLAN §7 "xuất CSV"): one CSV with the six cards' figures (built from the
 * dashboard on screen), or the detailed Excel of one card — its report-builder config through POST
 * /production/reports/export, and the "% đạt KPI" card through the KPI report export (% per person and
 * "Tổng theo team").
 */
export const AdminExportMenu = ({
  data,
  timeZone
}: {
  data: AdminDashboard | undefined;
  timeZone: string;
}) => {
  const [pending, setPending] = useState<string | null>(null);

  const run = async (id: string, task: () => Promise<string>) => {
    setPending(id);
    try {
      toast.success(`Đã tải ${await task()}`);
    } catch (error) {
      toast.error(reportErrorMessage(error, "Không xuất được tệp. Thử lại sau."));
    } finally {
      setPending(null);
    }
  };

  const csv = () =>
    run("csv", () => {
      if (!data) throw new Error("no data");
      const name = adminDashboardCsvName(data.today);
      saveBlob(
        new Blob([`\uFEFF${adminDashboardCsv(data, timeZone)}`], {
          type: "text/csv;charset=utf-8"
        }),
        name
      );
      return Promise.resolve(name);
    });

  const excel = (id: string, request: ExportRequest, name: string) =>
    run(id, async () => (await downloadExport(request, name)).name);

  const cards = data?.cards;
  const reportCards = cards
    ? ([
        ["pointsToday", cards.pointsToday],
        ["lateJobs", cards.lateJobs],
        ["fbRateByUser", cards.fbRateByUser],
        ["fbRateByClient", cards.fbRateByClient],
        ["productivityByShift", cards.productivityByShift]
      ] as const)
    : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            disabled={!data || pending !== null}
            aria-busy={pending !== null}
          />
        }
      >
        {pending ? <Spinner /> : <Download />}
        <span className="max-md:sr-only">{pending ? "Đang xuất…" : "Xuất"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuItem onClick={() => void csv()} className="items-start py-2">
          <FileText className="mt-0.5" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium">CSV · số liệu cả 6 thẻ</span>
            <span className="text-xs text-pretty text-foreground-muted">
              Một tệp, mỗi thẻ một khối: đúng các con số đang hiện trên trang.
            </span>
          </span>
        </DropdownMenuItem>
        {cards ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Excel chi tiết từng thẻ</DropdownMenuLabel>
              {reportCards.map(([id, card]) => (
                <DropdownMenuItem
                  key={id}
                  onClick={() =>
                    void excel(
                      id,
                      {
                        method: "POST",
                        path: "/production/reports/export",
                        body: { config: card.config, name: card.title.slice(0, 120) }
                      },
                      card.title
                    )
                  }
                >
                  <FileSpreadsheet />
                  <span className="min-w-0 truncate">{card.title}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() =>
                  void excel(
                    "kpi",
                    {
                      method: "GET",
                      path: "/production/kpi/export",
                      query: { from: cards.kpiAttainment.period, to: cards.kpiAttainment.period }
                    },
                    cards.kpiAttainment.title
                  )
                }
              >
                <FileSpreadsheet />
                <span className="min-w-0 truncate">{cards.kpiAttainment.title} theo người</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
