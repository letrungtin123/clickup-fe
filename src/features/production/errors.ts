import { toast } from "sonner";

import { getErrorMessage, isApiError, isNotFoundError } from "@/lib/api/errors";

/** Vietnamese copy for production API codes (BE modules/production). Falls back to the shared map. */
const productionMessages: Record<string, string> = {
  PRODUCTION_NOT_FOUND: "Bạn chưa được thêm vào bộ phận sản xuất.",
  SELF_ADMIN_REMOVAL:
    "Bạn không thể tự bỏ quyền Quản trị của mình. Nhờ một Quản trị khác làm việc này.",
  MEMBER_NOT_FOUND: "Không tìm thấy thành viên.",
  TEAM_NOT_FOUND: "Không tìm thấy team. Hãy tải lại.",
  CLIENT_NOT_FOUND: "Không tìm thấy khách hàng. Hãy tải lại.",
  PROJECT_NOT_FOUND: "Không tìm thấy dự án. Hãy tải lại.",
  PROCESS_NOT_FOUND: "Không tìm thấy quy trình. Hãy tải lại.",
  SHIFT_NOT_FOUND: "Không tìm thấy ca làm. Hãy tải lại.",
  STATUS_NOT_FOUND: "Không tìm thấy trạng thái. Hãy tải lại.",
  FIELD_NOT_FOUND: "Không tìm thấy trường. Hãy tải lại.",
  TAG_NOT_FOUND: "Có tag không còn tồn tại. Hãy tải lại.",
  CATALOG_NOT_FOUND: "Không tìm thấy dự án hoặc quy trình. Hãy tải lại.",
  TRANSITION_INVALID:
    "Luồng chuyển không hợp lệ: trạng thái đầu và cuối phải khác nhau và còn tồn tại.",
  FIELD_OPTIONS_REQUIRED: "Trường chọn cần ít nhất một lựa chọn.",
  FIELD_OPTIONS_DUPLICATE: "Các lựa chọn bị trùng giá trị.",
  INVALID_DATE: "Ngày không hợp lệ.",
  REFERENCE_INVALID: "Dữ liệu liên quan không còn tồn tại. Hãy tải lại.",
  RULE_VIOLATION: "Thay đổi vi phạm quy tắc dữ liệu.",
  PAYLOAD_TOO_LARGE: "Nội dung quá lớn. Hãy chia nhỏ rồi thử lại."
};

/** Codes whose server message is already user-facing Vietnamese naming the offending fields. */
const serverWorded = new Set([
  "CUSTOM_FIELDS_INVALID",
  // Phase 2 (jobs/tasks): the workflow engine words these with the status names / failing lines.
  "TRANSITION_NOT_ALLOWED",
  "NOTE_REQUIRED",
  "TASK_LINES_INVALID",
  "ASSIGNMENT_INVALID",
  "NOTHING_TO_MOVE",
  "QTY_LOCKED",
  "OT_HOURS_REQUIRED",
  "QC_REQUIRED",
  "TASK_ALREADY_DONE",
  "TASK_ALREADY_CHECKED",
  "TASK_NOT_DONE",
  "JOB_ARCHIVED",
  "JOB_NOT_DELIVERING",
  "JOB_NOT_FOUND",
  "TASK_NOT_FOUND",
  "FEEDBACK_NOT_FOUND",
  "FEEDBACK_RESOLVED",
  "LEADER_INVALID",
  "LEADER_REQUIRED",
  "MENTION_INVALID",
  "SOURCE_TASK_INVALID",
  "COMMENT_NOT_FOUND",
  "WORKFLOW_INCOMPLETE"
]);

/** Production FORBIDDEN answers say who may do it ("Chỉ Leader của job…"); keep that wording. */
const productionForbidden = (message: string) => /^(Chỉ|Bạn)\s/.test(message);

type MessageOptions = {
  /** Copy for 409 CONFLICT (unique names/codes, single QC process…), which the API leaves generic. */
  conflict?: string | undefined;
  fallback?: string | undefined;
};

export const productionErrorMessage = (error: unknown, options: MessageOptions = {}) => {
  if (isApiError(error)) {
    if (serverWorded.has(error.code) && error.message) return error.message;
    if (error.code === "FORBIDDEN" && productionForbidden(error.message)) return error.message;
    if (error.code === "CONFLICT" && options.conflict) return options.conflict;
    const message = productionMessages[error.code];
    if (message) return message;
  }
  return getErrorMessage(error, options.fallback);
};

export const toastProductionError = (error: unknown, options?: MessageOptions) => {
  toast.error(productionErrorMessage(error, options));
};

/** The module does not exist for this user (PD-011: non-members get 404). */
export const isProductionHidden = (error: unknown) =>
  isNotFoundError(error) || (isApiError(error) && error.code === "PRODUCTION_NOT_FOUND");
