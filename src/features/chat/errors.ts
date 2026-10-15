import { getErrorMessage, isApiError } from "@/lib/api/errors";

/** Vietnamese copy for chat API error codes (BE modules/chat). Falls back to the shared mapping. */
const chatMessages: Record<string, string> = {
  CHAT_RATE_LIMITED: "Bạn gửi hơi nhanh. Đợi vài giây rồi thử lại nhé.",
  CHAT_MESSAGE_NOT_FOUND: "Tin nhắn không còn tồn tại.",
  CHAT_MESSAGE_EMPTY: "Hãy nhập nội dung hoặc đính kèm tệp.",
  CHAT_MESSAGE_DELETED: "Tin nhắn này đã bị xóa.",
  CHAT_NOT_AUTHOR: "Bạn chỉ có thể sửa tin nhắn của chính mình.",
  CHAT_THREAD_NOT_FOUND: "Chuỗi trả lời không còn tồn tại hoặc không thể trả lời.",
  CHAT_REACTION_LIMIT: "Tin nhắn này đã có quá nhiều loại biểu cảm.",
  CHAT_MENTION_INVALID: "Bạn chỉ có thể nhắc tên người có thể xem cuộc trò chuyện này.",
  CHAT_CLIENT_ID_CONFLICT: "Không gửi được tin nhắn. Vui lòng thử lại.",
  CHAT_MESSAGE_CREATE_FAILED: "Không gửi được tin nhắn. Vui lòng thử lại.",
  CHAT_DM_INVALID: "Chọn từ 1 đến 8 người để bắt đầu trò chuyện.",
  CHAT_DM_IMMUTABLE:
    "Không thể thay đổi cuộc trò chuyện trực tiếp. Hãy bắt đầu cuộc trò chuyện mới với những người bạn muốn.",
  CHAT_DM_CREATE_FAILED: "Không mở được cuộc trò chuyện. Vui lòng thử lại.",
  CHAT_DM_GROUP_FORBIDDEN: "Bạn chỉ nhắn được 1:1; tạo nhóm cần quyền tạo kênh.",
  CHAT_DM_NOT_COLLEAGUE: "Bạn chỉ nhắn tin 1:1 được với đồng nghiệp cùng phòng ban.",
  CHAT_MEMBER_INVALID: "Mọi người được chọn phải là thành viên đang hoạt động của tổ chức.",
  CHAT_ATTACHMENT_TYPE_BLOCKED: "Loại tệp này không được phép tải lên.",
  CHAT_ATTACHMENT_TOO_LARGE: "Tệp vượt quá dung lượng cho phép (50 MB).",
  CHAT_ATTACHMENT_EMPTY: "Tệp rỗng, không thể gửi.",
  CHAT_ATTACHMENT_NOT_UPLOADED: "Tệp chưa tải lên xong. Vui lòng thử lại.",
  CHAT_ATTACHMENT_INVALID: "Một số tệp đính kèm chưa sẵn sàng hoặc không dùng được ở đây.",
  CHAT_ATTACHMENT_NOT_FOUND: "Không tìm thấy tệp đính kèm.",
  CHAT_ATTACHMENT_SENT: "Tệp đã được gửi; hãy xóa tin nhắn nếu muốn gỡ tệp.",
  CHANNEL_NOT_FOUND: "Không tìm thấy kênh hoặc bạn không còn quyền truy cập.",
  CHANNEL_NAME_TAKEN: "Tên kênh đã được sử dụng. Hãy chọn tên khác.",
  CHANNEL_MEMBERSHIP_REQUIRED: "Bạn cần tham gia kênh để thực hiện thao tác này.",
  CHANNEL_SUBMIT_REQUIRED: "Bạn chỉ có quyền xem trong kênh này.",
  CHANNEL_ARCHIVED: "Kênh đã được lưu trữ và chỉ có thể xem.",
  CHANNEL_NOT_JOINABLE: "Chỉ có thể tự tham gia kênh công khai. Hãy nhờ quản trị kênh thêm bạn.",
  CHANNEL_ADMIN_REQUIRED:
    "Kênh cần ít nhất một quản trị viên. Hãy chỉ định người khác làm quản trị trước khi rời.",
  CHANNEL_ADMIN_REQUIRES_SUBMIT: "Quản trị viên kênh luôn có quyền gửi tin.",
  CHANNEL_MEMBER_NOT_FOUND: "Không tìm thấy thành viên kênh.",
  CHANNEL_NOT_MEMBER: "Bạn không phải thành viên của kênh này.",
  CHANNEL_CREATE_FAILED: "Không tạo được kênh. Vui lòng thử lại.",
  // PD-053 / PD-054: every channel belongs to one department (the one selected in the switcher).
  CHANNEL_DEPARTMENT_REQUIRED: "Kênh cần thuộc một phòng ban. Chọn phòng ban trên thanh trên cùng rồi thử lại.",
  DEPARTMENT_FORBIDDEN: "Bạn không thuộc phòng ban này.",
  INVALID_RICH_TEXT: "Nội dung tin nhắn không hợp lệ hoặc quá dài.",
  INVALID_CURSOR: "Danh sách đã thay đổi. Hãy tải lại."
};

export const chatErrorMessage = (error: unknown, fallback?: string) => {
  if (isApiError(error)) {
    const message = chatMessages[error.code];
    if (message) {
      return message;
    }
  }
  return getErrorMessage(error, fallback);
};

export const isRateLimited = (error: unknown) =>
  isApiError(error) && (error.code === "CHAT_RATE_LIMITED" || error.status === 429);

/** The caller lost access to the channel (removed, private, deleted). */
export const isChannelGone = (error: unknown) =>
  isApiError(error) &&
  (error.status === 404 ||
    error.code === "CHANNEL_NOT_FOUND" ||
    error.code === "CHANNEL_MEMBERSHIP_REQUIRED");

/**
 * Is a failed upload worth "Tải lại" (WK-51)? Network / server / storage hiccups are; a file the API
 * rejected (blocked type, too large, empty, no permission) fails the same way every time.
 */
export const isRetryableUploadError = (error: unknown) => {
  if (!isApiError(error)) return true; // storage PUT failures and other transport errors
  if (error.status === 0 || error.status >= 500 || error.status === 429) return true;
  return error.code === "CHAT_ATTACHMENT_NOT_UPLOADED";
};
