import { useOutletContext } from "react-router";

import type { Project } from "@/contracts/work";

export type ProjectOutletContext = { project: Project };

/** The resolved project, provided by ProjectLayoutRoute to /p/:projectId/* children. */
export const useProjectOutlet = () => useOutletContext<ProjectOutletContext>();
