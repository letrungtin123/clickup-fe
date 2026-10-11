import { ArchiveRestore, RefreshCw, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router";

import { ColorDot } from "@/components/shared/color-dot";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { TrashedTask } from "@/contracts/search";
import { useProjects } from "@/features/projects/hooks";
import { ConfirmHost } from "@/features/tasks/components/confirm-host";
import { confirmAction } from "@/features/tasks/confirm-store";
import { usePurgeTask, useRestoreTask, useTrash } from "@/features/tasks/hooks";
import { fullDateTime, relativeTime } from "@/features/tasks/time";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /trash — soft-deleted task subtrees: restore (task.delete + submit) or purge (project managers). */
export const TrashRoute = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get("project");
  const projectId = raw && uuidPattern.test(raw) ? raw : undefined;
  const projects = useProjects();
  const trash = useTrash(projectId);
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (trash.data?.pages ?? []).flatMap((page) => page.items).filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
  }, [trash.data]);
  const restore = useRestoreTask();
  const purge = usePurgeTask();

  const projectName = projects.data?.items.find((project) => project.id === projectId)?.name;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConfirmHost />
      <PageHeader
        title="Thùng rác"
        description="Công việc đã xóa (kèm việc con) ở các dự án bạn xem được. Khôi phục để đưa về đúng vị trí cũ."
        actions={
          <Select
            value={projectId ?? "all"}
            onValueChange={(value) =>
              setParams(
                (current) => {
                  const next = new URLSearchParams(current);
                  if (value && value !== "all") next.set("project", String(value));
                  else next.delete("project");
                  return next;
                },
                { replace: true }
              )
            }
          >
            <SelectTrigger size="sm" className="min-w-44" aria-label="Lọc theo dự án">
              <SelectValue>{projectName ?? "Tất cả dự án"}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">Tất cả dự án</SelectItem>
              {(projects.data?.items ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <ColorDot color={project.color} />
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6">
          {trash.isPending ? (
            <div className="overflow-hidden rounded-lg border" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex h-14 items-center gap-3 border-b px-3 last:border-b-0">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3" style={{ width: `${30 + index * 9}%` }} />
                  <Skeleton className="ml-auto h-7 w-20 rounded-md" />
                </div>
              ))}
            </div>
          ) : trash.isError ? (
            <ErrorState error={trash.error} onRetry={() => void trash.refetch()} retrying={trash.isFetching} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Trash2}
              title="Thùng rác trống"
              description={projectName ? `Không có công việc nào đã xóa trong ${projectName}.` : "Công việc bị xóa sẽ nằm ở đây để bạn khôi phục khi cần."}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <ul className="overflow-hidden rounded-lg border bg-surface">
                {items.map((item) => (
                  <TrashRow
                    key={item.id}
                    item={item}
                    restoring={restore.isPending && restore.variables?.id === item.id}
                    purging={purge.isPending && purge.variables === item.id}
                    onRestore={() => restore.mutate({ id: item.id, projectId: item.projectId })}
                    onPurge={() =>
                      void confirmAction({
                        title: `Xóa vĩnh viễn ${item.key}?`,
                        description:
                          item.subtaskCount > 0
                            ? `“${item.title}” và ${item.subtaskCount} việc con sẽ bị xóa vĩnh viễn, kèm bình luận và tệp. Không thể hoàn tác.`
                            : `“${item.title}” sẽ bị xóa vĩnh viễn, kèm bình luận và tệp. Không thể hoàn tác.`,
                        confirmLabel: "Xóa vĩnh viễn",
                        destructive: true
                      }).then((ok) => ok && purge.mutate(item.id))
                    }
                  />
                ))}
              </ul>
              {trash.hasNextPage ? (
                <Button variant="outline" size="sm" className="self-center" onClick={() => void trash.fetchNextPage()} disabled={trash.isFetchingNextPage}>
                  {trash.isFetchingNextPage ? <Spinner /> : <RefreshCw />}
                  Tải thêm
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TrashRow = ({
  item,
  restoring,
  purging,
  onRestore,
  onPurge
}: {
  item: TrashedTask;
  restoring: boolean;
  purging: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) => (
  <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2.5 last:border-b-0 sm:flex-nowrap">
    {/* Phones: the text takes the whole first line and the actions wrap below it. */}
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 max-sm:basis-full">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 font-mono text-[11px] text-foreground-subtle">{item.key}</span>
        <span className="truncate text-[13px] font-medium">{item.title}</span>
        {item.subtaskCount > 0 ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] text-foreground-muted">+{item.subtaskCount} việc con</span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-foreground-subtle">
        <span className="truncate">
          {item.projectName} / {item.listName}
        </span>
        <span aria-hidden="true">·</span>
        {item.deletedBy ? (
          <span className="inline-flex items-center gap-1">
            <UserAvatar user={item.deletedBy} size="xs" className="size-4 text-[8px]" />
            {item.deletedBy.displayName}
          </span>
        ) : null}
        <time dateTime={item.deletedAt} title={fullDateTime(item.deletedAt)}>
          đã xóa {relativeTime(item.deletedAt)}
        </time>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-1.5">
      {item.canRestore ? (
        <Button variant="outline" size="sm" onClick={onRestore} disabled={restoring}>
          {restoring ? <Spinner /> : <ArchiveRestore />}
          Khôi phục
        </Button>
      ) : null}
      {item.canPurge ? (
        <Button variant="ghost" size="sm" className="text-foreground-muted hover:text-danger" onClick={onPurge} disabled={purging}>
          {purging ? <Spinner /> : <Trash2 />}
          Xóa vĩnh viễn
        </Button>
      ) : null}
      {!item.canRestore && !item.canPurge ? <span className="text-xs text-foreground-subtle">Chỉ xem</span> : null}
    </div>
  </li>
);
