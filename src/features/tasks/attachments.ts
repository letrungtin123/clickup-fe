import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { maxAttachmentBytes, type Attachment } from "@/contracts/work";

import { putFileToSignedUrl, tasksApi, uploadMimeType } from "./api";
import { taskErrorMessage } from "./errors";
import { taskKeys } from "./hooks";

/**
 * Attachments: short-lived signed download URLs (batched + cached until shortly before expiry) and
 * direct-to-storage uploads with progress (XHR to the signed URL, then /complete).
 */

type CachedUrl = { url: string; expiresAt: number };
const urlCache = new Map<string, CachedUrl>();
let queue = new Map<string, { resolve: (url: string) => void; reject: (error: unknown) => void }[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const safetyMs = 60_000;

const flush = async () => {
  flushTimer = null;
  const batch = queue;
  queue = new Map();
  const ids = [...batch.keys()];
  for (let start = 0; start < ids.length; start += 100) {
    const chunk = ids.slice(start, start + 100);
    try {
      const result = await tasksApi.attachmentUrls(chunk);
      for (const item of result.items) {
        urlCache.set(item.id, { url: item.url, expiresAt: new Date(item.expiresAt).getTime() });
      }
      for (const id of chunk) {
        const cached = urlCache.get(id);
        for (const waiter of batch.get(id) ?? []) {
          if (cached) waiter.resolve(cached.url);
          else waiter.reject(new Error("Attachment unavailable"));
        }
      }
    } catch (error) {
      for (const id of chunk) for (const waiter of batch.get(id) ?? []) waiter.reject(error);
    }
  }
};

/** Signed URL for an attachment; concurrent calls in the same tick share one request. */
export const getAttachmentUrl = (attachmentId: string): Promise<string> => {
  const cached = urlCache.get(attachmentId);
  if (cached && cached.expiresAt - safetyMs > Date.now()) return Promise.resolve(cached.url);
  return new Promise((resolve, reject) => {
    const waiters = queue.get(attachmentId) ?? [];
    waiters.push({ resolve, reject });
    queue.set(attachmentId, waiters);
    flushTimer ??= setTimeout(() => void flush(), 16);
  });
};

export const useAttachmentUrl = (attachmentId: string, enabled = true) =>
  useQuery({
    queryKey: taskKeys.attachmentUrl(attachmentId),
    queryFn: () => getAttachmentUrl(attachmentId),
    staleTime: 8 * 60_000,
    gcTime: 9 * 60_000,
    refetchOnWindowFocus: false,
    enabled
  });

export const openAttachment = async (attachment: Pick<Attachment, "id">) => {
  // Open synchronously (popup blockers), then point it at the signed URL; drop the opener link.
  const popup = window.open("", "_blank");
  if (popup) popup.opener = null;
  try {
    const url = await getAttachmentUrl(attachment.id);
    if (popup) popup.location.href = url;
    else toast.error("Trình duyệt đã chặn cửa sổ mới. Cho phép cửa sổ bật lên rồi thử lại.");
  } catch (error) {
    popup?.close();
    toast.error(taskErrorMessage(error, "Không mở được tệp."));
  }
};

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// --- Uploads ------------------------------------------------------------------------------------

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  isImage: boolean;
  previewUrl: string | null;
  progress: number;
  status: "uploading" | "done" | "error";
  attachment?: Attachment;
  error?: string;
};

/** Upload manager for one task (target "task" = task attachment, "comment" = pending comment files). */
export const useUploads = (
  taskId: string,
  target: "task" | "comment",
  onUploaded?: (attachment: Attachment) => void
) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const callback = useRef(onUploaded);
  useEffect(() => {
    callback.current = onUploaded;
  });

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }, []);

  const start = useCallback(
    (files: readonly File[]) => {
      for (const file of files) {
        if (file.size === 0) {
          toast.error(`“${file.name}” trống, không thể tải lên.`);
          continue;
        }
        if (file.size > maxAttachmentBytes) {
          toast.error(`“${file.name}” vượt quá giới hạn 50 MB.`);
          continue;
        }
        const id = crypto.randomUUID();
        const isImage = /^image\/(png|jpe?g|gif|webp|avif)$/i.test(file.type);
        const controller = new AbortController();
        controllers.current.set(id, controller);
        setItems((current) => [
          ...current,
          { id, name: file.name, size: file.size, isImage, previewUrl: isImage ? URL.createObjectURL(file) : null, progress: 0, status: "uploading" }
        ]);
        void (async () => {
          try {
            const mimeType = uploadMimeType(file);
            const ticket = await tasksApi.createUpload(taskId, { fileName: file.name, mimeType, sizeBytes: file.size });
            await putFileToSignedUrl(ticket.uploadUrl, file, mimeType, (progress) => patch(id, { progress: Math.min(progress, 0.98) }), controller.signal);
            const attachment = await tasksApi.completeUpload(ticket.attachmentId, target);
            patch(id, { status: "done", progress: 1, attachment });
            callback.current?.(attachment);
          } catch (error) {
            if (controller.signal.aborted) return;
            patch(id, { status: "error", error: taskErrorMessage(error, "Tải lên thất bại. Thử lại.") });
          } finally {
            controllers.current.delete(id);
          }
        })();
      }
    },
    [patch, taskId, target]
  );

  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    setItems((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setItems((current) => {
      current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }, []);

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  return {
    items,
    start,
    remove,
    clear,
    uploading: items.some((item) => item.status === "uploading")
  };
};
