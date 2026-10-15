import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ProductionTimelinePageSchema } from "@/contracts/production-jobs";
import { api, apiPath } from "@/lib/api/client";

import { useCustomFields, useProcesses, useShifts, useTags } from "./hooks";
import type { LogNames } from "./jobs-model";
import { productionKeys } from "./keys";

/**
 * The job page's "Nhật ký" (PD-044): the history of the job's lines only (GET …/jobs/:id/timeline?only=logs, optionally
 * one line's with `taskId`), in pages. The key sits under the job timeline's key
 * (["production", "timeline", "jobs", jobId, "logs", taskId | "all"]), so whatever refreshes the job timeline by
 * prefix — the write hooks (jobs-hooks.ts) and realtime hints for work changes (live-sync.ts) — refreshes the log too.
 */

export const JOB_LOG_PAGE = 30;

export const jobLogKey = (jobId: string, taskId: string | null) =>
  [...productionKeys.timeline("jobs", jobId), "logs", taskId ?? "all"] as const;

export const fetchJobLog = (
  jobId: string,
  taskId: string | null,
  cursor: string | undefined,
  signal?: AbortSignal
) =>
  api.get(apiPath`/production/jobs/${jobId}/timeline`, ProductionTimelinePageSchema, {
    query: { only: "logs", taskId: taskId ?? undefined, cursor, limit: JOB_LOG_PAGE },
    signal
  });

export const useJobLog = (jobId: string, taskId: string | null) =>
  useInfiniteQuery({
    queryKey: jobLogKey(jobId, taskId),
    queryFn: ({ pageParam, signal }) => fetchJobLog(jobId, taskId, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined,
    enabled: Boolean(jobId)
  });

/**
 * Names for history sentences (describeTaskLog): people (`nameOf`), processes, shifts, tags and custom fields — archived
 * fields too, history may name a field no longer in use — and the organization timezone.
 */
export const useLogNames = (
  nameOf: (id: string) => string | undefined,
  timeZone: string
): LogNames & {
  tag: (id: string) => string | undefined;
  field: NonNullable<LogNames["field"]>;
} => {
  const processes = useProcesses();
  const shifts = useShifts();
  const tags = useTags();
  const fields = useCustomFields();
  return useMemo(() => {
    const processNames = new Map(
      (processes.data?.items ?? []).map((process) => [process.id, process.name])
    );
    const shiftNames = new Map((shifts.data?.items ?? []).map((shift) => [shift.id, shift.name]));
    const tagNames = new Map((tags.data?.items ?? []).map((tag) => [tag.id, tag.name]));
    const fieldList = fields.data?.items ?? [];
    return {
      user: nameOf,
      process: (value: string) => processNames.get(value),
      shift: (value: string) => shiftNames.get(value),
      tag: (value: string) => tagNames.get(value),
      field: (fieldEntity: "JOB" | "TASK", key: string) =>
        fieldList.find((field) => field.entity === fieldEntity && field.key === key),
      timeZone
    };
  }, [nameOf, processes.data, shifts.data, tags.data, fields.data, timeZone]);
};
