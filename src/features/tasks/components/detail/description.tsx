import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Check, CircleAlert, FileText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { RichTextView } from "@/components/shared/rich-text/rich-text-view";
import { Spinner } from "@/components/ui/spinner";
import type { RichTextDoc } from "@/contracts/rich-text";
import type { TaskDetail } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";

import { tasksApi } from "../../api";
import { reconcileTask } from "../../cache";
import { canSaveOnUnload, toDescriptionPayload, type DescriptionPayload } from "../../description-save";
import { useMentionSource, useUpdateTask } from "../../hooks";
import { markLocalTaskMutation } from "../../local-mutations";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Idle autosave (blur saves immediately); long enough to avoid a history entry per pause. */
const saveDelayMs = 2500;

/**
 * Description: rich text with @mentions, saved on blur and after a short idle pause. Server
 * refreshes never overwrite what is being typed (the editor only adopts external values when not
 * focused). Leaving the page never drops the draft (BUG-WK-17): hiding the tab or unloading sends it
 * with a keepalive request, and the browser asks before leaving when it could not be sent.
 */
export const DescriptionSection = ({ task }: { task: TaskDetail }) => {
  const session = useSessionContext();
  const client = useQueryClient();
  const update = useUpdateTask();
  const mutate = update.mutate;
  const mentionSource = useMentionSource(task.projectId);
  const [state, setState] = useState<SaveState>("idle");
  const stateRef = useRef<SaveState>("idle");
  /** Typed, not sent yet. */
  const pending = useRef<RichTextDoc | null>(null);
  /** Sent, not confirmed yet (re-sent with keepalive if the page goes away meanwhile). */
  const inFlight = useRef<DescriptionPayload | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(task.description ?? null));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
    stateRef.current = state;
  });

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    clearTimer();
    const doc = pending.current;
    if (!doc) return;
    pending.current = null;
    const payload = toDescriptionPayload(doc);
    if (!payload) {
      setState("error");
      return;
    }
    if (payload.serialized === lastSaved.current) {
      setState((current) => (current === "dirty" ? "idle" : current));
      return;
    }
    setState("saving");
    inFlight.current = payload;
    mutate(
      { task: taskRef.current, patch: { description: payload.next } },
      {
        onSuccess: () => {
          lastSaved.current = payload.serialized;
          if (inFlight.current === payload) inFlight.current = null;
          setState(pending.current ? "dirty" : "saved");
        },
        onError: () => {
          if (inFlight.current === payload) inFlight.current = null;
          // Keep the draft: the next edit, blur or page exit tries again.
          pending.current ??= doc;
          setState("error");
        }
      }
    );
  }, [clearTimer, mutate]);

  /**
   * The page is being hidden or unloaded: send what is not saved yet, synchronously, with keepalive.
   * "unsaved" = it could not leave (no CSRF token cached, body over the keepalive quota, invalid doc).
   */
  const flushOnExit = useCallback((): "clean" | "sent" | "unsaved" => {
    clearTimer();
    const doc = pending.current;
    const payload = doc ? toDescriptionPayload(doc) : inFlight.current;
    if (!payload) return doc ? "unsaved" : "clean";
    if (payload.serialized === lastSaved.current) {
      pending.current = null;
      return "clean";
    }
    if (!canSaveOnUnload(payload, api.hasCsrfToken())) return "unsaved";
    pending.current = null;
    inFlight.current = payload;
    const current = taskRef.current;
    markLocalTaskMutation(current.id);
    tasksApi.update(current.id, { description: payload.next }, { keepalive: true }).then(
      (detail) => {
        lastSaved.current = payload.serialized;
        if (inFlight.current === payload) inFlight.current = null;
        client.setQueryData(qk.task(detail.id), detail);
        reconcileTask(client, detail, { selfId: session.user.id });
        setState(pending.current ? "dirty" : "saved");
      },
      () => {
        if (inFlight.current === payload) inFlight.current = null;
        if (doc) pending.current ??= doc;
        setState("error");
      }
    );
    setState("saving");
    return "sent";
  }, [clearTimer, client, session.user.id]);

  // Never lose an unsaved draft when the panel closes or switches task.
  useEffect(() => () => flush(), [flush]);

  const editable = task.capabilities.canEdit;

  // Tab hidden (mobile: often the last event before the OS kills it) or page unloaded.
  useEffect(() => {
    if (!editable) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushOnExit();
    };
    const onPageHide = () => {
      flushOnExit();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [editable, flushOnExit]);

  // Ask before leaving only while something is unsaved (a beforeunload listener disables bfcache).
  const unsaved = state === "dirty" || state === "saving" || state === "error";
  useEffect(() => {
    if (!unsaved) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const result = flushOnExit();
      if (result === "unsaved" || stateRef.current === "error") {
        event.preventDefault();
        // Legacy browsers need returnValue set to show the prompt.
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved, flushOnExit]);

  // Adopt server changes (e.g. another user's edit) as the new baseline.
  const serverJson = JSON.stringify(task.description ?? null);
  useEffect(() => {
    if (!pending.current) lastSaved.current = serverJson;
  }, [serverJson]);

  return (
    <section aria-labelledby="task-description-heading" className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h3 id="task-description-heading" className="flex items-center gap-2 text-[13px] font-semibold">
          <FileText className="size-3.5 text-foreground-muted" aria-hidden="true" />
          Mô tả
        </h3>
        <SaveIndicator state={state} />
      </div>
      {editable ? (
        <RichTextEditor
          variant="description"
          value={task.description}
          placeholder="Thêm mô tả… Gõ @ để nhắc tên đồng đội"
          mentionSource={mentionSource}
          toolbar
          toolbarClassName="scrollbar-none flex-nowrap overflow-x-auto"
          onChange={(doc) => {
            pending.current = doc;
            setState("dirty");
            // An unload-time save cannot wait for a CSRF round trip: fetch it while typing.
            api.warmCsrfToken();
            clearTimer();
            timer.current = setTimeout(flush, saveDelayMs);
          }}
          onFocus={() => api.warmCsrfToken()}
          onBlur={() => flush()}
          className={cn(
            "rounded-lg border border-transparent px-2.5 py-2 transition-colors duration-150",
            "hover:border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25",
            "[&_[role=toolbar]]:opacity-0 [&_[role=toolbar]]:transition-opacity [&:focus-within_[role=toolbar]]:opacity-100 [&:hover_[role=toolbar]]:opacity-100 pointer-coarse:[&_[role=toolbar]]:opacity-100"
          )}
          contentClassName="min-h-16"
          aria-label="Mô tả công việc"
        />
      ) : task.description ? (
        <RichTextView doc={task.description} selfId={session.user.id} className="px-2.5 py-1" />
      ) : (
        <p className="px-2.5 text-[13px] text-foreground-subtle">Chưa có mô tả.</p>
      )}
    </section>
  );
};

const SaveIndicator = ({ state }: { state: SaveState }) => {
  if (state === "idle") return null;
  return (
    <span className="flex items-center gap-1 text-[11px] text-foreground-subtle" role="status" aria-live="polite">
      {state === "saving" ? (
        <>
          <Spinner className="size-3" />
          Đang lưu…
        </>
      ) : state === "dirty" ? (
        "Chưa lưu"
      ) : state === "saved" ? (
        <>
          <Check className="size-3 text-success" />
          Đã lưu
        </>
      ) : (
        <span className="flex items-center gap-1 text-danger">
          <CircleAlert className="size-3" />
          Không lưu được — sửa lại hoặc thử lại
        </span>
      )}
    </span>
  );
};
