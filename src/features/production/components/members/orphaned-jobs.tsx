import { cn } from "cn";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  TriangleAlert,
  X
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { ProductionMember } from "@/contracts/production-catalog";
import type { LedJob } from "@/contracts/users-admin";

import { useLedJobs, useProductionMe, useWorkflow } from "../../hooks";
import { phoneSheetColumn, sheetOnPhone } from "../../ui";
import { StatusChip } from "../jobs/job-bits";
import { InfoNote, RowsSkeleton } from "../settings-kit";
import { formatLedDeadline, jobsLedByHref, orphanTitle, type OrphanNotice } from "./member-admin";

/**
 * SEC2-04 follow-up: open jobs a person still leads although they no longer lead (LEADER / ADMIN
 * removed, account disabled). The inline warning after such a change and the "Xem job đang dẫn"
 * dialog share one list; every job links to its page, where Account / Admin reassign the Leader.
 */

const FALLBACK_TIMEZONE = "Asia/Ho_Chi_Minh";

/** Status colours come from the workflow (the job payload only names the status). */
const useStatusColors = () => {
  const workflow = useWorkflow();
  return useMemo(
    () => new Map((workflow.data?.statuses ?? []).map((status) => [status.code, status.color])),
    [workflow.data]
  );
};

export const LedJobList = ({
  jobs,
  className
}: {
  jobs: readonly LedJob[];
  className?: string;
}) => {
  const me = useProductionMe();
  const colors = useStatusColors();
  const timeZone = me.data?.settings.timezone ?? FALLBACK_TIMEZONE;
  // "Trễ hạn" against the moment the list appeared (render stays pure).
  const [now] = useState(() => Date.now());
  return (
    <ul className={cn("divide-y overflow-hidden rounded-lg border bg-surface", className)}>
      {jobs.map((job) => {
        const late = new Date(job.deadline).getTime() < now;
        return (
          <li key={job.id}>
            <Link
              to={`/production/jobs/${job.id}`}
              className="group/job flex min-h-11 items-center gap-3 px-3 py-2 outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
                  <span className="shrink-0 font-mono text-xs font-semibold">{job.code}</span>
                  {job.name ? (
                    <span className="truncate text-foreground-muted">· {job.name}</span>
                  ) : null}
                </span>
                {/* Code + name keep the full width; deadline, tasks and status share line two. */}
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-foreground-muted">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 tabular-nums",
                      late && "font-medium text-danger"
                    )}
                    title={late ? "Đã quá hạn" : "Hạn giao"}
                  >
                    <CalendarClock className="size-3.5" aria-hidden="true" />
                    {formatLedDeadline(job.deadline, timeZone)}
                    {late ? " · trễ hạn" : null}
                  </span>
                  <span className="tabular-nums">{job.taskCount} task</span>
                  <StatusChip
                    size="sm"
                    className="h-5 max-w-40 px-2 text-[11px]"
                    status={
                      job.statusName
                        ? {
                            name: job.statusName,
                            color: colors.get(job.statusCode ?? "") ?? "gray"
                          }
                        : null
                    }
                  />
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-foreground-subtle transition-transform group-hover/job:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Inline warnings after a role change / deactivation that left jobs without a working Leader
 * (newest first, dismissible). Not just a toast: the list stays until the Admin dismisses it.
 */
export const OrphanedJobsPanel = ({
  notices,
  onDismiss
}: {
  notices: readonly OrphanNotice[];
  onDismiss: (userId: string) => void;
}) => (
  <AnimatePresence initial={false}>
    {notices.map((notice) => (
      <motion.section
        key={notice.userId}
        layout
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
        transition={{ duration: 0.2, ease }}
        aria-label={orphanTitle(notice.jobs.length, notice.displayName)}
        data-orphan-notice={notice.userId}
        className="flex flex-col gap-3 overflow-hidden rounded-xl border border-warning/40 bg-warning-soft p-3 shadow-xs sm:p-4"
      >
        <div className="flex items-start gap-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-foreground">
              {orphanTitle(notice.jobs.length, notice.displayName)}
            </h3>
            <p className="text-[13px] text-foreground-muted">
              {notice.reason === "deactivated"
                ? "Tài khoản vừa bị vô hiệu hóa nên không còn dẫn được các job này."
                : "Người này không còn vai trò Leader hay Quản trị nên không dẫn được các job này nữa."}{" "}
              Mở từng job để chọn Leader mới.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Ẩn cảnh báo về ${notice.displayName}`}
            title="Ẩn cảnh báo"
            onClick={() => onDismiss(notice.userId)}
            className="-mt-1 -mr-1 shrink-0 text-foreground-muted hover:bg-foreground/5"
          >
            <X />
          </Button>
        </div>
        <LedJobList jobs={notice.jobs} className="max-h-72 overflow-y-auto" />
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="bg-surface max-sm:w-full"
            render={<Link to={jobsLedByHref(notice.userId)} />}
            nativeButton={false}
          >
            Xem trong danh sách job
            <ArrowRight />
          </Button>
        </div>
      </motion.section>
    ))}
  </AnimatePresence>
);

/**
 * "Xem job đang dẫn" (GET /production/users/:id/led-jobs): open jobs whose Leader is the person.
 * `leaderActive` = they still lead (LEADER / ADMIN on an active account): the jobs are fine there.
 */
export const LedJobsDialog = ({
  member,
  onClose
}: {
  member: ProductionMember | null;
  onClose: () => void;
}) => {
  // Keep the last person on screen while the dialog animates out.
  const [shown, setShown] = useState(member);
  if (member && member !== shown) setShown(member);
  const led = useLedJobs(shown?.userId, member !== null);
  const items = led.data?.items ?? [];
  const name = shown?.displayName ?? "";

  return (
    <Dialog
      open={member !== null}
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => {
        if (!open) setShown(null);
      }}
    >
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-lg",
          sheetOnPhone
        )}
      >
        <div className={cn("flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col", phoneSheetColumn)}>
          <DialogHeader className="border-b px-4 pt-4 pb-3">
            <DialogTitle className="flex items-center gap-2 pr-8">
              <BriefcaseBusiness
                className="size-4 shrink-0 text-foreground-muted"
                aria-hidden="true"
              />
              <span className="truncate">Job đang dẫn · {name}</span>
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              Job chưa xong (chưa lưu trữ, chưa ở trạng thái kết thúc) do người này làm Leader.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {led.isPending ? (
              <RowsSkeleton rows={3} className="rounded-lg border" />
            ) : led.isError ? (
              <ErrorState size="sm" error={led.error} onRetry={() => void led.refetch()} />
            ) : items.length === 0 ? (
              <EmptyState
                size="sm"
                icon={CircleCheck}
                title="Không còn job nào do người này dẫn."
              />
            ) : (
              <>
                {led.data.leaderActive ? (
                  <InfoNote icon={CircleCheck}>
                    {name} vẫn là Leader đang hoạt động — các job này không cần giao lại.
                  </InfoNote>
                ) : (
                  <InfoNote icon={TriangleAlert} tone="warning">
                    {orphanTitle(items.length, name)}. Mở từng job để chọn Leader mới.
                  </InfoNote>
                )}
                <LedJobList jobs={items} />
              </>
            )}
          </div>
          <DialogFooter className="mx-0 mb-0 px-4 py-3">
            <Button variant={items.length > 0 ? "outline" : "default"} onClick={onClose}>
              Đóng
            </Button>
            {items.length > 0 && shown ? (
              <Button render={<Link to={jobsLedByHref(shown.userId)} />} nativeButton={false}>
                Xem trong danh sách job
                <ArrowRight />
              </Button>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
