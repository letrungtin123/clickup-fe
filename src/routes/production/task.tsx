import { ChevronLeft } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate, useParams } from "react-router";
import { Link } from "@/components/shared/router-link";

import { TaskDetailView } from "@/features/production/components/jobs/task-detail";
import { touchTargets } from "@/features/production/ui";

const ease = [0.22, 1, 0.36, 1] as const;

/** /production/tasks/:taskId — shareable task page (e-mail and notification links land here). */
export const ProductionTaskRoute = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  return (
    <div className={`h-full overflow-y-auto ${touchTargets}`}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease }}
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 md:px-6"
      >
        <Link
          to="/production/my-tasks"
          className="inline-flex items-center gap-1 self-start rounded text-xs text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-3 max-sm:py-3 max-sm:pr-3"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Việc của tôi
        </Link>
        {taskId ? (
          <TaskDetailView
            taskId={taskId}
            variant="page"
            onOpenTask={(id) => void navigate(`/production/tasks/${id}`)}
            onDeleted={(jobId) => void navigate(`/production/jobs/${jobId}`, { replace: true })}
          />
        ) : null}
      </motion.div>
    </div>
  );
};
