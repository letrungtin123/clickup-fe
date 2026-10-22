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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CreditImportResult } from "@/contracts/production-catalog";

import {
  countDataRows,
  CREDIT_CSV_HEADER,
  CREDIT_CSV_HOURS_COLUMN,
  hasCreditHeader,
  importSourceName,
  normalizeCreditCsv,
  sourceLine
} from "../../credit-matrix";
import { productionErrorMessage } from "../../errors";
import { formatDay } from "../../format";
import { useImportCredits } from "../../hooks";
import { DateField } from "../date-field";
import { FormAlert, InfoNote } from "../settings-kit";
import { downloadText } from "./download";
import { phoneSheetColumn, sheetOnPhone } from "../../ui";

const MAX_CSV_CHARS = 2_000_000;
/** PD-080: the API's limits for the version name and the source file name. */
const VERSION_NAME_MAX = 120;
const SOURCE_MAX = 200;
// Obviously fake sample rows: the template must never carry real client codes or prices. PD-080: the optional
// `hours` column ("Giờ/tấm"); left empty on the second row = credit ÷ 11.
const TEMPLATE = `${CREDIT_CSV_HEADER},${CREDIT_CSV_HOURS_COLUMN}\r\nVD-A,Retouch thường,1.10,5000,0.1\r\nVD-A,Kiểm tra,0.10,,\r\n`;

type Source = "file" | "paste";

/**
 * CSV import (SPEC Phase 1): all-or-nothing on the server. When `ok` is false nothing was written
 * and every error is listed with its source line; otherwise a summary of what was imported/created.
 */
export const CreditImportDialog = ({
  open,
  onOpenChange,
  today,
  onImported
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  /** Called after a successful import (the page jumps to the effective day). */
  onImported: (effectiveFrom: string) => void;
}) => {
  const ids = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const importCredits = useImportCredits();
  const [source, setSource] = useState<Source>("file");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [createMissing, setCreateMissing] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [result, setResult] = useState<{
    value: CreditImportResult;
    csv: string;
    effectiveFrom: string;
    source: string | null;
    versionName: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const csv = normalizeCreditCsv(text);
  const rows = countDataRows(csv);
  const headerOk = text.trim() === "" || hasCreditHeader(csv);
  /** PD-080: the uploaded file's name without its extension (pasted content has none). */
  const sourceName =
    source === "file" && fileName ? importSourceName(fileName).slice(0, SOURCE_MAX) : null;

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
      setEffectiveFrom(today);
      setCreateMissing(false);
      setVersionName("");
    }
    onOpenChange(next);
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    if (file.size > MAX_CSV_CHARS * 2) {
      setError("Tệp quá lớn (tối đa khoảng 2 MB).");
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
      setError("Nội dung quá lớn (tối đa 2 triệu ký tự). Hãy chia nhỏ tệp.");
      return;
    }
    const name = versionName.trim() || null;
    importCredits.mutate(
      {
        csv,
        effectiveFrom,
        createMissing,
        ...(sourceName ? { source: sourceName } : {}),
        ...(name ? { versionName: name } : {})
      },
      {
        onSuccess: (value) =>
          setResult({ value, csv, effectiveFrom, source: sourceName, versionName: name }),
        onError: (failure) => setError(productionErrorMessage(failure))
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl",
          sheetOnPhone
        )}
      >
        {/* min-w-0: the dialog is a grid; without it the auto-sized textarea (one long CSV line)
            widens the whole sheet past the phone screen. */}
        <div
          className={cn(
            "flex max-h-[calc(100dvh-2rem)] min-h-0 min-w-0 flex-col",
            phoneSheetColumn
          )}
        >
          <DialogHeader className="border-b px-4 pt-4 pb-3">
            <DialogTitle>Nhập bảng đơn giá từ CSV</DialogTitle>
            <DialogDescription>
              Cột:{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs wrap-anywhere">
                {CREDIT_CSV_HEADER}
              </code>{" "}
              và (tùy chọn){" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">
                {CREDIT_CSV_HOURS_COLUMN}
              </code>{" "}
              = Giờ/tấm (số thập phân “,” hoặc “.”; để trống = credit ÷ 11; cũng nhận tên
              hours_per_image, gio_tam). Tiền để trống hoặc 0 nghĩa là không có tiền. Lỗi ở bất kỳ
              dòng nào thì không dòng nào được ghi. Mỗi lần nhập tạo một phiên bản mới từ ngày áp
              dụng; phiên bản cũ giữ nguyên.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            {result?.value.ok ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <SuccessSummary
                  result={result.value}
                  effectiveFrom={result.effectiveFrom}
                  source={result.source}
                  versionName={result.versionName}
                />
              </motion.div>
            ) : (
              <div key="form" className="flex flex-col gap-4">
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
                  <div className="flex flex-col gap-2">
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
                      <FileSpreadsheet
                        className="size-6 text-foreground-muted"
                        aria-hidden="true"
                      />
                      <span className="text-[13px] font-medium">
                        {fileName ?? "Bấm để chọn tệp CSV hoặc kéo thả vào đây"}
                      </span>
                      <span className="text-xs text-foreground-muted wrap-anywhere">
                        {fileName
                          ? `${rows} dòng dữ liệu${sourceName ? ` · Nguồn: ${sourceName}` : ""}`
                          : "UTF-8, phân tách bằng dấu phẩy"}
                      </span>
                    </label>
                  </div>
                ) : (
                  <Field>
                    <FieldLabel htmlFor={`${ids}-paste`}>Nội dung CSV (có dòng tiêu đề)</FieldLabel>
                    <Textarea
                      id={`${ids}-paste`}
                      rows={7}
                      value={text}
                      placeholder={`${CREDIT_CSV_HEADER},${CREDIT_CSV_HOURS_COLUMN}\nVD-A,Retouch thường,1.10,5000,0.1`}
                      onChange={(event) => {
                        setText(event.target.value);
                        setResult(null);
                      }}
                      className="max-h-72 font-mono text-xs"
                    />
                    <span className="text-xs text-foreground-muted">
                      Dán trực tiếp từ Google Sheets/Excel cũng được (tab được đổi thành dấu phẩy).
                      {text.trim() ? ` · ${rows} dòng dữ liệu` : ""}
                    </span>
                  </Field>
                )}
                {!headerOk ? (
                  <InfoNote icon={TriangleAlert} tone="warning">
                    Dòng đầu tiên chưa giống tiêu đề {CREDIT_CSV_HEADER}. Máy chủ sẽ từ chối nếu
                    thiếu cột.
                  </InfoNote>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel id={`${ids}-from`}>Áp dụng từ ngày</FieldLabel>
                    <DateField
                      aria-labelledby={`${ids}-from`}
                      value={effectiveFrom}
                      onChange={(day) => day && setEffectiveFrom(day)}
                      today={today}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${ids}-version-name`}>
                      Tên phiên bản{" "}
                      <span className="font-normal text-foreground-muted">(tùy chọn)</span>
                    </FieldLabel>
                    <Input
                      id={`${ids}-version-name`}
                      value={versionName}
                      maxLength={VERSION_NAME_MAX}
                      placeholder="VD: Đơn giá 10/2026"
                      onChange={(event) => setVersionName(event.target.value)}
                    />
                  </Field>
                  <label className="flex items-start gap-3 rounded-lg border p-3 sm:col-span-2">
                    <Switch
                      checked={createMissing}
                      onCheckedChange={setCreateMissing}
                      className="mt-0.5"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">Tạo mới nếu chưa có</span>
                      <span className="text-xs text-foreground-muted">
                        Tự tạo Project (theo mã) và quy trình (theo tên) chưa tồn tại.
                      </span>
                    </span>
                  </label>
                </div>

                {result && !result.value.ok ? (
                  <ErrorList result={result.value} csv={result.csv} />
                ) : null}
                <FormAlert>{error}</FormAlert>
              </div>
            )}
          </div>

          <DialogFooter className="mx-0 mb-0 flex-wrap px-4 py-3">
            {result?.value.ok ? (
              <>
                <Button variant="ghost" onClick={reset}>
                  <RotateCcw />
                  Nhập tệp khác
                </Button>
                <Button
                  onClick={() => {
                    onImported(result.effectiveFrom);
                    close(false);
                  }}
                >
                  Xem bảng ngày {formatDay(result.effectiveFrom)}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="sm:mr-auto"
                  onClick={() => downloadText("mau-don-gia.csv", TEMPLATE)}
                >
                  <Download />
                  Tải tệp mẫu
                </Button>
                <Button variant="ghost" onClick={() => close(false)}>
                  Hủy
                </Button>
                <Button onClick={submit} disabled={importCredits.isPending || !csv.trim()}>
                  {importCredits.isPending ? <Spinner /> : <FileUp />}
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

const ErrorList = ({ result, csv }: { result: CreditImportResult; csv: string }) => (
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
          <li
            key={`${item.line}-${index}`}
            className="flex flex-col gap-1 rounded-md bg-surface px-2.5 py-2"
          >
            <span className="flex items-start gap-2 text-[13px]">
              <span className="shrink-0 rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger tabular-nums">
                Dòng {item.line}
              </span>
              <span className="min-w-0">{item.message}</span>
            </span>
            {line ? (
              <code
                className="block truncate font-mono text-[11px] text-foreground-muted"
                title={line}
              >
                {line}
              </code>
            ) : null}
          </li>
        );
      })}
    </ol>
  </section>
);

const SuccessSummary = ({
  result,
  effectiveFrom,
  source,
  versionName
}: {
  result: CreditImportResult;
  effectiveFrom: string;
  source: string | null;
  versionName: string | null;
}) => (
  <div role="status" className="flex flex-col items-center gap-4 py-4 text-center">
    <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
      <CheckCircle2 className="size-6" aria-hidden="true" />
    </span>
    <div className="flex flex-col gap-1">
      <p className="text-[15px] font-semibold">Đã nhập {result.imported} đơn giá</p>
      <p className="text-[13px] text-foreground-muted wrap-anywhere">
        {versionName ? <>Phiên bản “{versionName}” — có</> : "Có"} hiệu lực từ{" "}
        {formatDay(effectiveFrom)}.{source ? <> Nguồn: {source}.</> : null}
      </p>
    </div>
    {result.createdProjects.length > 0 || result.createdProcesses.length > 0 ? (
      <div className="flex w-full flex-col gap-3 rounded-lg border p-3 text-left">
        {result.createdProjects.length > 0 ? (
          <CreatedList
            title={`Project mới (${result.createdProjects.length})`}
            items={result.createdProjects}
            mono
          />
        ) : null}
        {result.createdProcesses.length > 0 ? (
          <CreatedList
            title={`Quy trình mới (${result.createdProcesses.length})`}
            items={result.createdProcesses}
          />
        ) : null}
        <p className="text-xs text-foreground-muted">
          Project mới lấy mã làm tên; hãy bổ sung tên và khách hàng trong mục Project.
        </p>
      </div>
    ) : null}
  </div>
);

const CreatedList = ({
  title,
  items,
  mono = false
}: {
  title: string;
  items: readonly string[];
  mono?: boolean;
}) => (
  <div className="flex flex-col gap-1.5">
    <p className="text-xs font-medium text-foreground-muted">{title}</p>
    <ul className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
      {items.map((item) => (
        <li
          key={item}
          className={cn("rounded-md bg-muted px-1.5 py-0.5 text-xs", mono && "font-mono")}
        >
          {item}
        </li>
      ))}
    </ul>
  </div>
);
