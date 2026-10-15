import { cn } from "cn";
import { History, Info, PencilLine, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { KpiTarget, KpiTargetCell } from "@/contracts/production-scores";

import { parseCreditInput } from "../../format";
import { FormAlert } from "../../components/settings-kit";
import { scoreErrorMessage } from "../../scores/errors";
import { formatPeriod, rollupLabel } from "../../scores/periods";
import { useDeleteKpiTarget, usePutKpiTargets } from "../hooks";
import {
  formatTarget,
  periodTypeLabels,
  versionFor,
  type MatrixColumn,
  type MatrixRow
} from "../matrix";

const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh"
});

const targetText = (value: number | null | undefined) =>
  value === null || value === undefined
    ? ""
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(2).replace(".", ",");

/** "Kỳ 06/2026" / "Quý 2/2026" / "Năm 2026" for a version start of a given type. */
const versionLabel = (periodType: KpiTarget["periodType"], period: string) => {
  if (periodType === "MONTH") return `Kỳ ${formatPeriod(period)}`;
  if (periodType === "YEAR") return rollupLabel(period.slice(0, 4));
  return rollupLabel(`${period.slice(0, 4)}-Q${Math.floor((Number(period.slice(5, 7)) - 1) / 3) + 1}`);
};

/**
 * Editor for one person × period cell (SPEC Phase 3 §5 /admin/kpi): set the target from this period
 * on (a version at the same start replaces it), with the full effective_from history and deletion of
 * a mistaken version. Popover on desktop/tablet, bottom sheet on phones. `readOnly` (PD-050: everyone but the
 * organization superadmin) shows the history only, without the form or the delete buttons.
 */
export const KpiCellEditor = ({
  row,
  column,
  cell,
  versions,
  readOnly = false,
  onDone
}: {
  row: MatrixRow;
  column: MatrixColumn;
  cell: KpiTargetCell;
  /** This person's versions of the column's period type, newest first. */
  versions: readonly KpiTarget[];
  readOnly?: boolean;
  onDone: () => void;
}) => {
  const ids = useId();
  const save = usePutKpiTargets();
  const remove = useDeleteKpiTarget();
  const [tab, setTab] = useState<"edit" | "history">(readOnly ? "history" : "edit");
  const [value, setValue] = useState(targetText(cell.targetPoints));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const typeLabel = periodTypeLabels[column.periodType];
  const inForce = versionFor(versions, cell.period);
  const startsHere = versions.find((item) => item.effectiveFrom === cell.period) ?? null;
  const next = [...versions]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .find((item) => item.effectiveFrom > cell.period);

  const submit = () => {
    const parsed = parseCreditInput(value, 1_000_000);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (parsed.value === null) {
      setError("Nhập số điểm chỉ tiêu.");
      return;
    }
    setFormError(null);
    save.mutate(
      {
        items: [
          {
            userId: row.user.id,
            periodType: column.periodType,
            effectiveFrom: cell.period,
            targetPoints: parsed.value,
            ...(note.trim() ? { note: note.trim() } : {})
          }
        ]
      },
      {
        onSuccess: () => {
          toast.success(
            `Đã đặt KPI ${typeLabel} ${formatTarget(parsed.value)} điểm cho ${row.user.displayName} từ ${versionLabel(column.periodType, cell.period).toLocaleLowerCase("vi")}`
          );
          onDone();
        },
        onError: (failure) => setFormError(scoreErrorMessage(failure))
      }
    );
  };

  const deleteVersion = (version: KpiTarget) => {
    remove.mutate(version.id, {
      onSuccess: () => {
        toast.success(`Đã xóa phiên bản KPI từ ${versionLabel(version.periodType, version.effectiveFrom).toLocaleLowerCase("vi")}`);
        setConfirmDelete(null);
        // The cell's own version is gone: close instead of showing a stale form.
        if (tab === "edit") onDone();
      },
      onError: (failure) => setFormError(scoreErrorMessage(failure))
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <UserAvatar user={row.user} size="md" />
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-sm font-semibold">{row.user.displayName}</p>
          <p className="text-xs text-foreground-muted">
            KPI {typeLabel} · {column.title}
          </p>
        </div>
      </div>
      <p className="text-xs text-foreground-muted">
        {inForce ? (
          <>
            Đang áp dụng:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatTarget(inForce.targetPoints)} điểm
            </span>{" "}
            (từ {versionLabel(inForce.periodType, inForce.effectiveFrom).toLocaleLowerCase("vi")})
          </>
        ) : (
          `Chưa có KPI ${typeLabel} cho ${column.title.toLocaleLowerCase("vi")}.`
        )}
      </p>

      {readOnly ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted">
          <History className="size-3.5" aria-hidden="true" />
          Lịch sử ({versions.length})
        </p>
      ) : (
        <SegmentedControl<"edit" | "history">
          aria-label="Chế độ"
          size="sm"
          value={tab}
          onChange={setTab}
          className="w-full"
          options={[
            { value: "edit", label: "Đặt chỉ tiêu", icon: PencilLine },
            { value: "history", label: `Lịch sử (${versions.length})`, icon: History }
          ]}
        />
      )}

      {tab === "edit" && !readOnly ? (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`${ids}-target`}>Chỉ tiêu (điểm)</FieldLabel>
              <Input
                id={`${ids}-target`}
                autoFocus
                inputMode="decimal"
                value={value}
                placeholder="2400"
                aria-invalid={Boolean(error)}
                className="text-right tabular-nums"
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(null);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${ids}-note`}>Ghi chú</FieldLabel>
              <Input
                id={`${ids}-note`}
                value={note}
                maxLength={500}
                placeholder="Không bắt buộc"
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </div>
          {error ? <FieldError className="-mt-1 text-xs">{error}</FieldError> : null}
          <p className="flex items-start gap-2 rounded-lg bg-muted px-2.5 py-2 text-xs leading-relaxed text-foreground-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {startsHere
                ? `Sửa phiên bản bắt đầu ${versionLabel(column.periodType, cell.period).toLocaleLowerCase("vi")}.`
                : `Tạo phiên bản mới từ ${versionLabel(column.periodType, cell.period).toLocaleLowerCase("vi")}.`}{" "}
              {next
                ? `Áp dụng đến trước ${versionLabel(next.periodType, next.effectiveFrom).toLocaleLowerCase("vi")} (đã có phiên bản riêng).`
                : "Áp dụng cho mọi kỳ sau cho đến khi có phiên bản mới."}
              {column.periodType !== "MONTH"
                ? " KPI quý/năm chỉ dùng cho báo cáo; nếu trống, chỉ tiêu = tổng các tháng."
                : ""}
            </span>
          </p>
          <FormAlert>{formError}</FormAlert>
          <div className="flex flex-wrap justify-end gap-2">
            {startsHere ? (
              confirmDelete === startsHere.id ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={remove.isPending}
                  onClick={() => deleteVersion(startsHere)}
                >
                  {remove.isPending ? <Spinner /> : <Trash2 />}
                  Xác nhận xóa
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto text-danger hover:text-danger"
                  onClick={() => setConfirmDelete(startsHere.id)}
                >
                  <Trash2 />
                  Xóa phiên bản
                </Button>
              )
            ) : null}
            <Button type="button" variant="ghost" onClick={onDone}>
              Hủy
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              Lưu KPI
            </Button>
          </div>
        </form>
      ) : versions.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-foreground-muted">
          Chưa có phiên bản KPI {typeLabel} nào.
        </p>
      ) : (
        <ol aria-label="Lịch sử KPI" className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {versions.map((version) => {
            const current = inForce?.id === version.id;
            return (
              <li
                key={version.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-2.5 py-2",
                  current ? "border-brand/40 bg-brand-soft" : "border-transparent bg-muted/50"
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-xs font-medium">
                    Từ {versionLabel(version.periodType, version.effectiveFrom).toLocaleLowerCase("vi")}
                    {current ? (
                      <span className="ml-1.5 text-[11px] font-normal text-brand-text">
                        · áp dụng {column.title.toLocaleLowerCase("vi")}
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-[11px] text-foreground-muted" title={version.note ?? undefined}>
                    {version.updatedBy ? `${version.updatedBy.displayName} · ` : ""}
                    {dateFormat.format(new Date(version.updatedAt))}
                    {version.note ? ` · ${version.note}` : ""}
                  </span>
                </span>
                <span className="text-[13px] font-semibold tabular-nums">
                  {formatTarget(version.targetPoints)}
                </span>
                {readOnly ? null : confirmDelete === version.id ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => deleteVersion(version)}
                  >
                    {remove.isPending ? <Spinner /> : null}
                    Xóa?
                  </Button>
                ) : (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Xóa phiên bản từ ${versionLabel(version.periodType, version.effectiveFrom)}`}
                    onClick={() => setConfirmDelete(version.id)}
                    className="text-foreground-subtle hover:text-danger"
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {tab === "history" ? <FormAlert>{formError}</FormAlert> : null}
    </div>
  );
};
