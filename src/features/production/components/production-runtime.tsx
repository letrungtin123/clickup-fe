import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useSessionContext } from "@/features/auth/hooks";
import { useRealtimeEvent, useRealtimeRoom } from "@/lib/realtime/hooks";

import { useProductionAccess } from "../hooks";
import { productionKeys } from "../keys";

const DEBOUNCE_MS = 300;

/**
 * Keeps production caches live for people with a production role: joins the organization's
 * production room and turns `production:changed` hints (ids only) into targeted, debounced
 * invalidations of the affected job, tasks, lists, queues and timelines. `production:leave` refreshes
 * leave-calendar queries (["production", "leave", …], owned by the leave pages).
 * Mounted once in the shell (ShellServices) so it works on every page and layout tier.
 */
export const ProductionRuntime = () => {
  const session = useSessionContext();
  const access = useProductionAccess();
  const client = useQueryClient();
  const pending = useRef<{ jobs: Set<string>; tasks: Set<string>; timer: number | null }>({
    jobs: new Set(),
    tasks: new Set(),
    timer: null
  });

  useRealtimeRoom(access.isMember ? { type: "production", id: session.organization.id } : null);

  useEffect(() => {
    const state = pending.current;
    return () => {
      if (state.timer !== null) window.clearTimeout(state.timer);
    };
  }, []);

  const flush = () => {
    const state = pending.current;
    state.timer = null;
    const jobs = [...state.jobs];
    const tasks = [...state.tasks];
    state.jobs.clear();
    state.tasks.clear();
    void client.invalidateQueries({ queryKey: productionKeys.jobs() });
    void client.invalidateQueries({ queryKey: productionKeys.myTasks() });
    void client.invalidateQueries({ queryKey: productionKeys.qcQueue() });
    for (const jobId of jobs) {
      void client.invalidateQueries({ queryKey: productionKeys.job(jobId) });
      void client.invalidateQueries({ queryKey: productionKeys.timeline("jobs", jobId) });
    }
    for (const taskId of tasks) {
      void client.invalidateQueries({ queryKey: productionKeys.task(taskId) });
      void client.invalidateQueries({ queryKey: productionKeys.timeline("tasks", taskId) });
    }
  };

  useRealtimeEvent(
    "production:changed",
    (event) => {
      const state = pending.current;
      state.jobs.add(event.jobId);
      for (const taskId of event.taskIds) state.tasks.add(taskId);
      if (state.timer === null) state.timer = window.setTimeout(flush, DEBOUNCE_MS);
    },
    access.isMember
  );

  useRealtimeEvent(
    "production:leave",
    () => void client.invalidateQueries({ queryKey: ["production", "leave"] }),
    access.isMember
  );

  return null;
};
