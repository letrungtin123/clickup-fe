import { useEffect, useEffectEvent, type ReactNode } from "react";
import { useLocation } from "react-router";

import { useDepartment } from "../hooks";
import { routeAccess } from "../model";
import { DepartmentForbidden } from "./department-forbidden";

/**
 * Central department check for every page of the shell (PD-041). Opening a route of the other department switches to
 * it when the user belongs to it (a deep link, a notification, a search hit), and explains politely when they do not.
 * Only a navigation follows the route: a manual switch away from a department's page goes to Trang chủ instead
 * (useDepartment), so the guard never pulls the user back while that navigation is still loading.
 */
export const DepartmentGuard = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  const { current, departments, setDepartment } = useDepartment();
  const access = routeAccess(pathname, current, departments);

  const follow = useEffectEvent((path: string) => {
    const next = routeAccess(path, current, departments);
    if (next.kind === "switch") setDepartment(next.department);
  });
  useEffect(() => follow(pathname), [pathname]);

  if (access.kind === "forbidden") {
    return <DepartmentForbidden department={access.department} />;
  }
  return children;
};
