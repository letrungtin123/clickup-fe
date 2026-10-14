import { Outlet } from "react-router";

import { RouteFallback } from "@/components/layout/route-fallback";
import { ErrorState } from "@/components/shared/states";
import { useSessionContext } from "@/features/auth/hooks";
import { DepartmentForbidden } from "@/features/departments/components/department-forbidden";
import { ProductionTaskSheet } from "@/features/production/components/jobs/task-sheet";
import { isProductionHidden } from "@/features/production/errors";
import { useProductionMe } from "@/features/production/hooks";
import { NotFoundRoute } from "@/routes/errors";

/**
 * Gate for every /production/* screen — the Photo Retouch department's module (PD-041). People outside that
 * department get the "Bạn không thuộc phòng ban này" page; inside it, the module still needs a production role
 * (PD-011): without one it simply does not exist for them (the ordinary not-found page).
 */
export const ProductionLayoutRoute = () => {
  const inRetouch = useSessionContext().departments.includes("PHOTO_RETOUCH");
  const me = useProductionMe();

  if (!inRetouch) {
    return <DepartmentForbidden department="PHOTO_RETOUCH" />;
  }
  if (me.isPending) {
    return <RouteFallback />;
  }
  if (me.isError) {
    return isProductionHidden(me.error) ? (
      <NotFoundRoute />
    ) : (
      <div className="flex h-full items-center justify-center p-4">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} retrying={me.isFetching} />
      </div>
    );
  }
  if (me.data.roles.length === 0) {
    return <NotFoundRoute />;
  }
  return (
    <>
      <Outlet />
      {/* `?ptask=<id>` opens a production task over any production page. */}
      <ProductionTaskSheet />
    </>
  );
};
