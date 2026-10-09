import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

import {
  TaskDetailPanel,
  type DetailPanelMode
} from "@/features/tasks/components/task-detail-panel";
import { useTaskPanel } from "@/features/tasks/use-task-panel";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Right-hand context panel, driven by `?task=<id>` (see useTaskPanel).
 *   desktop → docked third column (main narrows once, panel slides/fades in)
 *   tablet  → overlay from the right with a scrim
 *   mobile  → full-screen pane with a back button (history back also closes it)
 */
export const DetailPanel = ({ mode }: { mode: DetailPanelMode }) => {
  const { taskId, closeTask } = useTaskPanel();
  return (
    <AnimatePresence initial={false}>
      {taskId ? (
        <DetailPanelFrame key="task-detail" mode={mode} onClose={closeTask}>
          <TaskDetailPanel key={taskId} taskId={taskId} mode={mode} onClose={closeTask} />
        </DetailPanelFrame>
      ) : null}
    </AnimatePresence>
  );
};

const DetailPanelFrame = ({
  mode,
  onClose,
  children
}: {
  mode: DetailPanelMode;
  onClose: () => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      onClose();
    }
  };

  const shared = {
    tabIndex: -1,
    onKeyDown,
    "aria-labelledby": "task-detail-title",
    className: "flex flex-col bg-surface outline-none"
  };

  if (mode === "docked") {
    return (
      <motion.aside
        ref={ref}
        {...shared}
        aria-label="Chi tiết công việc"
        className={`${shared.className} relative h-full w-[clamp(22rem,34vw,32rem)] shrink-0 border-l`}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ duration: 0.2, ease }}
      >
        {children}
      </motion.aside>
    );
  }

  if (mode === "overlay") {
    return (
      <>
        <motion.div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-(--scrim)"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        />
        <motion.section
          ref={ref}
          {...shared}
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết công việc"
          className={`${shared.className} fixed inset-y-0 right-0 z-50 w-[min(34rem,92vw)] border-l shadow-panel`}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.24, ease }}
        >
          {children}
        </motion.section>
      </>
    );
  }

  return (
    <motion.section
      ref={ref}
      {...shared}
      role="dialog"
      aria-modal="true"
      aria-label="Chi tiết công việc"
      className={`${shared.className} fixed inset-x-0 top-0 bottom-(--keyboard-inset) z-50 bg-background pt-[env(safe-area-inset-top)]`}
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.24, ease }}
    >
      {children}
    </motion.section>
  );
};
