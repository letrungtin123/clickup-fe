import { useQueryClient } from "@tanstack/react-query";
import { useAnimate, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { departmentLabels, sortDepartments, type Department } from "@/contracts/departments";
import { useSessionContext } from "@/features/auth/hooks";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import type { SessionContext } from "@/lib/api/schemas";
import { qk } from "@/lib/query-keys";

import { departmentsApi } from "./api";
import { leavesRoute, resolveDepartment } from "./model";
import { readStoredDepartment, subscribeDepartment, writeStoredDepartment } from "./store";

const switchToastId = "department-switch";

/** More than one department: the switcher and the department badges are worth showing (cheap: session only). */
export const useHasSeveralDepartments = () => {
  const session = useSessionContext();
  return session.canSwitchDepartment && session.departments.length > 1;
};

/** Departments of the signed-in user (stable order) and the one shown. */
const useDepartmentState = () => {
  const session = useSessionContext();
  const userId = session.user.id;
  const stored = useSyncExternalStore(
    subscribeDepartment,
    () => readStoredDepartment(userId),
    () => null
  );
  const departments = useMemo(() => sortDepartments(session.departments), [session.departments]);
  const current = resolveDepartment({
    stored,
    remembered: session.currentDepartment,
    departments
  });
  const canSwitch = session.canSwitchDepartment && departments.length > 1;
  return { userId, current, departments, canSwitch };
};

/** Just the department shown (no switching): search scoping, Trang chủ, badges. */
export const useCurrentDepartment = () => useDepartmentState().current;

/**
 * The signed-in user's departments and the one shown (PD-041). `setDepartment` switches instantly (no reload): the
 * choice is cached on this device, a route of the other department is left for Trang chủ, and the server remembers it
 * in the background (PUT /workspace/department); a failure puts the previous department back with an error toast.
 */
export const useDepartment = () => {
  const { userId, current, departments, canSwitch } = useDepartmentState();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const setDepartment = useCallback(
    (next: Department) => {
      if (next === current || !departments.includes(next)) return;
      const previous = current;
      writeStoredDepartment(userId, next);
      toast(`Đã chuyển sang ${departmentLabels[next]}`, { id: switchToastId, duration: 2000 });
      if (leavesRoute(window.location.pathname, next)) void navigate("/");

      departmentsApi.setCurrent(next).then(
        (response) => {
          queryClient.setQueryData<SessionContext>(qk.session(), (session) =>
            session ? { ...session, currentDepartment: response.currentDepartment } : session
          );
        },
        (error: unknown) => {
          // A newer switch already replaced this one: leave it alone.
          if (readStoredDepartment(userId) !== next) return;
          writeStoredDepartment(userId, previous);
          const forbidden = isApiError(error) && error.code === "DEPARTMENT_FORBIDDEN";
          toast.error("Không chuyển được phòng ban", {
            id: switchToastId,
            description: forbidden
              ? `Bạn không còn thuộc phòng ban ${departmentLabels[next]}.`
              : getErrorMessage(error)
          });
          // Membership changed meanwhile: read the departments again.
          if (forbidden) void queryClient.invalidateQueries({ queryKey: qk.session() });
        }
      );
    },
    [current, departments, navigate, queryClient, userId]
  );

  return { current, departments, canSwitch, setDepartment };
};

/**
 * A light fade of the element holding the page when the department changes (attach the returned ref). Opacity only:
 * a transform would re-anchor fixed-position descendants for the duration of the animation.
 */
export const useDepartmentFade = <T extends Element>() => {
  const current = useCurrentDepartment();
  const [scope, animate] = useAnimate<T>();
  const reduceMotion = useReducedMotion();
  const previous = useRef(current);
  useEffect(() => {
    if (previous.current === current) return;
    previous.current = current;
    if (reduceMotion || !scope.current) return;
    void animate(scope.current, { opacity: [0.35, 1] }, { duration: 0.28, ease: "easeOut" });
  }, [animate, current, reduceMotion, scope]);
  return scope;
};
