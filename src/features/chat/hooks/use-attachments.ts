import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { chatLimits, type ChatAttachment } from "@/contracts/chat";

import { chatApi } from "../api";
import { chatErrorMessage } from "../errors";
import { chatKeys } from "../keys";

// Signed download URLs ------------------------------------------------------------------------------

type Waiter = { resolve: (url: string | null) => void; reject: (error: unknown) => void };
const waiting = new Map<string, Waiter[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const flush = () => {
  flushTimer = null;
  const ids = [...waiting.keys()].slice(0, 50);
  const batch = ids.map((id) => [id, waiting.get(id) ?? []] as const);
  for (const id of ids) waiting.delete(id);
  if (waiting.size > 0) flushTimer = setTimeout(flush, 0);
  chatApi.attachmentUrls(ids).then(
    (result) => {
      const urls = new Map(result.items.map((item) => [item.id, item.url]));
      for (const [id, waiters] of batch)
        waiters.forEach((waiter) => waiter.resolve(urls.get(id) ?? null));
    },
    (error: unknown) => {
      for (const [, waiters] of batch) waiters.forEach((waiter) => waiter.reject(error));
    }
  );
};

/** Coalesces URL requests from every attachment rendered in the same tick (≤50 per call). */
const loadAttachmentUrl = (id: string) =>
  new Promise<string | null>((resolve, reject) => {
    const list = waiting.get(id) ?? [];
    list.push({ resolve, reject });
    waiting.set(id, list);
    flushTimer ??= setTimeout(flush, 16);
  });

/** Short-lived signed URL for an attachment (server TTL 10 min; refreshed before it expires). */
export const useAttachmentUrl = (attachmentId: string, enabled = true) =>
  useQuery({
    queryKey: chatKeys.attachmentUrl(attachmentId),
    queryFn: () => loadAttachmentUrl(attachmentId),
    enabled,
    staleTime: 8 * 60_000,
    gcTime: 9 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1
  });

/** Fetches a fresh URL on demand (download clicks, expired image retry). */
export const fetchAttachmentUrl = async (attachmentId: string) =>
  (await chatApi.attachmentUrls([attachmentId])).items[0]?.url ?? null;

// Uploads -------------------------------------------------------------------------------------------

export type UploadItem = {
  localId: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string | undefined;
  attachment?: ChatAttachment | undefined;
  /** Object URL for image previews (revoked on removal). */
  previewUrl?: string | undefined;
};

const isPreviewable = (file: File) => /^image\/(png|jpe?g|gif|webp|avif)$/i.test(file.type);

/** PUTs the file straight to storage (other origin, no cookies) with progress. */
const putFile = (
  url: string,
  file: File,
  onProgress: (ratio: number) => void,
  signal: AbortSignal
) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed with status ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });

const sizeLabel = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/**
 * Composer attachments: validate → ticket (POST /channels/:id/attachments) → direct PUT with progress →
 * POST /chat-attachments/:id/complete. Removing an item aborts the upload or deletes the unsent file.
 */
export const useUploads = (channelId: string) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  });

  useEffect(
    () => () => {
      for (const controller of controllers.current.values()) controller.abort();
      for (const item of itemsRef.current)
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    },
    []
  );

  const patch = (localId: string, update: Partial<UploadItem>) =>
    setItems((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...update } : item))
    );

  const upload = useCallback(
    async (item: UploadItem) => {
      const controller = new AbortController();
      controllers.current.set(item.localId, controller);
      try {
        const ticket = await chatApi.createUpload(channelId, {
          fileName: item.name,
          mimeType: item.mimeType,
          sizeBytes: item.size
        });
        patch(item.localId, { attachment: undefined });
        await putFile(
          ticket.uploadUrl,
          item.file,
          (ratio) => patch(item.localId, { progress: Math.min(0.97, ratio) }),
          controller.signal
        );
        const attachment = await chatApi.completeUpload(ticket.attachmentId);
        if (controller.signal.aborted) {
          void chatApi.deleteUpload(attachment.id).catch(() => undefined);
          return;
        }
        patch(item.localId, { status: "done", progress: 1, attachment });
      } catch (error) {
        if (controller.signal.aborted) return;
        patch(item.localId, {
          status: "error",
          error: chatErrorMessage(error, "Tải tệp lên thất bại.")
        });
      } finally {
        controllers.current.delete(item.localId);
      }
    },
    [channelId]
  );

  const addFiles = useCallback(
    (files: readonly File[]) => {
      const room = chatLimits.attachmentsPerMessage - itemsRef.current.length;
      if (room <= 0) {
        toast.error(`Mỗi tin nhắn đính kèm tối đa ${chatLimits.attachmentsPerMessage} tệp.`);
        return;
      }
      const accepted: UploadItem[] = [];
      for (const file of files.slice(0, room)) {
        if (file.size <= 0) {
          toast.error(`“${file.name}” là tệp rỗng.`);
          continue;
        }
        if (file.size > chatLimits.attachmentBytesMax) {
          toast.error(`“${file.name}” vượt quá ${sizeLabel(chatLimits.attachmentBytesMax)}.`);
          continue;
        }
        accepted.push({
          localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          name: file.name || "tệp-đính-kèm",
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          progress: 0,
          status: "uploading",
          previewUrl: isPreviewable(file) ? URL.createObjectURL(file) : undefined
        });
      }
      if (files.length > room) {
        toast.error(`Chỉ thêm được ${room} tệp nữa cho tin nhắn này.`);
      }
      if (accepted.length === 0) return;
      setItems((current) => [...current, ...accepted]);
      for (const item of accepted) void upload(item);
    },
    [upload]
  );

  const remove = useCallback((localId: string) => {
    const item = itemsRef.current.find((entry) => entry.localId === localId);
    controllers.current.get(localId)?.abort();
    if (item?.attachment) void chatApi.deleteUpload(item.attachment.id).catch(() => undefined);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setItems((current) => current.filter((entry) => entry.localId !== localId));
  }, []);

  const retry = useCallback(
    (localId: string) => {
      const item = itemsRef.current.find((entry) => entry.localId === localId);
      if (!item) return;
      patch(localId, { status: "uploading", progress: 0, error: undefined });
      void upload({ ...item, status: "uploading", progress: 0 });
    },
    [upload]
  );

  /** Hands the finished attachments to a message and resets the tray (files stay on the server). */
  const take = useCallback(() => {
    const done = itemsRef.current.filter((item) => item.status === "done" && item.attachment);
    for (const item of itemsRef.current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setItems([]);
    return done.map((item) => item.attachment as ChatAttachment);
  }, []);

  return {
    items,
    addFiles,
    remove,
    retry,
    take,
    uploading: items.some((item) => item.status === "uploading"),
    hasErrors: items.some((item) => item.status === "error"),
    readyCount: items.filter((item) => item.status === "done").length
  };
};
