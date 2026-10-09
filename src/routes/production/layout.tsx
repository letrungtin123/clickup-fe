import { Outlet } from "react-router";

import { RouteFallback } from "@/components/layout/route-fallback";
import { ErrorState } from "@/components/shared/states";
import { ProductionTaskSheet } from "@/features/production/components/jobs/task-sheet";
import { isProductionHidden } from "@/features/production/errors";
import { useProductionMe } from "@/features/production/hooks";
import { NotFoundRoute } from "@/routes/errors";

/**
 * Gate for every /production/* screen (PD-011): users without a production role get the ordinary
 * not-found page, exactly like any unknown URL — the module does not exist for them.
 */
export const ProductionLayoutRoute = () => {
  const me = useProductionMe();

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
