import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { NotificationType } from "@/contracts/notifications";
import { useSessionContext } from "@/features/auth/hooks";
import { useRealtimeEvent, useRealtimeRoom } from "@/lib/realtime/hooks";

import { useProductionAccess } from "../hooks";
import { productionKeys } from "../keys";
import {
  addChange,
  applyInvalidations,
  createThrottle,
  emptyChange,
  isEmptyChange,
  isOwnChange,
  LIVE_DEBOUNCE_MS,
  LIVE_REFRESH_MS,
  planChangeInvalidations,
  requestScoresRefresh,
  type PendingChange,
  type Throttle
} from "../live-sync";
import { kpiKeys, leaveKeys } from "../scores/keys";

/** Personal production notifications that mean "a task now concerns you". */
const myTaskNotifications = new Set<NotificationType>([
  "production.task_assigned",
  "production.qc_failed",
  "production.qty_changed",
  "production.qty_change_requested",
  "production.qty_change_decided"
]);

/**
 * Notifications about one line whose page may be open (PD-044): QC asking for rework, a quantity request and its
 * decision. The line, its job and their timelines (the job's "Nhật ký" included, same key prefix) refresh at once.
 */
const lineNotifications = new Set<NotificationType>([
  "production.qc_failed",
  "production.qty_change_requested",
  "production.qty_change_decided"
]);

/**
 * Keeps production caches live for people with a production role (PERF-01): joins the
 * organization's production room (leave hints) and turns `production:changed` hints (ids only, sent
 * to the personal room of everyone who can see the job — BE PR-20) into targeted,
 * debounced invalidations — only cached views holding the changed job / tasks refetch, comments only
 * touch timelines, own changes are only marked stale, scores refresh at most every 30 s
 * (live-sync.ts). Personal `notification:new` events refresh my tasks / the QC queue right away, and a job status
 * change (PD-045) the job, the job lists and the jobs I lead;
 * `production:leave` refreshes the leave calendar and the (leave-prorated) KPI forecast.
 * Mounted once in the shell (ShellServices) so it works on every page and layout tier.
 */
export const ProductionRuntime = () => {
  const session = useSessionContext();
  const access = useProductionAccess();
  const client = useQueryClient();
  const myId = session.user.id;
  const pending = useRef<{
    others: PendingChange;
    own: PendingChange;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ others: emptyChange(), own: emptyChange(), timer: null });
  const speculative = useRef<{ keys: Map<string, QueryKey>; throttle: Throttle | null }>({
    keys: new Map(),
    throttle: null
  });

  useRealtimeRoom(access.isMember ? { type: "production", id: session.organization.id } : null);

  useEffect(() => {
    const state = pending.current;
    const lists = speculative.current;
    return () => {
      if (state.timer !== null) clearTimeout(state.timer);
      lists.throttle?.cancel();
    };
  }, []);

  /** Lists that may have gained a row: refetched while on screen once per window, after it. */
  const refreshSpeculative = (keys: readonly QueryKey[]) => {
    const lists = speculative.current;
    for (const key of keys) lists.keys.set(JSON.stringify(key), key);
    lists.throttle ??= createThrottle(
      LIVE_REFRESH_MS,
      () => {
        const batch = [...lists.keys.values()];
        lists.keys.clear();
        for (const queryKey of batch) {
          void client.refetchQueries({ queryKey, exact: true, type: "active" });
        }
      },
      { leading: false }
    );
    lists.throttle.request();
  };

  const flush = () => {
    const state = pending.current;
    state.timer = null;
    const { others, own } = state;
    state.others = emptyChange();
    state.own = emptyChange();
    if (!isEmptyChange(own)) {
      void applyInvalidations(client, planChangeInvalidations(client, own).invalidations, true);
    }
    if (!isEmptyChange(others)) {
      const plan = planChangeInvalidations(client, others);
      void applyInvalidations(client, plan.invalidations);
      if (plan.speculative.length > 0) refreshSpeculative(plan.speculative);
      if (plan.scores) requestScoresRefresh(client);
    }
  };

  useRealtimeEvent(
    "production:changed",
    (event) => {
      const state = pending.current;
      addChange(isOwnChange(event, myId) ? state.own : state.others, event);
      state.timer ??= setTimeout(flush, LIVE_DEBOUNCE_MS);
    },
    access.isMember
  );

  useRealtimeEvent(
    "notification:new",
    ({ notification }) => {
      const type = notification.type;
      if (type === "production.task_waiting_qc") {
        void client.invalidateQueries({ queryKey: productionKeys.qcQueue() });
        void client.invalidateQueries({ queryKey: productionKeys.myTasks() });
      } else if (type === "production.job_leader_assigned") {
        void client.invalidateQueries({ queryKey: ["production", "led-jobs"] });
      } else if (type === "production.job_status_changed") {
        // PD-045: the job's status chip changed — its page and history, the job lists (status filters, the
        // "Nhập công việc" picker) and the jobs I lead show it. Refetched only while on screen.
        const { jobId } = notification.target;
        if (jobId) {
          void client.invalidateQueries({ queryKey: productionKeys.job(jobId), exact: true });
          void client.invalidateQueries({ queryKey: productionKeys.timeline("jobs", jobId) });
        }
        void client.invalidateQueries({ queryKey: productionKeys.jobs() });
        void client.invalidateQueries({ queryKey: productionKeys.jobOptions() });
        void client.invalidateQueries({ queryKey: ["production", "led-jobs"] });
      } else if (myTaskNotifications.has(type)) {
        void client.invalidateQueries({ queryKey: productionKeys.myTasks() });
        if (lineNotifications.has(type)) {
          // Refetched only while on screen (TanStack's default); prefixes: the task's scores, the job's log.
          const { productionTaskId: taskId, jobId } = notification.target;
          if (taskId) {
            void client.invalidateQueries({ queryKey: productionKeys.task(taskId) });
            void client.invalidateQueries({ queryKey: productionKeys.timeline("tasks", taskId) });
          }
          if (jobId) {
            void client.invalidateQueries({ queryKey: productionKeys.job(jobId), exact: true });
            void client.invalidateQueries({ queryKey: productionKeys.timeline("jobs", jobId) });
          }
          // A rework line goes back to its worker's board; a request decision changes the line in the QC queue too.
          void client.invalidateQueries({ queryKey: productionKeys.qcQueue() });
        }
      } else if (type === "production.kpi_settled") {
        void client.invalidateQueries({ queryKey: kpiKeys.all() });
        requestScoresRefresh(client);
      }
    },
    access.isMember
  );

  useRealtimeEvent(
    "production:leave",
    () => {
      void client.invalidateQueries({ queryKey: leaveKeys.all() });
      // Approved leave prorates KPI targets (forecast, report).
      requestScoresRefresh(client);
    },
    access.isMember
  );

  return null;
};
