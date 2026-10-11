import { cn } from "cn";
import { ChevronsUpDown, Equal, Minus, Plus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import {
  collapseUnchanged,
  diffStats,
  diffVersions,
  type DiffLine,
  type DiffRow,
  type VersionSnapshot,
  type WordSegment
} from "../model/diff";

/** Typography of one flattened line, close to how it reads in the item. */
const lineClass = (line: DiffLine) => {
  switch (line.kind) {
    case "title":
      return "text-[17px] font-semibold tracking-[-0.01em]";
    case "summary":
      return "italic text-foreground-muted";
    case "heading":
      return cn("font-semibold", line.level === 1 ? "text-[16px]" : line.level === 2 ? "text-[15px]" : "text-[14px]");
    case "code":
      return "font-mono text-[12.5px] whitespace-pre-wrap";
    case "quote":
      return "border-l-2 border-brand/60 pl-2.5 text-foreground-muted";
    case "table":
      return "rounded-sm bg-muted/50 px-1.5 font-mono text-[12.5px]";
    case "image":
      return "italic text-foreground-muted";
    default:
      return "";
  }
};

const LineText = ({ line, children }: { line: DiffLine; children?: ReactNode }) => {
  const indent = line.kind === "list" || line.kind === "task" ? { paddingLeft: `${line.level * 1.1}rem` } : undefined;
  return (
    <span className={cn("min-w-0 flex-1 break-words", lineClass(line))} style={indent}>
      {line.kind === "list" ? <span className="mr-1.5 text-foreground-subtle">•</span> : null}
      {line.kind === "task" ? <span className="mr-1.5 text-foreground-subtle">{line.checked ? "☑" : "☐"}</span> : null}
      {line.kind === "title" ? <span className="sr-only">Tiêu đề: </span> : null}
      {line.kind === "summary" ? <span className="sr-only">Tóm tắt: </span> : null}
      {line.kind === "rule" ? <span className="inline-block h-px w-24 bg-border-strong align-middle" aria-label="Đường kẻ ngang" /> : (children ?? line.text)}
    </span>
  );
};

const Segments = ({ segments }: { segments: readonly WordSegment[] }) => (
  <>
    {segments.map((segment, index) =>
      segment.type === "equal" ? (
        <span key={index}>{segment.text}</span>
      ) : segment.type === "insert" ? (
        <ins key={index} className="rounded-[3px] bg-success-soft px-px text-foreground no-underline decoration-success/60 [box-shadow:inset_0_-1px_0_var(--success)]">
          {segment.text}
        </ins>
      ) : (
        <del key={index} className="rounded-[3px] bg-danger-soft px-px text-foreground-muted decoration-danger/60">
          {segment.text}
        </del>
      )
    )}
  </>
);

const Gutter = ({ type }: { type: DiffRow["type"] }) => (
  <span
    aria-hidden="true"
    className={cn(
      "flex w-5 shrink-0 justify-center pt-[3px] [&_svg]:size-3",
      type === "added" && "text-success",
      type === "removed" && "text-danger",
      type === "changed" && "text-warning",
      type === "same" && "text-transparent"
    )}
  >
    {type === "added" ? <Plus /> : type === "removed" ? <Minus /> : type === "changed" ? <ChevronsUpDown /> : <Equal />}
  </span>
);

const rowTone: Record<DiffRow["type"], string> = {
  same: "",
  added: "bg-success-soft/70",
  removed: "bg-danger-soft/70",
  changed: "bg-warning-soft/50"
};

const rowLabel: Record<DiffRow["type"], string> = {
  same: "",
  added: "Thêm: ",
  removed: "Bỏ: ",
  changed: "Sửa: "
};

/**
 * Readable comparison of two versions: added lines in green, removed in red, reworded lines with the
 * changed words highlighted; long unchanged stretches fold into "… N dòng không đổi".
 */
export const VersionDiff = ({ before, after, className }: { before: VersionSnapshot; after: VersionSnapshot; className?: string }) => {
  const rows = useMemo(() => diffVersions(before, after), [before, after]);
  const stats = diffStats(rows);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const visible = useMemo(() => collapseUnchanged(rows, 2, expanded), [expanded, rows]);

  if (stats.identical) {
    return (
      <p className={cn("rounded-lg bg-muted/60 px-3 py-3 text-[13px] text-foreground-muted", className)}>
        Hai phiên bản có nội dung giống nhau.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted" aria-live="polite">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-success" />
          {stats.added} dòng thêm
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-danger" />
          {stats.removed} dòng bỏ
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-warning" />
          {stats.changed} dòng sửa
        </span>
      </p>
      <ol className="overflow-hidden rounded-xl border bg-surface text-[13.5px] leading-relaxed">
        {visible.map((row, index) => {
          if (row.type === "gap") {
            return (
              <li key={`gap-${row.from}`} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpanded((current) => new Set([...current, row.from]))}
                  className="flex w-full items-center justify-center gap-1.5 bg-muted/50 px-3 py-1.5 text-xs text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset pointer-coarse:py-3"
                >
                  <ChevronsUpDown className="size-3.5" aria-hidden="true" />
                  {row.count} dòng không đổi
                </button>
              </li>
            );
          }
          return (
            <li key={index} className={cn("flex gap-1 border-b px-2 py-1 last:border-b-0", rowTone[row.type])}>
              <Gutter type={row.type} />
              <span className="sr-only">{rowLabel[row.type]}</span>
              {row.type === "changed" ? (
                <LineText line={row.after}>
                  <Segments segments={row.segments} />
                </LineText>
              ) : (
                <LineText line={row.line}>
                  {row.type === "removed" ? <span className="text-foreground-muted">{row.line.text}</span> : undefined}
                </LineText>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
