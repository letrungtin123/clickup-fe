import { cn } from "cn";
import { BadgeCheck, CalendarPlus, History, Info, PencilLine, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { CreditRule, Process, ProductionProject } from "@/contracts/production-catalog";
import { isApiError } from "@/lib/api/errors";

import { nextFreeVersionDay, versionAt } from "../../credit-matrix";
import { productionErrorMessage } from "../../errors";
import {
  dayInRange,
  formatCredit,
  formatDay,
  formatMoney,
  formatVersionRange,
  parseCreditInput,
  parseMoneyInput
} from "../../format";
import { useCreditHistory, useDeleteCreditRule, useSetCreditRule } from "../../hooks";
import { DateField } from "../date-field";
import { FormAlert } from "../settings-kit";

type CreditCellEditorProps = {
  project: ProductionProject;
  process: Process;
  /** Rule effective on the matrix day (null = empty cell). */
  rule: CreditRule | null;
  /** Matrix day. */
  at: string;
  /** Organization today (default effective-from). */
  today: string;
  canEdit: boolean;
  onDone: () => void;
};

const moneyText = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : new Intl.NumberFormat("vi-VN").format(value);
const creditText = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : value.toFixed(2).replace(".", ",");

/**
 * Editor for one project × process cell: new price with an effective-from day (same day as an
 * existing version corrects it in place; otherwise a new version starts and the previous one ends
 * that day) plus the full version history. Used in a popover (desktop) or bottom sheet (phones).
 */
export const CreditCellEditor = ({
  project,
  process,
  rule,
  at,
  today,
  canEdit,
  onDone
}: CreditCellEditorProps) => {
  const ids = useId();
  const history = useCreditHistory(project.id, process.id);
  const save = useSetCreditRule();
  const [tab, setTab] = useState<"edit" | "history">(canEdit ? "edit" : "history");
  const [credit, setCredit] = useState(creditText(rule?.creditPerImage));
  const [money, setMoney] = useState(moneyText(rule?.moneyPerImage));
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [errors, setErrors] = useState<{ credit?: string | undefined; money?: string | undefined }>(
    {}
  );
  const [formError, setFormError] = useState<string | null>(null);
  /**
   * The price in force on that day already priced scores (409 CREDIT_RULE_IN_USE): it cannot be
   * corrected in place; a new version must start after its last priced day (PR-12).
   */
  const [locked, setLocked] = useState<{ from: string; suggest: string } | null>(null);

  const versions = history.data?.items ?? [];
  const sameDay = versions.find((version) => version.effectiveFrom === effectiveFrom) ?? null;
  const covering = sameDay ? null : versionAt(versions, effectiveFrom);

  const submit = () => {
    const parsedCredit = parseCreditInput(credit);
    const parsedMoney = parseMoneyInput(money);
    const problems = {
      credit: !parsedCredit.ok
        ? parsedCredit.error
        : parsedCredit.value === null
          ? "Nhập điểm mỗi tấm."
          : undefined,
      money: parsedMoney.ok ? undefined : parsedMoney.error
    };
    setErrors(problems);
    if (!parsedCredit.ok || parsedCredit.value === null || !parsedMoney.ok) return;
    save.mutate(
      {
        projectId: project.id,
        processId: process.id,
        creditPerImage: parsedCredit.value,
        moneyPerImage: parsedMoney.value,
        effectiveFrom
      },
      {
        onSuccess: () => {
          toast.success(
            `Đã lưu đơn giá ${project.code} × ${process.name} từ ${formatDay(effectiveFrom)}`
          );
          onDone();
        },
        onError: (error) => {
          // A version that already priced scores is refused (409): show the API's reason and
          // offer a new version starting after its last priced day.
          const inUse = isApiError(error) && error.code === "CREDIT_RULE_IN_USE";
          setLocked(
            inUse
              ? {
                  from: effectiveFrom,
                  suggest: nextFreeVersionDay(error.message, effectiveFrom, today)
                }
              : null
          );
          setFormError(productionErrorMessage(error));
        }
      }
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <span className="truncate font-mono">{project.code}</span>
          <span className="text-foreground-subtle">×</span>
          <span className="truncate">{process.name}</span>
          {process.isQc ? (
            <BadgeCheck className="size-3.5 shrink-0 text-success" aria-label="Quy trình QC" />
          ) : null}
        </p>
        <p className="text-xs text-foreground-muted">
          {rule ? (
            <>
              Ngày {formatDay(at)}:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatCredit(rule.creditPerImage)}
              </span>{" "}
              điểm · <span className="tabular-nums">{formatMoney(rule.moneyPerImage)}</span> (
              {formatVersionRange(rule.effectiveFrom, rule.effectiveTo).toLocaleLowerCase("vi")})
            </>
          ) : (
            `Chưa có đơn giá áp dụng ngày ${formatDay(at)}.`
          )}
        </p>
      </div>

      {canEdit ? (
        <SegmentedControl<"edit" | "history">
          aria-label="Chế độ"
          size="sm"
          value={tab}
          onChange={setTab}
          className="w-full"
          options={[
            { value: "edit", label: "Đặt giá", icon: PencilLine },
            {
              value: "history",
              label: history.data ? `Lịch sử (${versions.length})` : "Lịch sử",
              icon: History
            }
          ]}
        />
      ) : null}

      {tab === "edit" && canEdit ? (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={Boolean(errors.credit)}>
              <FieldLabel htmlFor={`${ids}-credit`}>Điểm / tấm</FieldLabel>
              <Input
                id={`${ids}-credit`}
                autoFocus
                inputMode="decimal"
                value={credit}
                placeholder="0,00"
                aria-invalid={Boolean(errors.credit)}
                className="text-right tabular-nums"
                onChange={(event) => {
                  setCredit(event.target.value);
                  setErrors((current) => ({ ...current, credit: undefined }));
                }}
              />
              {errors.credit ? <FieldError className="text-xs">{errors.credit}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(errors.money)}>
              <FieldLabel htmlFor={`${ids}-money`}>Tiền / tấm (₫)</FieldLabel>
              <Input
                id={`${ids}-money`}
                inputMode="numeric"
                value={money}
                placeholder="Không có"
                aria-invalid={Boolean(errors.money)}
                className="text-right tabular-nums"
                onChange={(event) => {
                  setMoney(event.target.value);
                  setErrors((current) => ({ ...current, money: undefined }));
                }}
              />
              {errors.money ? <FieldError className="text-xs">{errors.money}</FieldError> : null}
            </Field>
          </div>
          <Field>
            <FieldLabel id={`${ids}-from`}>Áp dụng từ ngày</FieldLabel>
            <DateField
              aria-labelledby={`${ids}-from`}
              value={effectiveFrom}
              onChange={(day) => {
                if (!day) return;
                setEffectiveFrom(day);
                setLocked(null);
                setFormError(null);
              }}
              today={today}
            />
          </Field>
          <p className="flex items-start gap-2 rounded-lg bg-muted px-2.5 py-2 text-xs leading-relaxed text-foreground-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {history.isPending ? (
              "Đang tải lịch sử…"
            ) : sameDay ? (
              <span>
                Sửa trực tiếp phiên bản bắt đầu {formatDay(sameDay.effectiveFrom)}. Điểm đã ghi
                trước đó không thay đổi.
              </span>
            ) : covering ? (
              <span>
                Tạo phiên bản mới từ {formatDay(effectiveFrom)}; phiên bản hiện tại (
                {formatVersionRange(covering.effectiveFrom, covering.effectiveTo).toLocaleLowerCase(
                  "vi"
                )}
                ) kết thúc trước ngày đó.
              </span>
            ) : (
              <span>
                Tạo đơn giá đầu tiên cho ô này, có hiệu lực từ {formatDay(effectiveFrom)}.
              </span>
            )}
          </p>
          {process.isQc && money.trim() !== "" ? (
            <p className="text-xs text-foreground-muted">
              Quy trình QC thường chỉ có điểm, không có tiền.
            </p>
          ) : null}
          <FormAlert>{formError}</FormAlert>
          {locked && locked.from === effectiveFrom ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                setEffectiveFrom(locked.suggest);
                setLocked(null);
                setFormError(null);
              }}
            >
              <CalendarPlus />
              Tạo phiên bản từ ngày {formatDay(locked.suggest)}…
            </Button>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>
              Hủy
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              Lưu đơn giá
            </Button>
          </div>
        </form>
      ) : (
        <VersionHistory
          project={project}
          process={process}
          canEdit={canEdit}
          versions={versions}
          pending={history.isPending}
          error={history.isError ? history.error : null}
          onRetry={() => void history.refetch()}
          at={at}
          onUse={
            canEdit
              ? (version) => {
                  setCredit(creditText(version.creditPerImage));
                  setMoney(moneyText(version.moneyPerImage));
                  setEffectiveFrom(version.effectiveFrom);
                  setTab("edit");
                }
              : undefined
          }
        />
      )}
    </div>
  );
};

const VersionHistory = ({
  project,
  process,
  canEdit,
  versions,
  pending,
  error,
  onRetry,
  at,
  onUse
}: {
  project: ProductionProject;
  process: Process;
  canEdit: boolean;
  versions: readonly CreditRule[];
  pending: boolean;
  error: unknown;
  onRetry: () => void;
  at: string;
  onUse?: ((version: CreditRule) => void) | undefined;
}) => {
  const remove = useDeleteCreditRule(project.id, process.id);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const confirmRemove = (version: CreditRule) =>
    remove.mutate(version.id, {
      onSuccess: () => {
        setConfirmingId(null);
        setRemoveError(null);
        toast.success(`Đã xóa phiên bản từ ${formatDay(version.effectiveFrom)}`);
      },
      onError: (failure) => {
        setConfirmingId(null);
        setRemoveError(productionErrorMessage(failure));
      }
    });

  if (pending) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-10" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState size="sm" error={error} onRetry={onRetry} />;
  if (versions.length === 0) {
    return (
      <p className="py-4 text-center text-[13px] text-foreground-muted">
        Ô này chưa có phiên bản nào.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {removeError ? <FormAlert>{removeError}</FormAlert> : null}
      <ol
        aria-label="Các phiên bản đơn giá"
        className="flex max-h-72 flex-col gap-1 overflow-y-auto"
      >
        {versions.map((version) => {
          const current = dayInRange(at, version.effectiveFrom, version.effectiveTo);
          if (confirmingId === version.id) {
            return (
              <li
                key={version.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-2.5 py-2"
              >
                <span className="min-w-0 flex-1 text-xs">
                  Xóa phiên bản{" "}
                  {formatVersionRange(version.effectiveFrom, version.effectiveTo).toLocaleLowerCase(
                    "vi"
                  )}
                  ?{" "}
                  {versions.some((other) => other.effectiveTo === version.effectiveFrom)
                    ? "Phiên bản trước sẽ áp dụng lại cho khoảng này."
                    : "Khoảng này sẽ không còn đơn giá."}
                </span>
                <span className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => setConfirmingId(null)}
                  >
                    Hủy
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => confirmRemove(version)}
                  >
                    {remove.isPending ? <Spinner /> : null}
                    Xóa
                  </Button>
                </span>
              </li>
            );
          }
          return (
            <li
              key={version.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-2.5 py-2",
                current ? "border-brand/40 bg-brand-soft" : "border-transparent bg-muted/50"
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-xs font-medium tabular-nums">
                  {formatVersionRange(version.effectiveFrom, version.effectiveTo)}
                </span>
                <span className="text-[11px] text-foreground-muted">
                  {current
                    ? `Áp dụng ngày ${formatDay(at)}`
                    : version.effectiveTo === null
                      ? "Mới nhất"
                      : "Đã kết thúc"}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="text-[13px] font-medium tabular-nums">
                  {formatCredit(version.creditPerImage)}
                </span>
                <span className="text-[11px] text-foreground-muted tabular-nums">
                  {formatMoney(version.moneyPerImage)}
                </span>
              </span>
              {onUse ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Sửa phiên bản từ ${formatDay(version.effectiveFrom)}`}
                  title="Sửa phiên bản này"
                  onClick={() => onUse(version)}
                >
                  <PencilLine />
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Xóa phiên bản từ ${formatDay(version.effectiveFrom)}`}
                  title="Xóa phiên bản này"
                  className="text-foreground-muted hover:text-destructive"
                  onClick={() => {
                    setRemoveError(null);
                    setConfirmingId(version.id);
                  }}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
