import { cn } from "cn";
import { ArrowRight, ChevronsDown, History, ListFilter, Quote, ServerCog } from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router";

import { LoadMoreError } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { KnowledgeAuditEntry } from "@/contracts/knowledge";
import { fullDateTime, relativeTime } from "@/features/tasks/time";

import { auditActionMeta, auditChanges, type AuditResolvers } from "../../model/audit";
import { auditEntryLinks, auditToneClass, auditToneDot } from "./audit-view";

type LogProps = {
  entries: readonly KnowledgeAuditEntry[];
  spaceId: string;
  resolvers: AuditResolvers;
  /** Items purged for good (their rows no longer link anywhere). */
  purged: ReadonlySet<string>;
  /** The item currently filtered on (its rows do not offer "Lọc theo mục này"). */
  filteredItemId: string | null;
  onFilterItem: (itemId: string) => void;
};

/** Rows open their exact version (or the item) on click; the links inside stay the keyboard path. */
const useRowOpen = () => {
  const navigate = useNavigate();
  return (event: MouseEvent<HTMLElement>, href: string | null) => {
    if (!href || event.defaultPrevented || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("a, button, input, [role='button']")) return;
    // Selecting text to copy it must not navigate away.
    if (window.getSelection()?.toString()) return;
    void navigate(href);
  };
};

// --- Desktop / tablet: table ----------------------------------------------------------------------

/**
 * The space audit log as a table (tablet and up). `compact` (tablet) merges "Người" and "Thời gian" into
 * one column so the details keep a readable width without horizontal scrolling.
 */
export const AuditTable = ({ compact = false, ...props }: LogProps & { compact?: boolean }) => {
  const open = useRowOpen();
  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-xl border bg-surface">
      <table className={cn("w-full table-fixed text-[13px]", compact ? "min-w-[40rem]" : "min-w-[50rem]")}>
        <caption className="sr-only">Nhật ký thao tác của kho, mới nhất trước</caption>
        <colgroup>
          {compact ? (
            <col className="w-44" />
          ) : (
            <>
              <col className="w-32" />
              <col className="w-44" />
            </>
          )}
          {/* Fits the longest label ("Khôi phục từ thùng rác") on one line. */}
          <col className="w-48" />
          <col className="w-[22%]" />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b text-left text-xs text-foreground-muted">
            {compact ? (
              <th scope="col" className="py-2.5 pr-3 pl-4 font-medium">
                Người · Thời gian
              </th>
            ) : (
              <>
                <th scope="col" className="py-2.5 pr-3 pl-4 font-medium">
                  Thời gian
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Người
                </th>
              </>
            )}
            <th scope="col" className="px-3 py-2.5 font-medium">
              Thao tác
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Mục
            </th>
            <th scope="col" className="py-2.5 pr-4 pl-3 font-medium">
              Chi tiết
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {props.entries.map((entry) => {
            const links = auditEntryLinks(entry, props.spaceId, props.purged);
            const href = links.version ?? links.item;
            return (
              <tr
                key={entry.id}
                onClick={(event) => open(event, href)}
                className={cn(
                  "group/row align-top transition-colors",
                  href && "cursor-pointer hover:bg-surface-hover/60"
                )}
              >
                {compact ? (
                  <td className="py-3 pr-3 pl-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <Actor entry={entry} />
                      <EntryTime entry={entry} className="pl-6" />
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="py-3 pr-3 pl-4 whitespace-nowrap">
                      <EntryTime entry={entry} />
                    </td>
                    <td className="px-3 py-3">
                      <Actor entry={entry} />
                    </td>
                  </>
                )}
                <td className="px-3 py-3">
                  <ActionPill entry={entry} />
                </td>
                <td className="px-3 py-3">
                  <ItemRef
                    entry={entry}
                    href={links.item}
                    purged={props.purged}
                    filteredItemId={props.filteredItemId}
                    onFilterItem={props.onFilterItem}
                  />
                </td>
                <td className="py-3 pr-4 pl-3">
                  <AuditDetails entry={entry} resolvers={props.resolvers} versionHref={links.version} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// --- Phones: cards --------------------------------------------------------------------------------

export const AuditCards = (props: LogProps) => {
  const open = useRowOpen();
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-surface" aria-label="Nhật ký thao tác của kho">
      {props.entries.map((entry) => {
        const links = auditEntryLinks(entry, props.spaceId, props.purged);
        const href = links.version ?? links.item;
        return (
          <li
            key={entry.id}
            onClick={(event) => open(event, href)}
            className={cn(
              "group/row flex min-w-0 flex-col gap-2 px-3.5 py-3",
              href && "cursor-pointer active:bg-surface-hover/60"
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Actor entry={entry} className="flex-1" />
              <EntryTime entry={entry} className="shrink-0 text-[11px]" />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
              <ActionPill entry={entry} />
              <ItemRef
                entry={entry}
                href={links.item}
                purged={props.purged}
                filteredItemId={props.filteredItemId}
                onFilterItem={props.onFilterItem}
              />
            </div>
            <AuditDetails entry={entry} resolvers={props.resolvers} versionHref={links.version} />
          </li>
        );
      })}
    </ul>
  );
};

// --- Cells ----------------------------------------------------------------------------------------

const EntryTime = ({ entry, className }: { entry: KnowledgeAuditEntry; className?: string }) => (
  <time
    dateTime={entry.createdAt}
    title={fullDateTime(entry.createdAt)}
    className={cn("text-xs text-foreground-muted tabular-nums", className)}
  >
    {relativeTime(entry.createdAt)}
  </time>
);

const Actor = ({ entry, className }: { entry: KnowledgeAuditEntry; className?: string }) =>
  entry.actor ? (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <UserAvatar user={entry.actor} size="xs" />
      <span className="truncate font-medium text-foreground">{entry.actor.displayName}</span>
    </span>
  ) : (
    <span
      className={cn("flex min-w-0 items-center gap-1.5 text-foreground-muted", className)}
      title="Thao tác tự động của hệ thống (ví dụ: tự xoá khỏi thùng rác sau 30 ngày)"
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
        <ServerCog className="size-3" aria-hidden="true" />
      </span>
      <span className="truncate">Hệ thống</span>
    </span>
  );

const ActionPill = ({ entry }: { entry: KnowledgeAuditEntry }) => {
  const meta = auditActionMeta[entry.action];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-xs leading-5 font-medium",
        auditToneClass[meta.tone]
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", auditToneDot[meta.tone])} />
      <span className="min-w-0">{meta.label}</span>
    </span>
  );
};

const ItemRef = ({
  entry,
  href,
  purged,
  filteredItemId,
  onFilterItem
}: { entry: KnowledgeAuditEntry; href: string | null } & Pick<LogProps, "purged" | "filteredItemId" | "onFilterItem">) => {
  const { itemId } = entry;
  if (!itemId) return <span className="text-foreground-subtle">Kho</span>;
  const title = entry.itemTitle?.trim() || "Mục không tên";
  const gone = purged.has(itemId) || entry.action === "ITEM_PURGED";
  return (
    <span className="flex min-w-0 items-start gap-1">
      {href ? (
        <Link
          to={href}
          className="min-w-0 rounded font-medium break-words text-foreground underline-offset-2 outline-none pointer-coarse:-my-2.5 pointer-coarse:py-2.5 hover:text-brand-text hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {title}
        </Link>
      ) : (
        <span className="min-w-0 break-words text-foreground-muted">
          {title}
          {gone ? <span className="ml-1 text-xs text-foreground-subtle">(đã xoá vĩnh viễn)</span> : null}
        </span>
      )}
      {filteredItemId !== itemId ? (
        <button
          type="button"
          onClick={() => onFilterItem(itemId)}
          aria-label={`Chỉ xem nhật ký của “${title}”`}
          title="Chỉ xem nhật ký của mục này"
          className={cn(
            "-my-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-foreground-subtle outline-none transition-opacity",
            "hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
            "pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-coarse:size-8"
          )}
        >
          <ListFilter className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
};

const VISIBLE_CHANGES = 4;

/** "Trạng thái: Nháp → Đã ban hành" lines, the reason (quoted) and the version the row created. */
const AuditDetails = ({
  entry,
  resolvers,
  versionHref
}: {
  entry: KnowledgeAuditEntry;
  resolvers: AuditResolvers;
  versionHref: string | null;
}) => {
  const changes = useMemo(() => auditChanges(entry, resolvers), [entry, resolvers]);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? changes : changes.slice(0, VISIBLE_CHANGES);
  const hidden = changes.length - visible.length;
  const reason = entry.reason?.trim();

  if (changes.length === 0 && !reason && entry.versionNumber === null) {
    return <span className="text-foreground-subtle">—</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {visible.length > 0 ? (
        <dl className="flex min-w-0 flex-col gap-1">
          {visible.map((change) => (
            <div key={change.key} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 leading-5">
              <dt className="shrink-0 text-xs text-foreground-muted">{change.label}:</dt>
              <dd className="min-w-0 wrap-break-word">
                {change.before !== null && change.after !== null ? (
                  <>
                    <span className="text-foreground-muted">{change.before}</span>
                    <ArrowRight className="mx-1 inline size-3 align-[-1px] text-foreground-subtle" aria-hidden="true" />
                    <span className="sr-only">thành</span>
                    <span className="font-medium text-foreground">{change.after}</span>
                  </>
                ) : change.after !== null ? (
                  <span className="text-foreground">{change.after}</span>
                ) : (
                  <span className="text-foreground-muted">{change.before}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="self-start rounded text-xs font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:-my-1.5 pointer-coarse:py-3"
        >
          {expanded ? "Thu gọn" : `Xem thêm ${hidden} thay đổi`}
        </button>
      ) : null}
      {reason ? (
        <p className="flex min-w-0 items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs leading-5 text-foreground">
          <Quote className="mt-1 size-3 shrink-0 text-foreground-subtle" aria-hidden="true" />
          <span className="min-w-0 wrap-break-word">
            <span className="font-medium text-foreground-muted">Lý do: </span>“{reason}”
          </span>
        </p>
      ) : null}
      {entry.versionNumber !== null ? (
        versionHref ? (
          <Link
            to={versionHref}
            className="inline-flex items-center gap-1 self-start rounded text-xs font-medium text-brand-text underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:-my-1.5 pointer-coarse:py-3"
          >
            <History className="size-3.5" aria-hidden="true" />
            Phiên bản {entry.versionNumber}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-foreground-subtle">
            <History className="size-3.5" aria-hidden="true" />
            Phiên bản {entry.versionNumber}
          </span>
        )
      ) : null}
    </div>
  );
};

// --- Loading / paging -----------------------------------------------------------------------------

export const AuditSkeleton = ({ cards }: { cards: boolean }) => (
  <div className="overflow-hidden rounded-xl border bg-surface" aria-hidden="true">
    {[0, 1, 2, 3, 4, 5].map((index) =>
      cards ? (
        <div key={index} className="flex flex-col gap-2 border-b px-3.5 py-3 last:border-b-0">
          <div className="flex items-center gap-2">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="h-3" style={{ width: `${45 + ((index * 17) % 40)}%` }} />
        </div>
      ) : (
        <div key={index} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-28 rounded-md" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${25 + ((index * 13) % 25)}%` }} />
        </div>
      )
    )}
  </div>
);

export const LoadMoreFooter = ({
  hasMore,
  loading,
  failed,
  onLoad
}: {
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onLoad: () => void;
}) => {
  if (failed) return <LoadMoreError onRetry={onLoad} retrying={loading} />;
  if (!hasMore) return null;
  return (
    <Button variant="outline" size="sm" className="self-center" onClick={onLoad} disabled={loading}>
      {loading ? <Spinner /> : <ChevronsDown />}
      Tải thêm
    </Button>
  );
};
