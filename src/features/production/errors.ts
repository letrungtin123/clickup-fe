import { toast } from "sonner";

import { getErrorMessage, isApiError, isNotFoundError } from "@/lib/api/errors";

/** Vietnamese copy for production API codes (BE modules/production). Falls back to the shared map. */
const productionMessages: Record<string, string> = {
  PRODUCTION_NOT_FOUND: "Bạn chưa được thêm vào phòng ban Photo Retouch.",
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
  PAYLOAD_TOO_LARGE: "Nội dung quá lớn. Hãy chia nhỏ rồi thử lại.",
  // PD-045 fallbacks: the job status chip is the only place to finish a job; the separate feedback feature is gone.
  JOB_NOT_READY: "Job chưa thể chuyển sang trạng thái này: còn task chưa check.",
  FEEDBACK_RETIRED:
    "Chức năng feedback riêng đã bỏ. Dùng trạng thái job “Feedback” và “Chia task” cho các task làm lại.",
  // PD-047: a work task's QC can be changed, never removed (the server words it the same way).
  QC_REQUIRED: "Task phải có QC — chỉ đổi sang QC khác.",
  // Fallbacks when the server sends no message (the server-worded set below wins otherwise).
  QTY_DONE_TOO_HIGH:
    "Số tấm hoàn thành vượt mức cho phép. Nếu thực tế làm nhiều hơn, hãy báo Leader của job sửa sau khi Done.",
  CUSTOM_FIELD_FILTER_INVALID:
    "Bộ lọc trường tùy chỉnh không còn hợp lệ. Hãy xóa lọc rồi chọn lại.",
  CUSTOM_FIELDS_FORBIDDEN: "Chỉ Quản trị lọc theo trường tùy chỉnh hoặc tag của thành viên.",
  CUSTOM_FIELDS_INVALID: "Kiểm tra lại các trường tùy chỉnh.",
  ANOMALY_REVIEW_NOT_OWNER: "Chỉ người đã đánh dấu “Đã xem” (hoặc Quản trị) được bỏ đánh dấu.",
  // Production user administration (/production/users, PD-024).
  ORG_ADMIN_PROTECTED: "Tài khoản quản trị tổ chức chỉ superadmin mới thao tác được.",
  SELF_DEACTIVATE_FORBIDDEN: "Bạn không thể tự vô hiệu hóa tài khoản của mình.",
  SELF_RESET_FORBIDDEN: "Dùng “Đổi mật khẩu” trong hồ sơ cho tài khoản của chính bạn.",
  DEFAULT_ROLE_MISSING:
    "Tổ chức chưa có vai trò mặc định “Thành viên”. Nhờ quản trị tổ chức tạo trước.",
  DEFAULT_ROLE_UNSAFE:
    "Vai trò mặc định “Thành viên” đang có quyền quản trị tổ chức. Nhờ quản trị tổ chức sửa lại.",
  // The server words these two in English: keep production copy.
  MEMBER_EXISTS:
    "Email này đã là thành viên. Tìm người đó trong danh sách để gán vai trò Photo Retouch.",
  ACCOUNT_EXISTS:
    "Email này đã có tài khoản. Tìm người đó trong danh sách để gán vai trò Photo Retouch."
};

/** Codes whose server message is already user-facing Vietnamese naming the offending fields. */
const serverWorded = new Set([
  // Custom fields & tags: list filters name the field; split / "Giao lại" prefix "Task N: …".
  "CUSTOM_FIELDS_INVALID",
  "CUSTOM_FIELD_FILTER_INVALID",
  "CUSTOM_FIELDS_FORBIDDEN",
  "TAG_NOT_FOUND",
  // SEC2-03: names the maximum for the assigned quantity and says to ask the job Leader.
  "QTY_DONE_TOO_HIGH",
  // SEC2-11 (anomalies page, reports agent): only the reviewer or an Admin may undo "Đã xem".
  "ANOMALY_REVIEW_NOT_OWNER",
  // Production user administration (/production/users): Vietnamese, user-facing.
  "ORG_ADMIN_PROTECTED",
  "SELF_DEACTIVATE_FORBIDDEN",
  "SELF_RESET_FORBIDDEN",
  "SELF_ADMIN_REMOVAL",
  "DEFAULT_ROLE_MISSING",
  "DEFAULT_ROLE_UNSAFE",
  "TEAM_NOT_FOUND",
  // Phase 2 (jobs/tasks): the workflow engine words these with the status names / failing lines.
  "TRANSITION_NOT_ALLOWED",
  // PD-044 / PD-045: subtasks, quantity requests and the job status that needs every line checked (JOB_NOT_READY
  // "Còn N task chưa check: #…") name the lines / quantities involved.
  "SUBTASK_FOLLOWS_PARENT",
  "SUBTASK_FIELD_LOCKED",
  "SUBTASK_INVALID",
  "SUBTASK_QTY_INVALID",
  "SUBTASK_PARENT_INVALID",
  "PROCESS_INVALID",
  "QTY_REQUEST_REQUIRED",
  "QTY_REQUEST_OPEN",
  "QTY_REQUEST_INVALID",
  "QTY_REQUEST_CLOSED",
  "QTY_REQUEST_NOT_FOUND",
  "JOB_NOT_READY",
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
  "FEEDBACK_OPEN",
  "FEEDBACK_RETIRED",
  "SUBTASK_LIMIT",
  "JOB_TRANSITION_RETIRED",
  "CHANNEL_NAME_TAKEN",
  "LEADER_INVALID",
  "LEADER_REQUIRED",
  "MENTION_INVALID",
  "SOURCE_TASK_INVALID",
  "COMMENT_NOT_FOUND",
  "WORKFLOW_INCOMPLETE",
  // Specific 409s (unique names/codes, single QC process, rules already used for scores).
  "PROJECT_CODE_TAKEN",
  "TEAM_NAME_TAKEN",
  "CLIENT_NAME_TAKEN",
  "PROCESS_NAME_TAKEN",
  "QC_PROCESS_EXISTS",
  "SHIFT_NAME_TAKEN",
  "STATUS_CODE_TAKEN",
  "INITIAL_STATUS_EXISTS",
  "FIELD_KEY_TAKEN",
  "TAG_NAME_TAKEN",
  "JOB_CODE_TAKEN",
  "KPI_VERSION_EXISTS",
  "CREDIT_RULE_IN_USE",
  // PD-035 / PD-036 / PD-037: work-log dates, process catalog, job permission matrix, Checking lines.
  "JOB_DATES_INVALID",
  "TASK_DATES_INVALID",
  "PROCESS_IN_USE",
  "PROCESS_INVALID",
  "PROJECT_NOT_FOUND",
  // PD-038: manual job status catalog and the "Nhập công việc" job picker.
  "JOB_STATUS_NAME_TAKEN",
  "JOB_STATUS_NOT_FOUND",
  "JOB_STATUS_LAST",
  "JOB_STATUS_IN_USE",
  "JOB_STATUS_REPLACEMENT_INVALID",
  "JOB_STATUS_LIMIT",
  "JOB_PROJECT_MISMATCH"
]);

/** Production FORBIDDEN answers say who may do it ("Chỉ Leader của job…"); keep that wording. */
const productionForbidden = (message: string) => /^(Chỉ|Bạn)\s/.test(message);

type MessageOptions = {
  /** Copy for 409 CONFLICT (unique names/codes, single QC process…), which the API leaves generic. */
  conflict?: string | undefined;
  fallback?: string | undefined;
};

/** Vietnamese-only letters: a server message without any is an English leftover, not user copy. */
const looksVietnamese = (message: string) =>
  /[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/i.test(message);

export const productionErrorMessage = (error: unknown, options: MessageOptions = {}) => {
  if (isApiError(error)) {
    if (serverWorded.has(error.code) && error.message && looksVietnamese(error.message))
      return error.message;
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
