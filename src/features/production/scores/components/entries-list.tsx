import { cn } from "cn";
import { BadgeCheck, ChevronsDown, CornerDownRight, ListX, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "@/components/shared/router-link";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { EmptyState, LoadMoreError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ScoreEntry } from "@/contracts/production-scores";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { formatCredit, formatInteger, formatMoney, formatNumber } from "../../format";
import { formatSignedCredit } from "../forecast";

/**
 * Score ledger of the signed-in user (SPEC Phase 3 §5 "bảng score_entries có link task"). Entries are
 * immutable; a quantity corrected after Done shows as a separate correction row carrying the signed
 * delta. Table on tablet/desktop, stacked cards on phones (one tree per tier). The API pages the
 * ledger (newest first); "Tải thêm" loads older rows, the filters count the rows loaded so far.
 */

export type EntriesPaging = {
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  loadMore: () => void;
};

type Filter = "all" | "worker" | "qc" | "khoan" | "adjust";

const PAGE = 50;

const matches = (entry: ScoreEntry, filter: Filter) => {
  switch (filter) {
    case "worker":
      return entry.role === "WORKER";
    case "qc":
      return entry.role === "QC";
    case "khoan":
      return entry.payMode === "MONEY_IF_KPI";
    case "adjust":
      return entry.adjustsEntryId !== null;
    default:
      return true;
  }
};

const dayMonth = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
/** Khoán marker unless the shift name already says it (seed shift "Khoán" → no "Khoán Khoán"). */
const showKhoanMark = (entry: ScoreEntry) =>
  entry.payMode === "MONEY_IF_KPI" && !entry.shift.name.toLocaleLowerCase("vi").includes("khoán");
const taskHref = (entry: ScoreEntry) => `/production/tasks/${entry.task.id}`;

export const EntriesList = ({
  entries,
  paging
}: {
  entries: readonly ScoreEntry[];
  paging: EntriesPaging;
}) => {
  const breakpoint = useBreakpoint();
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const counts = {
    all: entries.length,
    worker: entries.filter((entry) => matches(entry, "worker")).length,
    qc: entries.filter((entry) => matches(entry, "qc")).length,
    khoan: entries.filter((entry) => matches(entry, "khoan")).length,
    adjust: entries.filter((entry) => matches(entry, "adjust")).length
  };
  const rows = entries.filter((entry) => matches(entry, filter));
  const visible = rows.slice(0, limit);
  const options = (
    [
      { value: "all", label: "Tất cả" },
      { value: "worker", label: "Làm" },
      { value: "qc", label: "QC" },
      { value: "khoan", label: "Khoán" },
      { value: "adjust", label: "Điều chỉnh" }
    ] as const
  )
    .filter(
      (option) => option.value === "all" || option.value === filter || counts[option.value] > 0
    )
    .map((option) => ({ value: option.value, label: `${option.label} (${counts[option.value]})` }));

  if (entries.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={ListX}
        title="Chưa có điểm trong kỳ này"
        description="Điểm được ghi ngay khi task của bạn chuyển sang Done — task Checking ghi điểm QC."
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="-mb-px overflow-x-auto border-b px-4 py-2.5 scrollbar-none">
        <SegmentedControl<Filter>
          aria-label="Lọc lịch sử điểm"
          size="sm"
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setLimit(PAGE);
          }}
          options={options}
          className="w-max"
        />
      </div>
      {breakpoint === "mobile" ? (
        <ul className="divide-y">
          {visible.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[46rem] text-[13px]">
            <thead>
              <tr className="border-b text-left text-xs text-foreground-muted">
                <th scope="col" className="py-2.5 pr-3 pl-4 font-medium">
                  Ngày
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Task
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Dự án · Quy trình
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Ca
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  SL
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Đơn giá
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Điểm
                </th>
                <th scope="col" className="py-2.5 pr-4 pl-3 text-right font-medium">
                  Tiền
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {visible.map((entry) => (
                <EntryRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > visible.length || paging.hasMore ? (
        <div className="flex flex-wrap items-center justify-center gap-3 border-t px-4 py-3 text-xs text-foreground-muted">
          {rows.length > visible.length ? (
            <Button
              variant="outline"
              size="sm"
              className="max-sm:min-h-10"
              onClick={() => setLimit((current) => current + PAGE)}
            >
              Hiện thêm ({rows.length - visible.length})
            </Button>
          ) : paging.failed && !paging.loading ? (
            <LoadMoreError onRetry={paging.loadMore} className="px-0 py-0" />
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="max-sm:min-h-10"
              onClick={paging.loadMore}
              disabled={paging.loading}
            >
              {paging.loading ? <Spinner /> : <ChevronsDown />}
              Tải thêm dòng cũ hơn
            </Button>
          )}
          {paging.hasMore ? (
            <span>
              Đã tải {formatNumber(entries.length)} dòng mới nhất; tổng điểm vẫn tính đủ cả kỳ.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const isAdjustment = (entry: ScoreEntry) => entry.adjustsEntryId !== null;

/** Quantity; corrections carry a sign (+2 / −1). */
const qtyText = (entry: ScoreEntry) =>
  isAdjustment(entry) && entry.qty !== 0
    ? `${entry.qty > 0 ? "+" : "−"}${formatInteger(Math.abs(entry.qty))}`
    : formatInteger(entry.qty);

const Tags = ({ entry }: { entry: ScoreEntry }) => (
  <>
    {entry.role === "QC" ? (
      <span className="inline-flex items-center gap-0.5 rounded bg-success-soft px-1 py-px text-[10px] font-semibold text-success">
        <BadgeCheck className="size-3" aria-hidden="true" />
        QC
      </span>
    ) : null}
    {entry.kind === "FB_WRONG" ? (
      <span className="rounded bg-danger-soft px-1 py-px text-[10px] font-semibold text-danger">
        FB sai
      </span>
    ) : entry.kind === "FB_EXTRA" ? (
      <span className="rounded bg-muted px-1 py-px text-[10px] font-semibold text-foreground-muted">
        FB thêm
      </span>
    ) : null}
    {entry.missingRule ? (
      <span
        className="inline-flex items-center gap-0.5 rounded bg-warning-soft px-1 py-px text-[10px] font-semibold text-foreground"
        title="Chưa có đơn giá cho dự án × quy trình vào ngày đó; điểm ghi 0."
      >
        <TriangleAlert className="size-3 text-warning" aria-hidden="true" />
        Chưa có đơn giá
      </span>
    ) : null}
  </>
);

const PointsValue = ({ entry, className }: { entry: ScoreEntry; className?: string }) => (
  <span
    className={cn(
      "font-medium tabular-nums",
      isAdjustment(entry) && entry.credits < 0 && "text-danger",
      isAdjustment(entry) && entry.credits > 0 && "text-success",
      className
    )}
  >
    {isAdjustment(entry) ? formatSignedCredit(entry.credits) : formatCredit(entry.credits)}
  </span>
);

const MoneyValue = ({ entry }: { entry: ScoreEntry }) =>
  entry.payMode === "MONEY_IF_KPI" && entry.money !== 0 ? (
    <span className="tabular-nums">{formatMoney(entry.money)}</span>
  ) : (
    <span className="text-foreground-subtle">—</span>
  );

const EntryRow = ({ entry }: { entry: ScoreEntry }) => {
  const adjustment = isAdjustment(entry);
  return (
    <tr className={cn("align-top", adjustment && "bg-warning-soft/35")}>
      <td className="py-2.5 pr-3 pl-4 whitespace-nowrap text-foreground-muted tabular-nums">
        {dayMonth(entry.businessDay)}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            {adjustment ? (
              <CornerDownRight className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
            ) : null}
            <Link
              to={taskHref(entry)}
              className="rounded font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              #{entry.task.number}
            </Link>
            <Tags entry={entry} />
          </span>
          <span
            className="max-w-56 truncate text-xs text-foreground-muted"
            title={entry.task.jobCode}
          >
            {adjustment ? "Điều chỉnh số lượng · " : ""}
            {entry.task.jobCode}
          </span>
          {entry.note ? (
            <span className="max-w-64 truncate text-xs text-foreground-muted" title={entry.note}>
              {entry.note}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className="font-mono text-xs font-semibold">{entry.project.code}</span>
        <span className="block max-w-48 truncate text-xs text-foreground-muted">
          {entry.process?.name ?? "—"}
        </span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="text-xs">{entry.shift.name}</span>
        {showKhoanMark(entry) ? (
          <span className="ml-1.5 rounded bg-brand-soft px-1 py-px text-[10px] font-semibold text-brand-text">
            Khoán
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{qtyText(entry)}</td>
      <td className="px-3 py-2.5 text-right text-foreground-muted tabular-nums">
        {formatCredit(entry.unitCredits)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <PointsValue entry={entry} />
      </td>
      <td className="py-2.5 pr-4 pl-3 text-right whitespace-nowrap">
        <MoneyValue entry={entry} />
      </td>
    </tr>
  );
};

const EntryCard = ({ entry }: { entry: ScoreEntry }) => {
  const adjustment = isAdjustment(entry);
  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", adjustment && "bg-warning-soft/35")}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5 text-[13px]">
          {adjustment ? (
            <CornerDownRight className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
          ) : null}
          <Link
            to={taskHref(entry)}
            className="-my-2 inline-flex min-h-10 items-center rounded font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            #{entry.task.number}
          </Link>
          <span className="text-xs text-foreground-muted tabular-nums">
            {dayMonth(entry.businessDay)}
          </span>
          <Tags entry={entry} />
        </span>
        <span className="truncate text-xs text-foreground-muted">
          {adjustment ? "Điều chỉnh số lượng · " : ""}
          <span className="font-mono font-semibold text-foreground">
            {entry.project.code}
          </span> · {entry.process?.name ?? "—"} · {entry.shift.name}
          {showKhoanMark(entry) ? " (Khoán)" : ""}
        </span>
        <span className="text-xs text-foreground-muted tabular-nums">
          {qtyText(entry)} tấm × {formatCredit(entry.unitCredits)}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <PointsValue entry={entry} className="text-sm" />
        {entry.payMode === "MONEY_IF_KPI" && entry.money !== 0 ? (
          <span className="text-xs">
            <MoneyValue entry={entry} />
          </span>
        ) : null}
      </div>
    </li>
  );
};
