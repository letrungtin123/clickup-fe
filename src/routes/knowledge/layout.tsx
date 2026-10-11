import { cn } from "cn";
import { Archive, ArchiveRestore, BookOpenText, BookPlus, Globe, Library, Lock, SearchX, ShieldOff, Users } from "lucide-react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { ProjectIcon } from "@/components/shared/project-icon";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { KnowledgeSpace } from "@/contracts/knowledge";
import { knowledgeErrorMessage } from "@/features/knowledge/errors";
import { useArchiveSpace, useKnowledgePermissions, useKnowledgeSpace, useKnowledgeSpaces } from "@/features/knowledge/hooks";
import { canCreateSpace, canSeeKnowledge, spaceUi } from "@/features/knowledge/model/access";
import { dateToDay, formatDay } from "@/features/knowledge/model/dates";
import { isUuid } from "@/features/knowledge/model/filters";
import { useKnowledgeAccessRevoked, useKnowledgeRoom } from "@/features/knowledge/realtime";
import { isForbiddenError, isNotFoundError } from "@/lib/api/errors";
import { useUiStore } from "@/stores/ui-store";

import type { KnowledgeSpaceOutletContext } from "./space-context";

/**
 * /k/* — the knowledge base (PD-031). The outer permission layer: without `knowledge.view` the whole
 * section is hidden (sidebar, palette) and these routes explain why instead of failing.
 */
export const KnowledgeGateRoute = () => {
  const permissions = useKnowledgePermissions();
  useKnowledgeAccessRevoked();
  if (!canSeeKnowledge(permissions)) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <EmptyState
          icon={ShieldOff}
          title="Bạn chưa có quyền xem Tri thức"
          description="Quản trị tổ chức cấp quyền “Xem tri thức” trong Cài đặt › Vai trò và quyền."
        />
      </div>
    );
  }
  return <Outlet />;
};

/** /k — every space the caller can see, in two groups like the sidebar. */
export const KnowledgeHomeRoute = () => {
  const spaces = useKnowledgeSpaces();
  const permissions = useKnowledgePermissions();
  const setNewSpaceOpen = useUiStore((state) => state.setNewSpaceOpen);
  // The list holds the archived spaces I can still open (member or org admin), read-only, after the live ones.
  const items = spaces.data?.items ?? [];
  const active = items.filter((space) => space.archivedAt === null);
  const archived = items.filter((space) => space.archivedAt !== null);
  const groups = [
    { key: "public", title: "Công khai", icon: Globe, spaces: active.filter((space) => space.visibility === "public") },
    { key: "private", title: "Riêng tư", icon: Lock, spaces: active.filter((space) => space.visibility === "private") },
    { key: "archived", title: "Đã lưu trữ", icon: Archive, spaces: archived }
  ].filter((group) => group.spaces.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        leading={
          <span className="flex size-7 items-center justify-center rounded-md bg-brand-soft text-brand-text [&_svg]:size-4">
            <Library aria-hidden="true" />
          </span>
        }
        title="Tri thức"
        description="Thông tin đã chốt của công ty và từng nhóm: quy trình, chính sách, hướng dẫn. Mọi thay đổi đều được ghi lại."
        actions={
          canCreateSpace(permissions) ? (
            <Button size="sm" onClick={() => setNewSpaceOpen(true)}>
              <BookPlus />
              <span className="max-sm:sr-only">Tạo kho</span>
            </Button>
          ) : null
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:px-8">
          {spaces.isPending ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Đang tải kho">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex flex-col gap-3 rounded-xl border bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-lg" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : spaces.isError ? (
            <ErrorState error={spaces.error} onRetry={() => void spaces.refetch()} retrying={spaces.isFetching} />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={BookOpenText}
              title="Chưa có kho tri thức nào"
              description={
                canCreateSpace(permissions)
                  ? "Tạo kho đầu tiên cho quy trình, chính sách hoặc hướng dẫn của nhóm bạn."
                  : "Khi bạn được mời vào một kho, hoặc có kho công khai, nó sẽ hiện ở đây."
              }
              action={
                canCreateSpace(permissions) ? (
                  <Button onClick={() => setNewSpaceOpen(true)}>
                    <BookPlus />
                    Tạo kho
                  </Button>
                ) : undefined
              }
            />
          ) : (
            groups.map((group) => (
              <section key={group.key} aria-labelledby={`kb-group-${group.key}`} className="flex flex-col gap-3">
                <h2
                  id={`kb-group-${group.key}`}
                  className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.06em] text-foreground-subtle uppercase"
                >
                  <group.icon className="size-3.5" aria-hidden="true" />
                  {group.title}
                  <span className="font-normal tracking-normal normal-case">· {group.spaces.length}</span>
                </h2>
                {/* grid-cols-1 (minmax(0, 1fr)): a long space name must truncate, not widen the phone column. */}
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.spaces.map((space) => (
                    <li key={space.id}>
                      {space.archivedAt ? <ArchivedSpaceCard space={space} /> : <SpaceCard space={space} />}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const SpaceCard = ({ space }: { space: KnowledgeSpace }) => (
  <Link
    to={`/k/${space.id}`}
    className={cn(
      "group/card flex h-full flex-col gap-3 rounded-xl border bg-surface p-4 shadow-xs outline-none transition-[border-color,box-shadow,transform] duration-150",
      "hover:-translate-y-px hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0",
      space.archivedAt && "opacity-75"
    )}
  >
    <div className="flex min-w-0 items-center gap-3">
      <ProjectIcon color={space.color} icon={space.icon} name={space.name} size="lg" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{space.name}</span>
        <span className="flex items-center gap-1 text-xs text-foreground-muted">
          {space.visibility === "private" ? <Lock className="size-3" aria-hidden="true" /> : <Globe className="size-3" aria-hidden="true" />}
          {space.visibility === "private" ? "Riêng tư" : "Công khai"}
          {space.myAccess ? <span>· {accessLabel(space.myAccess)}</span> : null}
        </span>
      </div>
    </div>
    <p className="line-clamp-2 min-h-[2.5em] text-[13px] leading-relaxed text-foreground-muted">
      {space.description?.trim() || "Chưa có mô tả."}
    </p>
    <div className="mt-auto flex items-center gap-3 text-xs text-foreground-subtle">
      <span className="inline-flex items-center gap-1">
        <BookOpenText className="size-3.5" aria-hidden="true" />
        {space.itemCount} mục
      </span>
      <span className="inline-flex items-center gap-1">
        <Users className="size-3.5" aria-hidden="true" />
        {space.memberCount} thành viên
      </span>
      {space.archivedAt ? (
        <span className="ml-auto inline-flex items-center gap-1">
          <Archive className="size-3.5" aria-hidden="true" />
          Đã lưu trữ
        </span>
      ) : null}
    </div>
  </Link>
);

/**
 * An archived space: it opens read-only for its members (the whole card is a link — the name stretches
 * over it); managers holding `knowledge.delete` (`capabilities.canArchive`) restore it from here.
 */
const ArchivedSpaceCard = ({ space }: { space: KnowledgeSpace }) => {
  const navigate = useNavigate();
  const archive = useArchiveSpace();
  const archivedOn = space.archivedAt ? formatDay(dateToDay(new Date(space.archivedAt))) : null;
  const restore = async () => {
    try {
      await archive.mutateAsync({ spaceId: space.id, archived: false });
      toast.success(`Đã khôi phục kho “${space.name}”`);
      void navigate(`/k/${space.id}`);
    } catch (error) {
      toast.error(knowledgeErrorMessage(error, "Không khôi phục được kho. Vui lòng thử lại."));
    }
  };
  return (
    <div
      className={cn(
        "group/card relative flex h-full flex-col gap-3 rounded-xl border border-dashed bg-surface/60 p-4 transition-[border-color,box-shadow] duration-150",
        "hover:border-border-strong hover:shadow-sm has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="opacity-75">
          <ProjectIcon color={space.color} icon={space.icon} name={space.name} size="lg" />
        </span>
        <div className="flex min-w-0 flex-col">
          {/* Stretched link: the whole card opens the space (read-only); the restore button sits above it. */}
          <Link
            to={`/k/${space.id}`}
            className="truncate text-[15px] font-semibold tracking-[-0.01em] outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            {space.name}
          </Link>
          <span className="flex items-center gap-1 text-xs text-foreground-muted">
            <Archive className="size-3" aria-hidden="true" />
            {archivedOn ? `Lưu trữ ngày ${archivedOn}` : "Đã lưu trữ"} · chỉ xem
          </span>
        </div>
      </div>
      <p className="line-clamp-2 min-h-[2.5em] text-[13px] leading-relaxed text-foreground-muted">
        {space.itemCount} mục, {space.memberCount} thành viên.{" "}
        {space.capabilities.canArchive ? "Khôi phục để mọi người dùng lại kho." : "Mở để xem lại nội dung."}
      </p>
      {space.capabilities.canArchive ? (
        <Button variant="outline" size="sm" className="relative z-10 mt-auto self-start" disabled={archive.isPending} onClick={() => void restore()}>
          {archive.isPending ? <Spinner /> : <ArchiveRestore />}
          Khôi phục kho
        </Button>
      ) : null}
    </div>
  );
};

const accessLabel = (level: NonNullable<KnowledgeSpace["myAccess"]>) =>
  level === "manage" ? "Quản lý" : level === "submit" ? "Thành viên" : "Chỉ xem";

/**
 * /k/:spaceId — resolves the space (statuses, categories, tags), joins its realtime room and hands it to
 * the child routes.
 */
export const KnowledgeSpaceLayoutRoute = () => {
  const { spaceId = "" } = useParams();
  const valid = isUuid(spaceId);
  const space = useKnowledgeSpace(valid ? spaceId : undefined);
  const permissions = useKnowledgePermissions();
  // Archived spaces have no live room (nothing changes in them; restore / delete reach the sidebar sync).
  useKnowledgeRoom(valid && space.data && space.data.archivedAt === null ? spaceId : null);

  if (!valid) return <KnowledgeNotFound />;
  if (space.isPending) return <SpaceSkeleton />;
  if (space.isError) {
    // Private space of someone else, deleted space, archived space of others, or access revoked while reading.
    if (isNotFoundError(space.error) || isForbiddenError(space.error)) return <KnowledgeNotFound />;
    return (
      <div className="flex h-full items-center justify-center p-4">
        <ErrorState error={space.error} onRetry={() => void space.refetch()} retrying={space.isFetching} />
      </div>
    );
  }
  const context: KnowledgeSpaceOutletContext = { space: space.data, ui: spaceUi(space.data, permissions) };
  return <Outlet context={context} />;
};

/** A space or item the caller cannot open: never says which (a private space must not leak). */
export const KnowledgeNotFound = () => (
  <div className="flex h-full items-center justify-center p-4">
    <EmptyState
      icon={SearchX}
      title="Không tìm thấy kho hoặc mục này"
      description="Kho hoặc mục có thể đã bị xoá, được lưu trữ, hoặc bạn không có quyền xem. Cần xem, hãy nhờ Quản lý kho mời bạn vào."
      action={
        <Button render={<Link to="/k" />} nativeButton={false} variant="outline">
          <Library />
          Về Kho tri thức
        </Button>
      }
    />
  </div>
);

/**
 * /k/:spaceId/:itemId — the short item link used by e-mails (`?comment=<id>` opens the comments at that
 * comment); redirects to the item page.
 */
export const KnowledgeItemShortcutRoute = () => {
  const { spaceId = "", itemId = "" } = useParams();
  const location = useLocation();
  // Only well-formed ids go into the redirect path.
  if (!isUuid(spaceId) || !isUuid(itemId)) return <KnowledgeNotFound />;
  const params = new URLSearchParams(location.search);
  if (params.has("comment") && !params.has("tab")) params.set("tab", "comments");
  const query = params.toString();
  return <Navigate to={`/k/${spaceId}/i/${itemId}${query ? `?${query}` : ""}`} replace />;
};

export const SpaceSkeleton = () => (
  <div className="flex h-full flex-col" aria-busy="true" aria-label="Đang tải kho">
    <div className="flex flex-col gap-3 border-b px-4 pt-5 pb-3 md:px-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-6 w-56" />
      </div>
      <Skeleton className="h-7 w-72 rounded-lg" />
    </div>
    <div className="flex min-h-0 flex-1">
      <div className="hidden w-60 flex-col gap-2 border-r p-4 lg:flex">
        {[70, 55, 80, 45].map((width) => (
          <Skeleton key={width} className="h-3.5" style={{ width: `${width}%` }} />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4 md:p-6">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-4" style={{ width: `${40 + ((index * 13) % 30)}%` }} />
            <Skeleton className="ml-auto h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  </div>
);
