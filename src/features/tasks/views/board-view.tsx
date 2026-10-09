import type { TaskViewProps } from "./registry";
import { ViewPlaceholder } from "./view-skeletons";

/** Placeholder — the tasks views replace this module (keep the default export + TaskViewProps). */
const BoardView = (_props: TaskViewProps) => (
  <ViewPlaceholder view="board" title="Chế độ xem Bảng" />
);

export default BoardView;
