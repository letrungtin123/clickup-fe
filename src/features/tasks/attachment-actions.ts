import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Attachment, TaskDetail } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";
import { useProject } from "@/features/projects/hooks";
import { qk } from "@/lib/query-keys";

import { tasksApi } from "./api";
import { reconcileTask } from "./cache";
import { confirmAction } from "./confirm-store";
import { taskErrorMessage } from "./errors";

/** Removes an attachment after confirmation and patches the task caches. */
export const useDeleteAttachment = (task: TaskDetail) => {
  const client = useQueryClient();
  const session = useSessionContext();
  return async (attachment: Attachment) => {
    const ok = await confirmAction({
      title: "Xóa tệp đính kèm?",
      description: `“${attachment.fileName}” sẽ bị xóa khỏi công việc. Không thể hoàn tác.`,
      confirmLabel: "Xóa tệp",
      destructive: true
    });
    if (!ok) return;
    try {
      await tasksApi.deleteAttachment(attachment.id);
      const detail = client.getQueryData<TaskDetail>(qk.task(task.id));
      if (detail) {
        const attachments = detail.attachments.filter((item) => item.id !== attachment.id);
        const next = { ...detail, attachments, attachmentCount: Math.max(0, detail.attachmentCount - (attachment.commentId ? 0 : 1)) };
        client.setQueryData(qk.task(task.id), next);
        reconcileTask(client, next, { selfId: session.user.id });
      }
      void client.invalidateQueries({ queryKey: qk.timeline(task.id) });
      toast.success("Đã xóa tệp");
    } catch (error) {
      toast.error(taskErrorMessage(error, "Không xóa được tệp."));
    }
  };
};

/** Whether the viewer may delete an attachment (uploader, or project manager). */
export const useCanDeleteAttachment = (task: TaskDetail) => {
  const session = useSessionContext();
  const project = useProject(task.projectId);
  const manage = project.data?.myAccess === "manage";
  return (attachment: Attachment) => manage || attachment.uploadedBy?.id === session.user.id;
};
