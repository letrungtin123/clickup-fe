import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { QueryValue } from "@/lib/api/client";

import { scoreErrorMessage } from "../errors";
import { downloadExport } from "../export";

/** "Xuất Excel": fetches the export with the session and saves it (errors as toasts). */
export const ExportButton = ({
  path,
  query,
  extra,
  fallbackName,
  size = "default",
  compactOnPhone = true
}: {
  path: string;
  query: Record<string, QueryValue>;
  /** Repeated parameters (e.g. peopleFilterPairs). */
  extra?: readonly [string, string][];
  fallbackName: string;
  size?: "default" | "sm";
  /** Icon only on phones (label kept for assistive tech). */
  compactOnPhone?: boolean;
}) => {
  const [pending, setPending] = useState(false);
  const run = async () => {
    setPending(true);
    try {
      const name = await downloadExport(path, query, fallbackName, extra);
      toast.success(`Đã tải ${name}`);
    } catch (error) {
      toast.error(scoreErrorMessage(error, "Không xuất được tệp Excel. Thử lại sau."));
    } finally {
      setPending(false);
    }
  };
  return (
    <Button variant="outline" size={size} disabled={pending} onClick={() => void run()}>
      {pending ? <Spinner /> : <Download />}
      <span className={compactOnPhone ? "max-sm:sr-only" : undefined}>Xuất Excel</span>
    </Button>
  );
};
