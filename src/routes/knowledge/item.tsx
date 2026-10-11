import { cn } from "cn";
import {
  ArchiveRestore,
  ChevronDown,
  History,
  Info,
  Library,
  MessageSquare,
  NotebookPen,
  Paperclip,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { AvatarGroup } from "@/components/shared/user-avatar";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { KnowledgeItemDetail, KnowledgeSpaceDetail } from "@/contracts/knowledge";
import { useSessionContext } from "@/features/auth/hooks";
import { knowledgeAttachmentSource } from "@/features/knowledge/attachments";
import { ReviewDueBadge, RetiredBanner } from "@/features/knowledge/components/badges";
import { ArchivedSpaceNotice } from "@/features/knowledge/components/settings/archived-notice";
import { KnowledgeComments } from "@/features/knowledge/components/comments";
import { KnowledgeBodyView } from "@/features/knowledge/components/knowledge-body";
import { ItemHistory } from "@/features/knowledge/components/history-panel";
import { ItemImportanceMenu, ItemStatusMenu, ItemToolbar } from "@/features/knowledge/components/item-actions";
import { ItemInfoPanel } from "@/features/knowledge/components/item-info";
import { useKeepFocusVisible } from "@/features/knowledge/editor/scroll";
import { ReasonDialog } from "@/features/knowledge/components/reason-dialog";
import { TocNav, TocSheetButton } from "@/features/knowledge/components/toc";
import { knowledgeErrorMessage } from "@/features/knowledge/errors";
import { useKnowledgeItem, useRestoreItem } from "@/features/knowledge/hooks";
import { approvalLocked, isDraft, isRetired, itemActions, reasonRequired } from "@/features/knowledge/model/access";
import { bodyImageIds } from "@/features/knowledge/model/body";
import { isUuid } from "@/features/knowledge/model/filters";
import { extractToc } from "@/features/knowledge/model/toc";
import { useItemFieldChange } from "@/features/knowledge/use-item-change";
import "@/features/knowledge/knowledge.css";
import { AttachmentSourceContext } from "@/features/tasks/attachments";
import { FileRow, ImageLightbox, ImageThumb } from "@/features/tasks/components/detail/attachment-tiles";
import { ConfirmHost } from "@/features/tasks/components/confirm-host";
import { fullDateTime, relativeTime } from "@/features/tasks/time";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useMediaQuery } from "@/hooks/use-media-query";
import { isApiError } from "@/lib/api/errors";

import { KnowledgeNotFound } from "./layout";
import { useKnowledgeSpaceOutlet } from "./space-context";

type Tab = "comments" | "history";

const parseVersion = (raw: string | null) => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
};

const parseCompare = (raw: string | null): [number, number] | null => {
  const [a, b] = (raw ?? "").split(",").map(Number);
  return a && b && Number.isInteger(a) && Number.isInteger(b) && a > 0 && b > 0 ? [Math.min(a, b), Math.max(a, b)] : null;
};

/**
 * /k/:spaceId/i/:itemId — reading first (PD-031 §09): title, importance + status, info panel, automatic
 * table of contents, body, attachments; then Bình luận · Lịch sử (?tab=, ?version=, ?compare=).
 * Phones: the TOC folds into a button and comments / history open as sheets.
 */
export const KnowledgeItemRoute = () => {
  const { itemId = "" } = useParams();
  const { space } = useKnowledgeSpaceOutlet();
  const valid = isUuid(itemId);
  const item = useKnowledgeItem(valid ? itemId : undefined);

  if (!valid) return <KnowledgeNotFound />;
  if (item.isPending) return <ItemSkeleton />;
  if (item.isError) {
    // A draft of someone else, a purged item, no access: the same not-found state as the spaces.
    if (isApiError(item.error) && (item.error.status === 404 || item.error.status === 403)) return <KnowledgeNotFound />;
    return (
      <div className="flex h-full items-center justify-center p-4">
        <ErrorState error={item.error} onRetry={() => void item.refetch()} retrying={item.isFetching} />
      </div>
    );
  }
  if (item.data.spaceId !== space.id) return <KnowledgeNotFound />;
  return <ItemPage item={item.data} space={space} />;
};

const ItemPage = ({ item, space }: { item: KnowledgeItemDetail; space: KnowledgeSpaceDetail }) => {
  const session = useSessionContext();
  const [params, setParams] = useSearchParams();
  const scrollRoot = useRef<HTMLDivElement | null>(null);
  const [pageScroller, setPageScroller] = useState<HTMLDivElement | null>(null);
  const setScrollRoot = useCallback((node: HTMLDivElement | null) => {
    scrollRoot.current = node;
    setPageScroller(node);
  }, []);
  // Tablets: the inline comment composer stays in view when the on-screen keyboard opens.
  useKeepFocusVisible(pageScroller);
  const breakpoint = useBreakpoint();
  const phone = breakpoint === "mobile";
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const extraWide = useMediaQuery("(min-width: 1440px)", true);
  const toc = useMemo(() => extractToc(item.body), [item.body]);
  const fieldChange = useItemFieldChange(item);
  const actions = itemActions(item, space);
  // Presence only matters to people who can edit (the server also lists whoever saved in the last minutes).
  const others = actions.edit ? item.editing.filter((user) => user.id !== session.user.id) : [];

  const tab: Tab = params.get("tab") === "history" && actions.history ? "history" : "comments";
  // A comment deep link (?comment=, also via the short link) opens the comments sheet on phones.
  const tabRequested = params.has("tab") || params.has("comment");
  const version = parseVersion(params.get("version"));
  const compare = parseCompare(params.get("compare"));
  const setParam = (updates: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(updates)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );

  const history = actions.history ? (
    <ItemHistory
      item={item}
      space={space}
      version={version}
      compare={compare}
      onOpenVersion={(number) => setParam({ version: number === null ? null : String(number), compare: null })}
      onCompare={(pair) => setParam({ compare: pair ? `${pair[0]},${pair[1]}` : null, version: null })}
    />
  ) : null;
  const comments = <KnowledgeComments item={item} space={space} focusCommentId={params.get("comment")} showHeading={false} />;

  return (
    <div className="kb-touch flex h-full min-h-0 flex-col">
      <ConfirmHost />
      <ItemTopBar item={item} space={space} compact={phone} onShowHistory={() => setParam({ tab: "history" })} />
      <div ref={setScrollRoot} className="min-h-0 flex-1 overflow-y-auto scroll-smooth motion-reduce:scroll-auto">
        <div
          className={cn(
            "mx-auto grid w-full max-w-[84rem] justify-center gap-x-10 px-4 pt-6 pb-24 md:px-8 md:pt-8",
            extraWide
              ? "grid-cols-[13.5rem_minmax(0,46rem)_17.5rem]"
              : wide
                ? "grid-cols-[minmax(0,46rem)_17.5rem]"
                : "grid-cols-[minmax(0,46rem)]"
          )}
        >
          {extraWide ? (
            <aside className="sticky top-6 -m-1 max-h-[calc(100dvh-6rem)] self-start overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]">
              <TocNav entries={toc} scrollRoot={scrollRoot} />
            </aside>
          ) : null}

          <article className="flex min-w-0 flex-col gap-5" aria-labelledby="kb-item-title">
            {space.archivedAt ? <ArchivedSpaceNotice space={space} canRestore={space.capabilities.canArchive} /> : null}
            {item.deletedAt ? <TrashedBanner item={item} /> : null}
            {isRetired(item) ? <RetiredBanner statusName={item.status.name} /> : null}
            {others.length > 0 ? (
              <div role="status" className="flex items-center gap-2.5 rounded-xl border bg-surface px-3.5 py-2.5 text-[13px] shadow-xs">
                <AvatarGroup users={others} size="xs" max={3} />
                <span className="text-foreground-muted">
                  <span className="font-medium text-foreground">{others.map((user) => user.displayName).join(", ")}</span>{" "}
                  đang sửa hoặc vừa lưu mục này
                </span>
                <NotebookPen className="ml-auto size-4 shrink-0 text-brand-text" aria-hidden="true" />
              </div>
            ) : null}

            <header className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <ItemImportanceMenu item={item} space={space} change={fieldChange.change} disabled={fieldChange.pending} />
                <ItemStatusMenu item={item} space={space} change={fieldChange.change} disabled={fieldChange.pending} />
                {item.reviewDue ? <ReviewDueBadge /> : null}
              </div>
              <h1 id="kb-item-title" className="text-[26px] leading-[1.2] font-bold tracking-[-0.025em] text-pretty sm:text-[32px]">
                {item.title}
              </h1>
              {item.summary ? (
                <p className="text-[16px] leading-relaxed text-foreground-muted sm:text-[17px]">{item.summary}</p>
              ) : null}
              <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-foreground-subtle">
                <span>Phiên bản {item.version}</span>
                <span aria-hidden="true">·</span>
                <span>
                  cập nhật <time dateTime={item.updatedAt} title={fullDateTime(item.updatedAt)}>{relativeTime(item.updatedAt)}</time>
                  {item.updatedBy ? ` bởi ${item.updatedBy.displayName}` : ""}
                </span>
                {isDraft(item) ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Bản nháp: chỉ người soạn, Thành viên và Quản lý của kho thấy</span>
                  </>
                ) : null}
              </p>
              {approvalLocked(item, space) ? (
                <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-foreground-muted">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-text" aria-hidden="true" />
                  Kho này cần Quản lý duyệt: mục đã ban hành chỉ Quản lý sửa được. Hãy bình luận góp ý bên dưới.
                </p>
              ) : null}
            </header>

            {wide ? null : <CollapsibleInfo item={item} canEdit={actions.edit} change={fieldChange.change} />}

            <div className="border-t pt-6">
              <KnowledgeBodyView
                doc={item.body}
                attachments={item.attachments}
                headingIdPrefix="kb-h"
                selfId={session.user.id}
                empty={<p className="text-[15px] text-foreground-subtle">Mục chưa có nội dung.</p>}
              />
            </div>

            <ItemAttachments item={item} />

            {phone ? (
              <MobilePanels
                item={item}
                tab={tabRequested ? tab : null}
                onOpen={(next) => setParam({ tab: next })}
                onClose={() => setParam({ tab: null, version: null, compare: null, comment: null })}
                comments={comments}
                history={history}
              />
            ) : (
              <Tabs
                value={tab}
                onValueChange={(next) => setParam({ tab: next === "comments" ? null : String(next) })}
                className="mt-6 gap-5 border-t pt-6"
              >
                <TabsList variant="line" className="h-9 gap-2">
                  <TabsTrigger value="comments" className="px-1 text-[14px]">
                    <MessageSquare />
                    Bình luận
                    <span className="rounded-full bg-muted px-1.5 text-[11px] text-foreground-muted tabular-nums">{item.commentCount}</span>
                  </TabsTrigger>
                  {actions.history ? (
                    <TabsTrigger value="history" className="px-1 text-[14px]">
                      <History />
                      Lịch sử
                    </TabsTrigger>
                  ) : null}
                </TabsList>
                <TabsContent value="comments">{comments}</TabsContent>
                {actions.history ? <TabsContent value="history">{history}</TabsContent> : null}
              </Tabs>
            )}
          </article>

          {wide ? (
            // Sticky but never taller than the screen: the lower part of "Thông tin" stays reachable.
            <aside className="sticky top-6 -m-1 flex max-h-[calc(100dvh-6rem)] flex-col gap-6 self-start overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]">
              {!extraWide ? <TocNav entries={toc} scrollRoot={scrollRoot} /> : null}
              <section aria-label="Thông tin mục" className="rounded-xl border bg-surface px-4 py-3 shadow-xs">
                <h2 className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-foreground-subtle uppercase">Thông tin</h2>
                <ItemInfoPanel item={item} canEdit={actions.edit} change={fieldChange.change} />
              </section>
            </aside>
          ) : null}
        </div>
      </div>
      {wide ? null : <TocSheetButton entries={toc} scrollRoot={scrollRoot} />}
      <ReasonDialog {...fieldChange.dialog} />
    </div>
  );
};

/** Sticky bar: breadcrumb (Tri thức / kho / chuyên mục) + item actions. */
const ItemTopBar = ({
  item,
  space,
  compact,
  onShowHistory
}: {
  item: KnowledgeItemDetail;
  space: KnowledgeSpaceDetail;
  compact: boolean;
  onShowHistory: () => void;
}) => (
  <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-5 pointer-coarse:h-14">
    <nav aria-label="Đường dẫn" className="flex min-w-0 flex-1 items-center gap-1 text-[13px] text-foreground-muted">
      <Link to="/k" className="hidden shrink-0 items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex">
        <Library className="size-3.5" aria-hidden="true" />
        Tri thức
      </Link>
      <span aria-hidden="true" className="hidden text-foreground-subtle sm:inline">
        /
      </span>
      <Link
        to={`/k/${space.id}`}
        className="min-w-0 truncate rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-3"
      >
        {space.name}
      </Link>
      {item.category ? (
        <>
          <span aria-hidden="true" className="text-foreground-subtle max-sm:hidden">
            /
          </span>
          <Link
            to={`/k/${space.id}?cat=${item.category.id}`}
            className="min-w-0 truncate rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:hidden"
          >
            {item.category.parent ? `${item.category.parent.name} › ` : ""}
            {item.category.name}
          </Link>
        </>
      ) : null}
    </nav>
    {item.deletedAt ? null : <ItemToolbar item={item} space={space} compact={compact} onShowHistory={onShowHistory} />}
  </div>
);

/** Phones / tablets: the info panel folds into a disclosure under the title. */
const CollapsibleInfo = ({
  item,
  canEdit,
  change
}: {
  item: KnowledgeItemDetail;
  canEdit: boolean;
  change: Parameters<typeof ItemInfoPanel>[0]["change"];
}) => {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border bg-surface shadow-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset pointer-coarse:py-3"
      >
        <Info className="size-4 text-foreground-subtle" aria-hidden="true" />
        <span className="font-medium">Thông tin</span>
        <span className="min-w-0 flex-1 truncate text-foreground-muted">
          {[item.owner?.displayName, item.category?.name, item.tags.length ? `${item.tags.length} tag` : null].filter(Boolean).join(" · ")}
        </span>
        <ChevronDown className={cn("size-4 text-foreground-subtle transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div className="border-t px-3.5 py-2">
          <ItemInfoPanel item={item} canEdit={canEdit} change={change} />
        </div>
      ) : null}
    </section>
  );
};

const ItemAttachments = ({ item }: { item: KnowledgeItemDetail }) => {
  const [viewing, setViewing] = useState<number | null>(null);
  // Images placed in the body are shown there, not again in the file list.
  const inBody = new Set(bodyImageIds(item.body));
  const files = item.attachments.filter((attachment) => attachment.commentId === null && !inBody.has(attachment.id));
  if (files.length === 0) return null;
  const images = files.filter((attachment) => attachment.isImage);
  const others = files.filter((attachment) => !attachment.isImage);
  return (
    <AttachmentSourceContext value={knowledgeAttachmentSource}>
      <section aria-labelledby="kb-files-heading" className="flex flex-col gap-3 border-t pt-6">
        <h2 id="kb-files-heading" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          <Paperclip className="size-4 text-foreground-muted" aria-hidden="true" />
          Tệp đính kèm
          <span className="text-[13px] font-normal text-foreground-subtle tabular-nums">{files.length}</span>
        </h2>
        {images.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {images.map((attachment, index) => (
              <ImageThumb key={attachment.id} attachment={attachment} onOpen={() => setViewing(index)} />
            ))}
          </div>
        ) : null}
        {others.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {others.map((attachment) => (
              <FileRow key={attachment.id} attachment={attachment} />
            ))}
          </div>
        ) : null}
        <ImageLightbox images={images} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />
      </section>
    </AttachmentSourceContext>
  );
};

/** Trashed item (submit+ can still open it): explain and offer the restore. */
const TrashedBanner = ({ item }: { item: KnowledgeItemDetail }) => {
  const restore = useRestoreItem(item.spaceId);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (reason?: string) =>
    restore.mutate(
      { itemId: item.id, ...(reason ? { reason } : {}) },
      {
        onSuccess: () => {
          setAsking(false);
          toast.success("Đã khôi phục mục về đúng chuyên mục cũ");
        },
        onError: (failure) => setError(knowledgeErrorMessage(failure, "Không khôi phục được mục."))
      }
    );
  return (
    <div role="note" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px]">
      <Trash2 className="size-4 shrink-0 text-danger" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold text-danger">Mục đang ở thùng rác.</span>{" "}
        <span className="text-foreground-muted">Mục được giữ 30 ngày rồi tự xoá vĩnh viễn.</span>
      </p>
      {(item.capabilities.canRestore ?? item.capabilities.canEdit) ? (
        <Button variant="outline" size="sm" onClick={() => (reasonRequired(item.importance) ? setAsking(true) : run())} disabled={restore.isPending}>
          <ArchiveRestore />
          Khôi phục
        </Button>
      ) : null}
      <ReasonDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Khôi phục “${item.title}”?`}
        description="Mục quay về đúng chuyên mục cũ."
        confirmLabel="Khôi phục"
        reason="required"
        pending={restore.isPending}
        error={error}
        onConfirm={(reason) => run(reason)}
      />
    </div>
  );
};

/** Phones: comments and history open as tall sheets from two buttons under the article. */
const MobilePanels = ({
  item,
  tab,
  onOpen,
  onClose,
  comments,
  history
}: {
  item: KnowledgeItemDetail;
  tab: Tab | null;
  onOpen: (tab: Tab) => void;
  onClose: () => void;
  comments: React.ReactNode;
  history: React.ReactNode;
}) => {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  useKeepFocusVisible(scroller);
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-5">
        <Button variant="outline" className="h-12 justify-start gap-2.5 rounded-xl" onClick={() => onOpen("comments")}>
          <MessageSquare />
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span>Bình luận</span>
            <span className="max-w-full truncate text-[11px] font-normal text-foreground-subtle">
              {item.commentCount} · {item.openCommentCount} chưa xử lý
            </span>
          </span>
        </Button>
        {history ? (
          <Button variant="outline" className="h-12 justify-start gap-2.5 rounded-xl" onClick={() => onOpen("history")}>
            <History />
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span>Lịch sử</span>
              <span className="max-w-full truncate text-[11px] font-normal text-foreground-subtle">v{item.version} · phiên bản, nhật ký</span>
            </span>
          </Button>
        ) : null}
      </div>
      <Sheet open={tab !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          // Sits on the on-screen keyboard (iOS overlays it: --keyboard-inset), so a composer stays in view.
          className="kb-touch gap-0 rounded-t-2xl p-0 pb-(--safe-bottom) data-[side=bottom]:bottom-(--keyboard-inset) data-[side=bottom]:h-[calc(92dvh-var(--keyboard-inset))]"
        >
          <span aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" />
          <SheetHeader className="flex-row items-center gap-2 border-b px-4 pt-1.5 pb-2.5">
            <div className="flex min-w-0 flex-1 flex-col">
              <SheetTitle className="text-[15px]">{tab === "history" ? "Lịch sử" : "Bình luận"}</SheetTitle>
              <SheetDescription className="truncate text-xs">{item.title}</SheetDescription>
            </div>
            <Button variant="ghost" size="icon" aria-label="Đóng" onClick={onClose}>
              <X />
            </Button>
          </SheetHeader>
          <div ref={setScroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-6">
            {tab === "history" ? history : comments}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

const ItemSkeleton = () => (
  <div className="flex h-full flex-col" aria-busy="true" aria-label="Đang tải mục">
    <div className="flex h-12 items-center gap-2 border-b px-4">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="ml-auto h-7 w-20 rounded-lg" />
    </div>
    <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-4 px-4 pt-8">
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <div className="mt-6 flex flex-col gap-2.5">
        {[96, 88, 92, 70, 84, 60].map((width, index) => (
          <Skeleton key={index} className="h-3.5" style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  </div>
);
