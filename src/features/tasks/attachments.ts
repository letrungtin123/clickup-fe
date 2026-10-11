import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { maxAttachmentBytes, type Attachment, type CreateUploadRequest } from "@/contracts/work";
import { onSessionEnd } from "@/lib/session-cleanup";

import { putFileToSignedUrl, tasksApi, uploadMimeType } from "./api";
import { taskErrorMessage } from "./errors";
import { taskKeys } from "./hooks";

/**
 * Attachments: short-lived signed download URLs (batched + cached until shortly before expiry) and
 * direct-to-storage uploads with progress (XHR to the signed URL, then /complete).
 *
 * The same tiles serve task and knowledge files: an `AttachmentUrlSource` (React context) says which
 * endpoint signs the URLs; uploads take an adapter (create ticket / complete).
 */

/** Task or knowledge file: the shared fields (knowledge files carry `itemId` instead of `taskId`). */
export type AttachmentLike = Omit<Attachment, "taskId">;

type SignedUrls = { items: { id: string; url: string; expiresAt: string }[] };

export type AttachmentUrlSource = {
  key: string;
  fetchUrls: (ids: string[]) => Promise<SignedUrls>;
};

export const taskAttachmentSource: AttachmentUrlSource = {
  key: "tasks",
  fetchUrls: (ids) => tasksApi.attachmentUrls(ids)
};

/** Which endpoint signs attachment URLs for the tiles (default: task attachments). */
export const AttachmentSourceContext = createContext<AttachmentUrlSource>(taskAttachmentSource);
export const useAttachmentSource = () => useContext(AttachmentSourceContext);

type CachedUrl = { url: string; expiresAt: number };
type Waiter = { resolve: (url: string) => void; reject: (error: unknown) => void };
const safetyMs = 60_000;

/** Signed URLs per source key (cleared at sign-out: they are bearer links to the previous user's files). */
const urlCaches = new Map<string, Map<string, CachedUrl>>();
const urlCacheFor = (sourceKey: string) => {
  let cache = urlCaches.get(sourceKey);
  if (!cache) {
    cache = new Map();
    urlCaches.set(sourceKey, cache);
  }
  return cache;
};

/** How long a resolved URL stays usable (until shortly before it expires); 0 when unknown. */
const freshForMs = (sourceKey: string, attachmentId: string) => {
  const cached = urlCaches.get(sourceKey)?.get(attachmentId);
  return cached ? Math.max(0, cached.expiresAt - safetyMs - Date.now()) : 0;
};

/** Sign-out: forget every signed URL (KB-SEC FE-06). */
export const resetAttachmentUrlCache = () => {
  for (const cache of urlCaches.values()) cache.clear();
};
onSessionEnd(resetAttachmentUrlCache);

/** One batched, cached resolver per source. */
const createResolver = (source: AttachmentUrlSource) => {
  const urlCache = urlCacheFor(source.key);
  let queue = new Map<string, Waiter[]>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    flushTimer = null;
    const batch = queue;
    queue = new Map();
    const ids = [...batch.keys()];
    for (let index = 0; index < ids.length; index += 100) {
      const chunk = ids.slice(index, index + 100);
      try {
        const result = await source.fetchUrls(chunk);
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

  return (attachmentId: string): Promise<string> => {
    const cached = urlCache.get(attachmentId);
    if (cached && cached.expiresAt - safetyMs > Date.now()) return Promise.resolve(cached.url);
    return new Promise((resolve, reject) => {
      const waiters = queue.get(attachmentId) ?? [];
      waiters.push({ resolve, reject });
      queue.set(attachmentId, waiters);
      flushTimer ??= setTimeout(() => void flush(), 16);
    });
  };
};

const resolvers = new Map<string, (attachmentId: string) => Promise<string>>();
const resolverFor = (source: AttachmentUrlSource) => {
  let resolver = resolvers.get(source.key);
  if (!resolver) {
    resolver = createResolver(source);
    resolvers.set(source.key, resolver);
  }
  return resolver;
};

/** Signed URL for an attachment; concurrent calls in the same tick share one request. */
export const getAttachmentUrl = (
  attachmentId: string,
  source: AttachmentUrlSource = taskAttachmentSource
): Promise<string> => resolverFor(source)(attachmentId);

export const useAttachmentUrl = (attachmentId: string, enabled = true) => {
  const source = useAttachmentSource();
  return useQuery({
    queryKey:
      source.key === taskAttachmentSource.key
        ? taskKeys.attachmentUrl(attachmentId)
        : [...taskKeys.attachmentUrl(attachmentId), source.key],
    queryFn: () => getAttachmentUrl(attachmentId, source),
    // Fresh exactly as long as the signed URL stays valid (a cached URL may have little time left).
    staleTime: () => Math.min(8 * 60_000, freshForMs(source.key, attachmentId)),
    gcTime: 9 * 60_000,
    refetchOnWindowFocus: false,
    enabled
  });
};

export const openAttachment = async (
  attachment: Pick<Attachment, "id">,
  source: AttachmentUrlSource = taskAttachmentSource
) => {
  // Open synchronously (popup blockers), then point it at the signed URL; drop the opener link.
  const popup = window.open("", "_blank");
  if (popup) popup.opener = null;
  try {
    const url = await getAttachmentUrl(attachment.id, source);
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
  attachment?: AttachmentLike;
  error?: string;
};

type UploadTicketLike = { attachmentId: string; uploadUrl: string };

/** Where an upload goes: a signed ticket for the file, then "complete" once the bytes are stored. */
export type UploadAdapter<A extends AttachmentLike = AttachmentLike> = {
  createUpload: (input: CreateUploadRequest) => Promise<UploadTicketLike>;
  completeUpload: (attachmentId: string) => Promise<A>;
};

/** Upload manager for one task (target "task" = task attachment, "comment" = pending comment files). */
export const useUploads = (
  taskId: string,
  target: "task" | "comment",
  onUploaded?: (attachment: Attachment) => void
) => {
  const adapter = useMemo<UploadAdapter<Attachment>>(
    () => ({
      createUpload: (input) => tasksApi.createUpload(taskId, input),
      completeUpload: (attachmentId) => tasksApi.completeUpload(attachmentId, target)
    }),
    [taskId, target]
  );
  return useUploadQueue(adapter, onUploaded);
};

/** Upload queue with progress for any adapter (task files, knowledge item / comment files). */
export const useUploadQueue = <A extends AttachmentLike>(
  adapter: UploadAdapter<A>,
  onUploaded?: (attachment: A) => void
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
            const ticket = await adapter.createUpload({ fileName: file.name, mimeType, sizeBytes: file.size });
            await putFileToSignedUrl(ticket.uploadUrl, file, mimeType, (progress) => patch(id, { progress: Math.min(progress, 0.98) }), controller.signal);
            const attachment = await adapter.completeUpload(ticket.attachmentId);
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
    [adapter, patch]
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
