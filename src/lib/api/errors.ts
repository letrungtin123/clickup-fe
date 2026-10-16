/**
 * Normalized API error. Every failure that reaches UI code is an ApiError, so components can branch
 * on `code`/`status` and show friendly copy without ever rendering raw server internals.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  /** The API's optional machine-readable `error.details` (never secrets); null when absent. */
  readonly details: Record<string, unknown> | null;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    details?: Record<string, unknown> | null;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId ?? null;
    this.details = input.details ?? null;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

export const isAbortError = (error: unknown) =>
  error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";

/** Client-side codes (never produced by the API). */
export const ClientErrorCode = {
  Network: "NETWORK_ERROR",
  InvalidResponse: "INVALID_RESPONSE",
  Unknown: "UNKNOWN_ERROR"
} as const;

const authCodes = new Set(["AUTH_REQUIRED", "AUTH_INVALID"]);
export const isAuthError = (error: unknown) =>
  isApiError(error) && error.status === 401 && authCodes.has(error.code);
export const isForbiddenError = (error: unknown) =>
  isApiError(error) && error.status === 403 && error.code !== "CSRF_INVALID";
export const isNotFoundError = (error: unknown) => isApiError(error) && error.status === 404;

const messagesByCode: Record<string, string> = {
  NETWORK_ERROR: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
  INVALID_RESPONSE: "Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại sau.",
  AUTH_REQUIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  AUTH_INVALID: "Email hoặc mật khẩu không đúng.",
  AUTH_PROVIDER_ERROR: "Dịch vụ đăng nhập đang tạm gián đoạn. Thử lại sau ít phút.",
  AUTH_NOT_CONFIGURED: "Dịch vụ đăng nhập chưa được cấu hình.",
  LOGIN_RATE_LIMITED: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Vui lòng chờ một chút.",
  CSRF_INVALID: "Phiên bảo mật đã thay đổi. Tải lại trang rồi thử lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  PASSWORD_CHANGE_REQUIRED: "Bạn cần đổi mật khẩu tạm thời trước khi tiếp tục.",
  ORG_MEMBERSHIP_REQUIRED: "Tài khoản chưa thuộc tổ chức nào đang hoạt động.",
  VALIDATION_FAILED: "Dữ liệu chưa hợp lệ. Kiểm tra lại các trường.",
  PROJECT_NOT_FOUND: "Không tìm thấy dự án hoặc bạn không còn quyền truy cập.",
  PROJECT_KEY_EXISTS: "Mã dự án đã tồn tại. Hãy chọn mã khác.",
  PROJECT_MANAGER_REQUIRED: "Dự án cần ít nhất một người quản lý.",
  PROJECT_MEMBER_NOT_FOUND: "Không tìm thấy thành viên dự án.",
  LIST_NOT_FOUND: "Không tìm thấy danh sách.",
  LAST_LIST: "Dự án cần ít nhất một danh sách.",
  PLACEMENT_CONFLICT: "Không sắp xếp được. Vui lòng thử lại.",
  PLACEMENT_TARGET_NOT_FOUND: "Vị trí đích đã thay đổi. Danh sách đã được làm mới.",
  ROLE_IN_USE: "Vai trò đang được gán cho thành viên, không thể xóa.",
  ROLE_KEY_EXISTS: "Mã vai trò đã tồn tại.",
  ROLE_KEY_RESERVED: "Mã vai trò này được hệ thống dành riêng.",
  ROLE_SYSTEM_PROTECTED: "Không thể chỉnh sửa vai trò hệ thống.",
  ROLE_NOT_FOUND: "Không tìm thấy vai trò.",
  SELF_MEMBERSHIP_UPDATE_FORBIDDEN: "Bạn không thể tự thay đổi vai trò hoặc trạng thái của mình.",
  ORG_SUPERADMIN_REQUIRED: "Tổ chức cần ít nhất một siêu quản trị đang hoạt động.",
  ORG_MEMBER_NOT_FOUND: "Không tìm thấy thành viên tổ chức.",
  NOT_FOUND: "Không tìm thấy nội dung yêu cầu.",
  CURRENT_PASSWORD_INVALID: "Mật khẩu hiện tại không đúng.",
  PASSWORD_CHANGE_UNAVAILABLE: "Tài khoản này không đăng nhập bằng mật khẩu.",
  ACCOUNT_EXISTS: "Email này đã có tài khoản.",
  MEMBER_EXISTS: "Người này đã là thành viên tổ chức.",
  PERMISSION_ESCALATION: "Bạn không thể cấp quyền mà chính mình không có.",
  SELF_RESET_FORBIDDEN: "Bạn không thể tự đặt lại mật khẩu của mình tại đây.",
  INTERNAL_SERVER_ERROR: "Đã có lỗi phía máy chủ. Vui lòng thử lại sau."
};

const statusFallback = (status: number) => {
  if (status === 401) return messagesByCode.AUTH_REQUIRED;
  if (status === 403) return messagesByCode.FORBIDDEN;
  if (status === 404) return messagesByCode.NOT_FOUND;
  if (status === 409) return "Dữ liệu vừa thay đổi. Làm mới rồi thử lại.";
  if (status === 429) return messagesByCode.RATE_LIMITED;
  if (status >= 500) return messagesByCode.INTERNAL_SERVER_ERROR;
  return undefined;
};

/** Friendly, localized message for any thrown value. Never returns raw server internals. */
export const getErrorMessage = (
  error: unknown,
  fallback = "Đã có lỗi xảy ra. Vui lòng thử lại."
) => {
  if (isApiError(error)) {
    return messagesByCode[error.code] ?? statusFallback(error.status) ?? fallback;
  }
  return fallback;
};
