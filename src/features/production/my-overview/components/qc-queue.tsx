import { cn } from "cn";
import { ArrowLeft, BadgeCheck, CircleX, ScanSearch, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductionStatus } from "@/contracts/production-catalog";
import type { MyOverviewQcTask } from "@/contracts/production-my-overview";

import { StatusChip } from "../../components/jobs/job-bits";
import { formatInteger } from "../../format";
import { myOverviewCopy as copy } from "../copy";
import { qcRowActions, qcTimeText } from "../model";
import type { useMyMoves } from "../use-my-moves";
import { hintTone, rowGrid } from "../styles";
import { CopyFolderButton, TaskTitle } from "./task-list";

type Moves = ReturnType<typeof useMyMoves>;

/** One line waiting for my check: who did it, what, how long it waited, and the QC moves of its status. */
const QcRow = ({
  line,
  now,
  statuses,
  moves,
  onOpen
}: {
  line: MyOverviewQcTask;
  now: Date;
  statuses: readonly ProductionStatus[];
  moves: Moves;
  onOpen: (taskId: string) => void;
}) => {
  const task = line.task;
  const ids = useId();
  const [sendOpen, setSendOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const actions = moves.lookup.isError
    ? { start: null, pass: null, fail: null }
    : qcRowActions(task, statuses);
  const busy = moves.busyId === task.id;
  const time = qcTimeText(line, now);
  const name = task.assignee.displayName;
  const images =
    line.images === null ? copy.list.noQty : copy.qc.images(formatInteger(line.images));
  const sendBack = async () => {
    if (!actions.fail) return;
    const text = note.trim();
    if (!text) {
      setError(copy.qc.failRequired);
      return;
    }
    if (await moves.sendBack(task, actions.fail, text)) setSendOpen(false);
  };
  return (
    <li className="flex min-w-0 flex-col gap-2.5 border-t px-4 py-3 first:border-t-0 sm:px-5">
      <div className={rowGrid}>
        <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
          <TaskTitle task={task} onOpen={onOpen} />
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] text-foreground-muted">
            <span className="min-w-0">{copy.qc.by(name, task.process.name, images)}</span>
            <CopyFolderButton link={line.folderLink} code={task.code} />
          </div>
        </div>
        <span className={cn("text-[12.5px] font-semibold sm:min-w-[9rem]", hintTone[time.tone])}>
          {time.text}
        </span>
        <div className="min-w-0">
          <StatusChip status={task.status} />
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 md:ml-0">
          {actions.start ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void moves.simple(task, actions.start!, copy.qc.startToast(task.code))}
            >
              <ScanSearch aria-hidden="true" />
              {copy.qc.startCheck}
            </Button>
          ) : null}
          {actions.pass && !sendOpen ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void moves.simple(task, actions.pass!, copy.qc.passToast(task.code))}
            >
              <BadgeCheck aria-hidden="true" />
              {copy.qc.pass}
            </Button>
          ) : null}
          {actions.fail && !sendOpen ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setNote("");
                setError(null);
                setSendOpen(true);
              }}
            >
              <CircleX aria-hidden="true" />
              {copy.qc.fail}
            </Button>
          ) : null}
        </div>
      </div>
      {sendOpen && actions.fail ? (
        <form
          className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2 rounded-lg border border-danger/40 bg-muted/40 px-3 py-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            void sendBack();
          }}
        >
          <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1.5">
            <label htmlFor={`${ids}-note`} className="text-[13px] font-medium">
              {copy.qc.failField}
            </label>
            <Input
              id={`${ids}-note`}
              autoFocus
              value={note}
              maxLength={5000}
              placeholder={copy.qc.failPlaceholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${ids}-error` : undefined}
              onChange={(event) => {
                setNote(event.target.value);
                setError(null);
              }}
            />
            {error ? (
              <span id={`${ids}-error`} className="text-xs text-danger">
                {error}
              </span>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setSendOpen(false)}
            >
              {copy.actions.cancel}
            </Button>
            <Button type="submit" size="sm" variant="destructive" disabled={busy}>
              {copy.qc.sendBack(name)}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
};

/** "Chờ tôi QC" (QC holders): lines whose QC is me in Chờ QC / Đang check, longest wait first. */
export const QcQueueList = ({
  lines,
  now,
  statuses,
  moves,
  onOpen,
  onBack
}: {
  lines: readonly MyOverviewQcTask[];
  now: Date;
  statuses: readonly ProductionStatus[];
  moves: Moves;
  onOpen: (taskId: string) => void;
  onBack: () => void;
}) => (
  <section
    aria-labelledby="my-overview-qc"
    className="min-w-0 overflow-hidden rounded-xl border bg-surface shadow-xs"
  >
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id="my-overview-qc" className="text-[15px] font-semibold">
          {copy.qc.title}
          <span className="ml-1.5 text-[13px] font-normal text-foreground-muted tabular-nums">
            · {lines.length}
          </span>
        </h2>
        <p className="text-xs text-foreground-muted">{copy.qc.order}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        {copy.qc.back}
      </Button>
    </div>
    {lines.length === 0 ? (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-foreground-muted">
        <ShieldCheck className="size-5" aria-hidden="true" />
        {copy.qc.empty}
      </div>
    ) : (
      <ul className="min-w-0">
        {lines.map((line) => (
          <QcRow
            key={line.task.id}
            line={line}
            now={now}
            statuses={statuses}
            moves={moves}
            onOpen={onOpen}
          />
        ))}
      </ul>
    )}
  </section>
);
