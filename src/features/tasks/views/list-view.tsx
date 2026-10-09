import type { TaskViewProps } from "./registry";
import { ViewPlaceholder } from "./view-skeletons";

/** Placeholder — the tasks views replace this module (keep the default export + TaskViewProps). */
const ListView = (_props: TaskViewProps) => (
  <ViewPlaceholder view="list" title="Chế độ xem Danh sách" />
);

export default ListView;
