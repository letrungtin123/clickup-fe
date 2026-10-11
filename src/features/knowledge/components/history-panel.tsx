import { cn } from "cn";
import { ArrowLeftRight, Eye, GitCommitVertical, History, RotateCcw, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { LoadMoreError } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { KnowledgeAuditEntry, KnowledgeItemDetail, KnowledgeSpaceDetail } from "@/contracts/knowledge";
import { fullDateTime, relativeTime } from "@/features/tasks/time";
import { pagedErrorKind } from "@/lib/paging";

import { knowledgeErrorMessage } from "../errors";
import { useKnowledgeHistory, useKnowledgeVersion, useKnowledgeVersions, useRestoreVersion } from "../hooks";
import { itemActions, reasonRequired } from "../model/access";
import { auditActionMeta, auditChanges, type AuditResolvers } from "../model/audit";
import type { VersionSnapshot } from "../model/diff";
import { VersionDiff } from "./diff-view";
import { KnowledgeBodyView } from "./knowledge-body";
import { ReasonDialog } from "./reason-dialog";

type Props = {
  item: KnowledgeItemDetail;
  space: KnowledgeSpaceDetail;
  /** Open version (?version=N). */
  version: number | null;
  /** Open comparison (?compare=a,b). */
  compare: [number, number] | null;
  onOpenVersion: (number: number | null) => void;
  onCompare: (pair: [number, number] | null) => void;
};

/**
 * "Lịch sử" of an item (PD-031 §06): numbered immutable versions (view, compare two, restore as a new
 * version) and the item's own audit trail (every field change with before → after and the reason).
 */
export const ItemHistory = ({ item, space, version, compare, onOpenVersion, onCompare }: Props) => {
  const versions = useKnowledgeVersions(item.id);
  const history = useKnowledgeHistory(item.id);
  const [selected, setSelected] = useState<number[]>([]);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const restore = useRestoreVersion(item);
  const canRestore = itemActions(item, space).restoreVersion;
  const list = useMemo(() => (versions.data?.pages ?? []).flatMap((page) => page.items), [versions.data]);
  const entries = useMemo(() => (history.data?.pages ?? []).flatMap((page) => page.items), [history.data]);
  const versionsError = pagedErrorKind(versions);
  const historyError = pagedErrorKind(history);

  const resolvers: AuditResolvers = useMemo(() => {
    const statuses = new Map(space.statuses.map((status) => [status.id, status.name]));
    const categories = new Map(space.categories.map((category) => [category.id, category.name]));
    return { status: (id) => statuses.get(id), category: (id) => categories.get(id) };
  }, [space.categories, space.statuses]);

  const toggle = (number: number) =>
    setSelected((current) =>
      current.includes(number) ? current.filter((entry) => entry !== number) : [...current, number].slice(-2)
    );

  const doRestore = (reason: string | undefined) => {
    if (restoring === null) return;
    setRestoreError(null);
    restore.mutate(
      { number: restoring, ...(reason ? { reason } : {}) },
      {
        onSuccess: () => {
          toast.success(`Đã khôi phục phiên bản ${restoring} thành phiên bản mới`);
          setRestoring(null);
          onOpenVersion(null);
          onCompare(null);
        },
        onError: (error) => setRestoreError(knowledgeErrorMessage(error, "Không khôi phục được phiên bản."))
      }
    );
  };

  return (
    <div className="kb-touch flex flex-col gap-8">
      <section aria-labelledby="kb-versions-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="kb-versions-heading" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
            <GitCommitVertical className="size-4 text-foreground-muted" aria-hidden="true" />
            Phiên bản
          </h2>
          <span className="text-xs text-foreground-subtle">Chọn 2 phiên bản để so sánh</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={selected.length !== 2}
            onClick={() => {
              const [a = 0, b = 0] = [...selected].sort((left, right) => left - right);
              onCompare([a, b]);
            }}
          >
            <ArrowLeftRight />
            So sánh{selected.length === 2 ? ` v${Math.min(...selected)} ↔ v${Math.max(...selected)}` : ""}
          </Button>
        </div>
        {versions.isPending ? (
          <RowsSkeleton />
        ) : versionsError === "initial" ? (
          <InlineError message={knowledgeErrorMessage(versions.error, "Không tải được phiên bản.")} onRetry={() => void versions.refetch()} />
        ) : (
          <ol className="overflow-hidden rounded-xl border bg-surface">
            {list.map((entry) => {
              const current = entry.number === item.version;
              const checked = selected.includes(entry.number);
              return (
                <li key={entry.number} className={cn("flex items-start gap-3 border-b px-3 py-3 last:border-b-0", checked && "bg-brand-soft/40")}>
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(entry.number)}
                    aria-label={`Chọn phiên bản ${entry.number} để so sánh`}
                    className="mt-1"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-[13px] font-semibold tabular-nums">v{entry.number}</span>
                      {current ? (
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text">Hiện tại</span>
                      ) : null}
                      {entry.restoredFrom ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium">
                          <RotateCcw className="size-3" aria-hidden="true" />
                          Khôi phục từ v{entry.restoredFrom}
                        </span>
                      ) : null}
                    </div>
                    {entry.note ? <p className="text-[13px] text-foreground">“{entry.note}”</p> : null}
                    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-foreground-muted">
                      {entry.author ? <UserAvatar user={entry.author} size="xs" className="size-4 text-[8px]" /> : null}
                      <span>{entry.author?.displayName ?? "Hệ thống"}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={entry.createdAt} title={fullDateTime(entry.createdAt)}>
                        {relativeTime(entry.createdAt)}
                      </time>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    <Button variant="ghost" size="xs" onClick={() => onOpenVersion(entry.number)} aria-label={`Xem phiên bản ${entry.number}`}>
                      <Eye />
                      <span className="max-sm:sr-only">Xem</span>
                    </Button>
                    {!current && canRestore ? (
                      <Button variant="ghost" size="xs" onClick={() => setRestoring(entry.number)} aria-label={`Khôi phục phiên bản ${entry.number}`}>
                        <RotateCcw />
                        <span className="max-sm:sr-only">Khôi phục</span>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {versions.hasNextPage ? (
          versionsError === "next" ? (
            <LoadMoreError onRetry={() => void versions.fetchNextPage()} retrying={versions.isFetchingNextPage} />
          ) : (
            <Button variant="ghost" size="sm" className="self-center text-foreground-muted" onClick={() => void versions.fetchNextPage()} disabled={versions.isFetchingNextPage}>
              {versions.isFetchingNextPage ? <Spinner /> : null}
              Tải phiên bản cũ hơn
            </Button>
          )
        ) : null}
      </section>

      <section aria-labelledby="kb-activity-heading" className="flex flex-col gap-3">
        <h2 id="kb-activity-heading" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          <ScrollText className="size-4 text-foreground-muted" aria-hidden="true" />
          Nhật ký của mục
        </h2>
        {history.isPending ? (
          <RowsSkeleton />
        ) : historyError === "initial" ? (
          <InlineError message={knowledgeErrorMessage(history.error, "Không tải được nhật ký.")} onRetry={() => void history.refetch()} />
        ) : entries.length === 0 ? (
          <p className="text-[13px] text-foreground-subtle">Chưa có thao tác nào.</p>
        ) : (
          <ol className="relative flex flex-col gap-0.5 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-border">
            {entries.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} resolvers={resolvers} onOpenVersion={onOpenVersion} />
            ))}
          </ol>
        )}
        {history.hasNextPage ? (
          historyError === "next" ? (
            <LoadMoreError onRetry={() => void history.fetchNextPage()} retrying={history.isFetchingNextPage} />
          ) : (
            <Button variant="ghost" size="sm" className="self-center text-foreground-muted" onClick={() => void history.fetchNextPage()} disabled={history.isFetchingNextPage}>
              {history.isFetchingNextPage ? <Spinner /> : <History />}
              Tải thao tác cũ hơn
            </Button>
          )
        ) : null}
      </section>

      <VersionDialog
        item={item}
        number={version}
        canRestore={canRestore}
        onClose={() => onOpenVersion(null)}
        onCompare={(number) => onCompare([Math.min(number, item.version), Math.max(number, item.version)])}
        onRestore={setRestoring}
      />
      <CompareDialog item={item} pair={compare} numbers={list.map((entry) => entry.number)} onChange={onCompare} />
      <ReasonDialog
        open={restoring !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRestoring(null);
            setRestoreError(null);
          }
        }}
        title={`Khôi phục phiên bản ${restoring ?? ""}?`}
        description={`Nội dung của v${restoring ?? ""} sẽ thành phiên bản mới (v${item.version + 1}). Các phiên bản cũ vẫn được giữ nguyên.`}
        confirmLabel="Khôi phục thành phiên bản mới"
        reason={reasonRequired(item.importance) ? "required" : "optional"}
        pending={restore.isPending}
        error={restoreError}
        onConfirm={doRestore}
      />
    </div>
  );
};

const RowsSkeleton = () => (
  <div className="flex flex-col gap-3 rounded-xl border p-3" aria-hidden="true">
    {[0, 1, 2].map((index) => (
      <div key={index} className="flex items-center gap-3">
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-3" style={{ width: `${50 - index * 10}%` }} />
      </div>
    ))}
  </div>
);

const InlineError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" className="flex items-center gap-2 text-[13px] text-foreground-muted">
    {message}
    <Button variant="ghost" size="xs" onClick={onRetry}>
      Thử lại
    </Button>
  </div>
);

const toneDot: Record<string, string> = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-foreground-subtle"
};

const HistoryRow = ({
  entry,
  resolvers,
  onOpenVersion
}: {
  entry: KnowledgeAuditEntry;
  resolvers: AuditResolvers;
  onOpenVersion: (number: number) => void;
}) => {
  const meta = auditActionMeta[entry.action];
  const changes = auditChanges(entry, resolvers);
  return (
    <li className="relative flex gap-3 py-1.5 pl-0.5">
      <span className="relative z-[1] mt-1.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border bg-background">
        <span aria-hidden="true" className={cn("size-2 rounded-full", toneDot[meta.tone])} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13px]">
        <p className="leading-6">
          <span className="font-medium">{entry.actor?.displayName ?? "Hệ thống"}</span>{" "}
          <span className="text-foreground-muted">· {meta.label.toLocaleLowerCase("vi")}</span>
          <span aria-hidden="true" className="text-foreground-subtle">
            {" "}
            ·{" "}
          </span>
          <time dateTime={entry.createdAt} title={fullDateTime(entry.createdAt)} className="text-xs text-foreground-subtle">
            {relativeTime(entry.createdAt)}
          </time>
          {entry.versionNumber ? (
            <button
              type="button"
              onClick={() => onOpenVersion(entry.versionNumber ?? 0)}
              className="relative ml-2 rounded font-mono text-xs text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-3"
            >
              v{entry.versionNumber}
            </button>
          ) : null}
        </p>
        {changes.length > 0 ? (
          <ul className="flex flex-col gap-0.5 text-xs text-foreground-muted">
            {changes.slice(0, 6).map((change) => (
              <li key={change.key} className="break-words">
                <span className="text-foreground-subtle">{change.label}: </span>
                {change.before !== null ? <span className="line-through decoration-danger/50">{change.before}</span> : null}
                {change.before !== null && change.after !== null ? <span aria-label="thành"> → </span> : null}
                {change.after !== null ? <span className="font-medium text-foreground">{change.after}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {entry.reason ? (
          <p className="rounded-md border-l-2 border-warning bg-warning-soft/60 px-2 py-1 text-xs">
            <span className="font-medium">Lý do:</span> {entry.reason}
          </p>
        ) : null}
      </div>
    </li>
  );
};

// --- Version viewer -------------------------------------------------------------------------------

const VersionDialog = ({
  item,
  number,
  canRestore,
  onClose,
  onCompare,
  onRestore
}: {
  item: KnowledgeItemDetail;
  number: number | null;
  canRestore: boolean;
  onClose: () => void;
  onCompare: (number: number) => void;
  onRestore: (number: number) => void;
}) => {
  const version = useKnowledgeVersion(item.id, number);
  const current = number === item.version;
  return (
    <Dialog open={number !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent mobileLayout="fullscreen" className="kb-touch flex max-h-[min(90dvh,56rem)] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="gap-1 border-b px-5 pt-4 pb-3 pr-12">
          <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold">
            Phiên bản {number}
            {current ? <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text">Hiện tại</span> : null}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {version.data
              ? `${version.data.author?.displayName ?? "Hệ thống"} · ${fullDateTime(version.data.createdAt)}${version.data.note ? ` · “${version.data.note}”` : ""}`
              : "Đang tải…"}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {version.isPending ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          ) : version.isError ? (
            <InlineError message={knowledgeErrorMessage(version.error, "Không tải được phiên bản.")} onRetry={() => void version.refetch()} />
          ) : (
            <article className="mx-auto flex max-w-[44rem] flex-col gap-3">
              <h3 className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">{version.data.title}</h3>
              {version.data.summary ? <p className="text-[15px] leading-relaxed text-foreground-muted">{version.data.summary}</p> : null}
              <KnowledgeBodyView
                doc={version.data.body}
                attachments={item.attachments}
                className="mt-2"
                empty={<p className="text-foreground-subtle">(Không có nội dung)</p>}
              />
            </article>
          )}
        </div>
        {number !== null && !current ? (
          <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3 max-sm:flex-col max-sm:pb-[calc(0.75rem+var(--safe-bottom))] max-sm:[&>button]:w-full">
            <Button variant="outline" onClick={() => onCompare(number)}>
              <ArrowLeftRight />
              So sánh với hiện tại
            </Button>
            {canRestore ? (
              <Button onClick={() => onRestore(number)}>
                <RotateCcw />
                Khôi phục phiên bản này
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

// --- Comparison -----------------------------------------------------------------------------------

const CompareDialog = ({
  item,
  pair,
  numbers,
  onChange
}: {
  item: KnowledgeItemDetail;
  pair: [number, number] | null;
  numbers: number[];
  onChange: (pair: [number, number] | null) => void;
}) => {
  const from = pair?.[0] ?? null;
  const to = pair?.[1] ?? null;
  const before = useKnowledgeVersion(item.id, from);
  const after = useKnowledgeVersion(item.id, to);
  const options = numbers.length > 0 ? numbers : [item.version];
  const snapshot = (data: typeof before.data): VersionSnapshot | null =>
    data ? { title: data.title, summary: data.summary, body: data.body } : null;
  const left = snapshot(before.data);
  const right = snapshot(after.data);

  const picker = (value: number | null, onPick: (number: number) => void, label: string) => (
    <Select value={value === null ? "" : String(value)} onValueChange={(next) => next && onPick(Number(next))}>
      <SelectTrigger size="sm" className="min-w-28" aria-label={label}>
        <SelectValue>{value === null ? "Chọn" : `v${value}${value === item.version ? " (hiện tại)" : ""}`}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((number) => (
          <SelectItem key={number} value={String(number)}>
            v{number}
            {number === item.version ? " (hiện tại)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={pair !== null} onOpenChange={(open) => (open ? undefined : onChange(null))}>
      <DialogContent mobileLayout="fullscreen" className="kb-touch flex max-h-[min(90dvh,56rem)] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="gap-2 border-b px-5 pt-4 pb-3 pr-12">
          <DialogTitle className="text-[15px] font-semibold">So sánh phiên bản</DialogTitle>
          <DialogDescription className="sr-only">Phần thêm màu xanh, phần bỏ màu đỏ</DialogDescription>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            {picker(from, (number) => onChange([number, to ?? item.version]), "Phiên bản cũ")}
            <ArrowLeftRight className="size-4 text-foreground-subtle" aria-hidden="true" />
            {picker(to, (number) => onChange([from ?? 1, number]), "Phiên bản mới")}
            <span className="text-xs text-foreground-subtle">Phần thêm màu xanh, phần bỏ màu đỏ</span>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {before.isError || after.isError ? (
            <InlineError
              message={knowledgeErrorMessage(before.error ?? after.error, "Không tải được phiên bản.")}
              onRetry={() => {
                void before.refetch();
                void after.refetch();
              }}
            />
          ) : left && right ? (
            <VersionDiff before={left} after={right} />
          ) : (
            <div className="flex flex-col gap-2" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-4" style={{ width: `${90 - index * 15}%` }} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
