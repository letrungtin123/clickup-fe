import { departmentCodes, sortDepartments, type Department } from "@/contracts/departments";

/**
 * Departments in the shell (PD-041), pure parts. Each department owns a module:
 *   PHOTO_RETOUCH  /production/**           (the production module, still gated by production roles)
 *   PRODUCTION     /p/** and /my-tasks      (workspace projects, lists and tasks)
 * Everything else is shared: Trang chủ, Hộp thư, Chat, Tri thức, Tìm kiếm, Thùng rác, Cài đặt.
 */

const retouchPath = /^\/production(?:\/|$)/i;
const workspacePath = /^\/(?:p|my-tasks)(?:\/|$)/i;

/** Which department a route belongs to; null = shared. Case-insensitive like the router. */
export const departmentForPath = (pathname: string): Department | null => {
  if (retouchPath.test(pathname)) return "PHOTO_RETOUCH";
  if (workspacePath.test(pathname)) return "PRODUCTION";
  return null;
};

export const isDepartment = (value: unknown): value is Department =>
  typeof value === "string" && (departmentCodes as readonly string[]).includes(value);

/** The cached choice as stored on this device (plain code); anything else counts as "nothing stored". */
export const parseStoredDepartment = (raw: string | null | undefined): Department | null => {
  const value = raw?.trim();
  return isDepartment(value) ? value : null;
};

/** localStorage key of the cached current department (per user on this device). */
export const departmentStorageKey = (userId: string) => `nesso-work-department:${userId}`;

/**
 * The department shown: the choice cached on this device while it is still one of the user's departments,
 * else the one remembered by the server, else the first department (stable order). Null without any department.
 */
export const resolveDepartment = ({
  stored,
  remembered,
  departments
}: {
  stored: Department | null;
  remembered: Department | null;
  departments: readonly Department[];
}): Department | null => {
  if (stored && departments.includes(stored)) return stored;
  if (remembered && departments.includes(remembered)) return remembered;
  return sortDepartments(departments)[0] ?? null;
};

export type RouteAccess =
  | { kind: "ok" }
  /** A route of another department the user belongs to: switch to it (no error). */
  | { kind: "switch"; department: Department }
  /** A route of a department the user does not belong to. */
  | { kind: "forbidden"; department: Department };

export const routeAccess = (
  pathname: string,
  current: Department | null,
  departments: readonly Department[]
): RouteAccess => {
  const department = departmentForPath(pathname);
  if (department === null || department === current) return { kind: "ok" };
  return departments.includes(department)
    ? { kind: "switch", department }
    : { kind: "forbidden", department };
};

/** Switching to `next` while on `pathname`: a route of the other department is left for Trang chủ. */
export const leavesRoute = (pathname: string, next: Department) => {
  const department = departmentForPath(pathname);
  return department !== null && department !== next;
};

export const retouchMyTasksPath = "/production/my-tasks";
export const workspaceMyTasksPath = "/my-tasks";

/**
 * The single "Việc của tôi" entry of the department: the production kanban for Photo Retouch (only when the user's
 * production menu has it — Staff / QC / Leader), the cross-project list for Production, nothing without a department.
 */
export const myTasksPathFor = (
  department: Department | null,
  productionNavPaths: readonly string[]
): string | null => {
  if (department === "PRODUCTION") return workspaceMyTasksPath;
  if (department === "PHOTO_RETOUCH") {
    return productionNavPaths.includes(retouchMyTasksPath) ? retouchMyTasksPath : null;
  }
  return null;
};

/** Photo Retouch menu without its own "Việc của tôi" (it sits at the top of the sidebar instead). */
export const withoutRetouchMyTasks = <T extends { to: string }>(entries: readonly T[]): T[] =>
  entries.filter((entry) => entry.to !== retouchMyTasksPath);
