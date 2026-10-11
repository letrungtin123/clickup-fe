import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import type { KnowledgeAttachment } from "@/contracts/knowledge";
import { putFileToSignedUrl, uploadMimeType } from "@/features/tasks/api";
import { useUploadQueue, type AttachmentUrlSource, type UploadAdapter } from "@/features/tasks/attachments";
import { qk } from "@/lib/query-keys";

import { knowledgeApi, type KnowledgeAttachmentTarget } from "./api";

/**
 * Knowledge files reuse the task attachment tiles and upload queue; only the endpoints differ
 * (/knowledge/items/:id/attachments, /knowledge/attachments/urls). Wrap tiles in
 * <AttachmentSourceContext value={knowledgeAttachmentSource}>.
 */
export const knowledgeAttachmentSource: AttachmentUrlSource = {
  key: "knowledge",
  fetchUrls: (ids) => knowledgeApi.attachmentUrls(ids)
};

export const isUploadableImage = (file: File) => /^image\/(png|jpe?g|gif|webp|avif)$/i.test(file.type);

/** One file straight to an item (the image picker of the editor), without the queue UI. */
export const uploadKnowledgeFile = async (itemId: string, file: File, target: KnowledgeAttachmentTarget = "item") => {
  const mimeType = uploadMimeType(file);
  const ticket = await knowledgeApi.createUpload(itemId, { fileName: file.name, mimeType, sizeBytes: file.size });
  await putFileToSignedUrl(ticket.uploadUrl, file, mimeType, () => undefined);
  return knowledgeApi.completeUpload(ticket.attachmentId, target);
};

/** Upload queue for an item ("item" = file of the item, "comment" = file for a comment being written). */
export const useKnowledgeUploads = (
  itemId: string,
  target: KnowledgeAttachmentTarget,
  onUploaded?: (attachment: KnowledgeAttachment) => void
) => {
  const client = useQueryClient();
  const adapter = useMemo<UploadAdapter<KnowledgeAttachment>>(
    () => ({
      createUpload: (input) => knowledgeApi.createUpload(itemId, input),
      completeUpload: async (attachmentId) => {
        const attachment = await knowledgeApi.completeUpload(attachmentId, target);
        if (target === "item") void client.invalidateQueries({ queryKey: qk.knowledge.item(itemId), exact: true });
        return attachment;
      }
    }),
    [client, itemId, target]
  );
  return useUploadQueue(adapter, onUploaded);
};
