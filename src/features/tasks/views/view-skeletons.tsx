import { cn } from "cn";
import { Construction } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

import type { TaskViewKey } from "./registry";

/** Loading skeletons per view (Suspense fallback and first-page loading). */
export const ViewSkeleton = ({ view, still = false }: { view: TaskViewKey; still?: boolean }) => {
  const bone = still ? "before:hidden" : undefined;
  if (view === "board") {
    return (
      <div className="flex h-full gap-3 overflow-hidden p-4 md:px-6" aria-hidden="true">
        {[4, 2, 3, 1].map((cards, column) => (
          <div
            key={column}
            className="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-muted/60 p-2"
          >
            <div className="flex items-center gap-2 px-1 py-1.5">
              <Skeleton className={cn("size-2.5 rounded-full", bone)} />
              <Skeleton className={cn("h-3 w-20", bone)} />
            </div>
            {Array.from({ length: cards }, (_, index) => (
              <div
                key={index}
                className="flex flex-col gap-2.5 rounded-lg border bg-surface p-3 shadow-xs"
              >
                <Skeleton
                  className={cn("h-3", bone)}
                  style={{ width: `${60 + ((index * 23 + column * 11) % 35)}%` }}
                />
                <div className="flex items-center justify-between">
                  <Skeleton className={cn("h-2.5 w-14", bone)} />
                  <Skeleton className={cn("size-5 rounded-full", bone)} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (view === "table") {
    return (
      <div className="p-4 md:px-6" aria-hidden="true">
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[minmax(12rem,2fr)_repeat(4,minmax(6rem,1fr))] gap-4 border-b bg-muted/50 px-3 py-2.5">
            {[48, 40, 36, 44, 32].map((width, index) => (
              <Skeleton key={index} className={cn("h-2.5", bone)} style={{ width: `${width}%` }} />
            ))}
          </div>
          {Array.from({ length: 10 }, (_, row) => (
            <div
              key={row}
              className="grid grid-cols-[minmax(12rem,2fr)_repeat(4,minmax(6rem,1fr))] items-center gap-4 border-b px-3 py-3 last:border-b-0"
            >
              <Skeleton
                className={cn("h-3", bone)}
                style={{ width: `${55 + ((row * 29) % 40)}%` }}
              />
              <Skeleton className={cn("h-5 w-20 rounded-full", bone)} />
              <Skeleton className={cn("size-5 rounded-full", bone)} />
              <Skeleton className={cn("h-2.5 w-16", bone)} />
              <Skeleton className={cn("h-2.5 w-10", bone)} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 md:px-6" aria-hidden="true">
      {[5, 3].map((rows, group) => (
        <div key={group} className="flex flex-col">
          <div className="flex items-center gap-2 pb-2">
            <Skeleton className={cn("h-5 w-24 rounded-full", bone)} />
            <Skeleton className={cn("h-2.5 w-6", bone)} />
          </div>
          <div className="overflow-hidden rounded-lg border">
            {Array.from({ length: rows }, (_, index) => (
              <div
                key={index}
                className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
              >
                <Skeleton className={cn("size-4 rounded-full", bone)} />
                <Skeleton
                  className={cn("h-3", bone)}
                  style={{ width: `${35 + ((index * 31 + group * 17) % 40)}%` }}
                />
                <div className="ml-auto flex items-center gap-3">
                  <Skeleton className={cn("size-5 rounded-full", bone)} />
                  <Skeleton className={cn("h-2.5 w-14", bone)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/** Static placeholder used until the task views ship. */
export const ViewPlaceholder = ({ view, title }: { view: TaskViewKey; title: string }) => (
  <div className="relative h-full min-h-[24rem] overflow-hidden">
    <div className="pointer-events-none opacity-60 [mask-image:linear-gradient(to_bottom,black_30%,transparent)]">
      <ViewSkeleton view={view} still />
    </div>
    <div className="absolute inset-x-0 top-24 flex justify-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-2 rounded-xl border bg-surface-raised/95 px-6 py-5 text-center shadow-lg backdrop-blur">
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground-muted">
          <Construction className="size-4" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[13px] text-foreground-muted">
          Chế độ xem này đang được hoàn thiện. Công việc của danh sách sẽ hiển thị tại đây.
        </p>
      </div>
    </div>
  </div>
);
