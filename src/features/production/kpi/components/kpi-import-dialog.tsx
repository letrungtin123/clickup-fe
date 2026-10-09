import { cn } from "cn";
import { motion } from "motion/react";
import {
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  FileUp,
  RotateCcw,
  TriangleAlert
} from "lucide-react";
import { useId, useRef, useState } from "react";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { KpiPeriodType, KpiTargetImportResult } from "@/contracts/production-scores";

import { downloadText } from "../../components/credit/download";
import { FormAlert, InfoNote } from "../../components/settings-kit";
import { countDataRows, normalizeCreditCsv, sourceLine } from "../../credit-matrix";
import { scoreErrorMessage } from "../../scores/errors";
import { formatPeriod, periodsBetween, rollupLabel } from "../../scores/periods";
import { sheetOnPhone } from "../../ui";
import { useImportKpiTargets } from "../hooks";
import { hasKpiHeader, isAlignedPeriod, KPI_CSV_HEADER, periodTypeLabels } from "../matrix";

const MAX_CSV_CHARS = 1_000_000;
// Obviously fake sample rows: the template must never carry real people.
const TEMPLATE = `${KPI_CSV_HEADER}\r\nnhanvien.a@vidu.local,2400\r\nleader.b@vidu.local,1848\r\n`;

type Source = "file" | "paste";

const optionLabel = (periodType: KpiPeriodType, period: string) => {
  if (periodType === "MONTH") return `Kỳ ${formatPeriod(period)}`;
  if (periodType === "YEAR") return rollupLabel(period.slice(0, 4));
  return rollupLabel(`${period.slice(0, 4)}-Q${Math.floor((Number(period.slice(5, 7)) - 1) / 3) + 1}`);
};

/**
 * CSV import of KPI targets (SPEC Phase 3 §4: user_email,target) for one period. All-or-nothing on
 * the server: when `ok` is false nothing was written and every error is listed with its line.
 */
export const KpiImportDialog = ({
  open,
  onOpenChange,
  year,
  defaultPeriod
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Matrix year: the period choices are its 12 months. */
  year: number;
  defaultPeriod: string;
}) => {
  const ids = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const importTargets = useImportKpiTargets();
  const [source, setSource] = useState<Source>("file");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [periodType, setPeriodType] = useState<KpiPeriodType>("MONTH");
  const [period, setPeriod] = useState(defaultPeriod);
  const [result, setResult] = useState<{ value: KpiTargetImportResult; csv: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const csv = normalizeCreditCsv(text);
  const rows = countDataRows(csv);
  const headerOk = text.trim() === "" || hasKpiHeader(csv);
  const choices = periodsBetween(`${year}-01`, `${year}-12`).filter((item) =>
    isAlignedPeriod(periodType, item)
  );
  const periodItems = choices.map((item) => ({ value: item, label: optionLabel(periodType, item) }));
  const chosen = choices.includes(period) ? period : (choices[0] ?? period);

  const reset = () => {
    setText("");
    setFileName(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setPeriodType("MONTH");
      setPeriod(defaultPeriod);
    }
    onOpenChange(next);
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    if (file.size > MAX_CSV_CHARS * 2) {
      setError("Tệp quá lớn (tối đa khoảng 1 MB).");
      return;
    }
    try {
      setText(await file.text());
      setFileName(file.name);
    } catch {
      setError("Không đọc được tệp. Hãy lưu lại dạng CSV (UTF-8) rồi thử lại.");
    }
  };

  const submit = () => {
    setError(null);
    if (!csv.trim()) {
      setError(source === "file" ? "Chọn tệp CSV trước." : "Dán nội dung CSV trước.");
      return;
    }
    if (csv.length > MAX_CSV_CHARS) {
      setError("Nội dung quá lớn (tối đa 1 triệu ký tự). Hãy chia nhỏ tệp.");
      return;
    }
    importTargets.mutate(
      { csv, period: chosen, periodType },
      {
        onSuccess: (value) => setResult({ value, csv }),
        onError: (failure) => setError(scoreErrorMessage(failure))
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className={cn("max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl", sheetOnPhone)}
      >
        <div className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col max-sm:max-h-[92dvh]">
          <DialogHeader className="border-b px-4 pt-4 pb-3">
            <DialogTitle>Nhập KPI từ CSV</DialogTitle>
            <DialogDescription>
              Cột <code className="rounded bg-muted px-1 font-mono text-xs">{KPI_CSV_HEADER}</code>{" "}
              (có dòng tiêu đề). Mỗi email một dòng; lỗi ở bất kỳ dòng nào thì không dòng nào được ghi.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            {result?.value.ok ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                role="status"
                className="flex flex-col items-center gap-3 py-6 text-center"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
                  <CheckCircle2 className="size-6" aria-hidden="true" />
                </span>
                <p className="text-[15px] font-semibold">Đã nhập {result.value.imported} chỉ tiêu</p>
                <p className="text-[13px] text-foreground-muted">
                  KPI {periodTypeLabels[periodType]} có hiệu lực từ {optionLabel(periodType, chosen).toLocaleLowerCase("vi")}.
                </p>
              </motion.div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel id={`${ids}-type`}>Loại KPI</FieldLabel>
                    <SegmentedControl<KpiPeriodType>
                      aria-labelledby={`${ids}-type`}
                      value={periodType}
                      onChange={(next) => {
                        setPeriodType(next);
                        setResult(null);
                      }}
                      className="w-full"
                      options={[
                        { value: "MONTH", label: "Tháng" },
                        { value: "QUARTER", label: "Quý" },
                        { value: "YEAR", label: "Năm" }
                      ]}
                    />
                  </Field>
                  <Field>
                    <FieldLabel id={`${ids}-period`}>Áp dụng từ</FieldLabel>
                    <Select
                      items={periodItems}
                      value={chosen}
                      onValueChange={(next: string | null) => {
                        if (next) setPeriod(next);
                      }}
                    >
                      <SelectTrigger aria-labelledby={`${ids}-period`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {periodItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <SegmentedControl<Source>
                  aria-label="Nguồn dữ liệu"
                  value={source}
                  onChange={(next) => {
                    setSource(next);
                    setResult(null);
                  }}
                  className="w-full sm:w-fit"
                  options={[
                    { value: "file", label: "Chọn tệp", icon: FileUp },
                    { value: "paste", label: "Dán nội dung", icon: ClipboardPaste }
                  ]}
                />
                {source === "file" ? (
                  <div>
                    <input
                      ref={fileRef}
                      id={`${ids}-file`}
                      type="file"
                      accept=".csv,.tsv,.txt,text/csv,text/plain"
                      className="sr-only"
                      onChange={(event) => void readFile(event.target.files?.[0])}
                    />
                    <label
                      htmlFor={`${ids}-file`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        void readFile(event.dataTransfer.files[0]);
                      }}
                      className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors hover:border-border-strong hover:bg-surface-hover has-focus-visible:ring-2 has-focus-visible:ring-ring"
                    >
                      <FileSpreadsheet className="size-6 text-foreground-muted" aria-hidden="true" />
                      <span className="text-[13px] font-medium">
                        {fileName ?? "Bấm để chọn tệp CSV hoặc kéo thả vào đây"}
                      </span>
                      <span className="text-xs text-foreground-muted">
                        {fileName ? `${rows} dòng dữ liệu` : "UTF-8, phân tách bằng dấu phẩy"}
                      </span>
                    </label>
                  </div>
                ) : (
                  <Field>
                    <FieldLabel htmlFor={`${ids}-paste`}>Nội dung CSV</FieldLabel>
                    <Textarea
                      id={`${ids}-paste`}
                      rows={7}
                      value={text}
                      placeholder={`${KPI_CSV_HEADER}\nnhanvien.a@vidu.local,2400`}
                      onChange={(event) => {
                        setText(event.target.value);
                        setResult(null);
                      }}
                      className="max-h-72 font-mono text-xs"
                    />
                    <span className="text-xs text-foreground-muted">
                      Dán từ Google Sheets/Excel cũng được (tab được đổi thành dấu phẩy).
                      {text.trim() ? ` · ${rows} dòng dữ liệu` : ""}
                    </span>
                  </Field>
                )}
                <p className="text-xs text-foreground-muted">
                  Chỉ tiêu nhận số kiểu Việt Nam (2.472,5) hoặc kiểu Anh (2,472.5), tối đa 2 chữ số
                  thập phân. Trong tệp CSV, số có dấu phẩy cần nằm trong ngoặc kép (&quot;2472,5&quot;);
                  dán từ bảng tính thì không cần.
                </p>
                {!headerOk ? (
                  <InfoNote icon={TriangleAlert} tone="warning">
                    Dòng đầu tiên chưa có cột user_email và target. Máy chủ sẽ từ chối nếu thiếu cột.
                  </InfoNote>
                ) : null}
                {result && !result.value.ok ? <ImportErrors result={result.value} csv={result.csv} /> : null}
                <FormAlert>{error}</FormAlert>
              </>
            )}
          </div>

          <DialogFooter className="mx-0 mb-0 flex-wrap px-4 py-3">
            {result?.value.ok ? (
              <>
                <Button variant="ghost" onClick={reset}>
                  <RotateCcw />
                  Nhập tệp khác
                </Button>
                <Button onClick={() => close(false)}>Xong</Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="sm:mr-auto"
                  onClick={() => downloadText("mau-kpi.csv", TEMPLATE)}
                >
                  <Download />
                  Tải tệp mẫu
                </Button>
                <Button variant="ghost" onClick={() => close(false)}>
                  Hủy
                </Button>
                <Button onClick={submit} disabled={importTargets.isPending || !csv.trim()}>
                  {importTargets.isPending ? <Spinner /> : <FileUp />}
                  {rows > 0 ? `Nhập ${rows} dòng` : "Nhập"}
                </Button>
              </>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ImportErrors = ({ result, csv }: { result: KpiTargetImportResult; csv: string }) => (
  <section
    role="alert"
    aria-label="Lỗi nhập CSV"
    className="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3"
  >
    <p className="flex items-center gap-2 text-[13px] font-medium text-danger">
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      Chưa ghi dòng nào. Sửa {result.errors.length} lỗi dưới đây rồi nhập lại.
    </p>
    <ol className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
      {result.errors.map((item, index) => {
        const line = sourceLine(csv, item.line);
        return (
          <li key={`${item.line}-${index}`} className="flex flex-col gap-1 rounded-md bg-surface px-2.5 py-2">
            <span className="flex items-start gap-2 text-[13px]">
              <span className="shrink-0 rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger tabular-nums">
                Dòng {item.line}
              </span>
              <span className="min-w-0">{item.message}</span>
            </span>
            {line ? (
              <code className="block truncate font-mono text-[11px] text-foreground-muted" title={line}>
                {line}
              </code>
            ) : null}
          </li>
        );
      })}
    </ol>
  </section>
);
