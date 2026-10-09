import type { TaskViewProps } from "./registry";
import { ViewPlaceholder } from "./view-skeletons";

/** Placeholder — the tasks views replace this module (keep the default export + TaskViewProps). */
const TableView = (_props: TaskViewProps) => (
  <ViewPlaceholder view="table" title="Chế độ xem Bảng tính" />
);

export default TableView;
