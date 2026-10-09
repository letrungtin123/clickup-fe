/** One credit-matrix cell (project × process). */
export type CellRef = { projectId: string; processId: string };

/** DOM selector of a rendered cell button (cells are virtualized, so look them up lazily). */
export const cellSelector = (cell: CellRef) => `[data-cell="${cell.projectId}:${cell.processId}"]`;
