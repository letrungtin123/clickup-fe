import { useMyDepartments } from "@/features/departments/hooks";

/**
 * Department of a channel being created, or of a channel without one changing kind (PD-053 / PD-054): always the
 * department selected in the header switcher — chat follows the switcher, so there is no separate choice here.
 */
export const useChannelDepartment = () => {
  const { current, departments, canSwitch } = useMyDepartments();
  const department = current ?? departments[0] ?? null;
  return {
    /** The department the channel will belong to (null: the user has none; the server decides). */
    department,
    /** The user has a department switcher: the note says the department comes from it. */
    fromSwitcher: canSwitch,
    /** Request field: always sent when known (harmless for people in one department). */
    requestDepartment: department ?? undefined
  };
};
