import { toast } from "sonner";

import { getErrorMessage, isApiError } from "@/lib/api/errors";

/** Task-domain error copy (codes from BE modules/work). Falls back to the shared mapping. */
const taskMessages: Record<string, string> = {
  TASK_NOT_FOUND: "Không tìm thấy công việc hoặc bạn không còn quyền truy cập.",
  TASK_DATES_INVALID: "Hạn chót phải sau hoặc trùng ngày bắt đầu.",
  ASSIGNEE_NOT_ALLOWED: "Người này không truy cập được dự án nên không thể được giao việc.",
  TASK_DEPTH_EXCEEDED: "Việc con chỉ lồng tối đa 7 cấp.",
  TASK_PARENT_CYCLE: "Không thể đặt công việc vào chính việc con của nó.",
  PARENT_TASK_SCOPE_MISMATCH: "Việc con phải nằm cùng danh sách với việc cha.",
  PARENT_TASK_NOT_FOUND: "Không tìm thấy việc cha.",
  TASK_STATUS_NOT_FOUND: "Trạng thái này không còn trong danh sách. Hãy tải lại.",
  TASK_STATUS_REQUIRED: "Danh sách chưa có trạng thái nào.",
  INVALID_RICH_TEXT: "Nội dung không hợp lệ hoặc quá dài.",
  COMMENT_EMPTY: "Bình luận đang trống.",
  COMMENT_NOT_FOUND: "Bình luận không còn tồn tại.",
  COMMENT_REPLY_DEPTH: "Chỉ có thể trả lời bình luận gốc.",
  ATTACHMENT_TYPE_BLOCKED: "Loại tệp này không được phép tải lên.",
  ATTACHMENT_TOO_LARGE: "Tệp vượt quá giới hạn 50 MB.",
  ATTACHMENT_NOT_UPLOADED: "Tệp chưa tải lên xong. Thử lại.",
  ATTACHMENT_NOT_FOUND: "Tệp đính kèm không còn tồn tại.",
  ATTACHMENT_RATE_LIMITED: "Bạn đang tải lên quá nhiều tệp. Chờ một chút rồi thử lại.",
  INVALID_CURSOR: "Danh sách đã thay đổi. Hãy tải lại.",
  WORKFLOW_EMPTY: "Quy trình cần ít nhất một trạng thái.",
  WORKFLOW_NEEDS_ACTIVE: "Cần ít nhất một trạng thái đang làm.",
  WORKFLOW_NEEDS_DONE: "Cần ít nhất một trạng thái hoàn thành hoặc đóng.",
  WORKFLOW_FIRST_ACTIVE: "Trạng thái đầu tiên phải là trạng thái đang làm.",
  WORKFLOW_DUPLICATE_NAME: "Tên trạng thái không được trùng nhau.",
  WORKFLOW_INVALID_REMAP: "Chọn lại nơi chuyển công việc của trạng thái bị xóa."
};

export const taskErrorMessage = (error: unknown, fallback?: string) =>
  (isApiError(error) ? taskMessages[error.code] : undefined) ?? getErrorMessage(error, fallback);

export const toastTaskError = (error: unknown, fallback?: string) => {
  toast.error(taskErrorMessage(error, fallback));
};
