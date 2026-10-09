import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallback while a lazy route chunk loads: header + content skeleton, no spinner. */
export const RouteFallback = () => (
  <div className="flex h-full flex-col" aria-busy="true" aria-label="Đang tải">
    <div className="flex flex-col gap-3 border-b px-4 pt-5 pb-4 md:px-6">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-6 w-64 max-w-full" />
    </div>
    <div className="flex flex-col gap-3 p-4 md:px-6">
      {[80, 64, 72, 56, 68].map((width, index) => (
        <Skeleton key={index} className="h-4" style={{ width: `${width}%` }} />
      ))}
    </div>
  </div>
);
