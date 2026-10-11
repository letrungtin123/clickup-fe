import { getErrorMessage, isApiError } from "@/lib/api/errors";

/** Knowledge-domain error copy (codes from BE modules/knowledge). Falls back to the shared mapping. */
const knowledgeMessages: Record<string, string> = {
  KNOWLEDGE_VERSION_CONFLICT: "Có người vừa lưu phiên bản mới hơn của mục này.",
  KNOWLEDGE_REASON_REQUIRED: "Mục Rất quan trọng: hãy ghi lý do (ít nhất 3 ký tự).",
  KNOWLEDGE_SPACE_NOT_FOUND: "Không tìm thấy kho tri thức hoặc bạn không còn quyền truy cập.",
  KNOWLEDGE_SPACE_ARCHIVED: "Kho đã được lưu trữ, chỉ xem được.",
  KNOWLEDGE_ITEM_NOT_FOUND: "Không tìm thấy mục hoặc bạn không còn quyền xem.",
  KNOWLEDGE_ITEM_DELETED: "Mục này đang ở thùng rác.",
  KNOWLEDGE_MANAGER_REQUIRED: "Kho cần ít nhất một Quản lý.",
  KNOWLEDGE_MEMBER_NOT_FOUND: "Không tìm thấy thành viên kho.",
  KNOWLEDGE_MEMBER_EXISTS: "Người này đã là thành viên kho.",
  KNOWLEDGE_STATUS_NOT_FOUND: "Trạng thái này không còn trong kho. Hãy tải lại.",
  KNOWLEDGE_STATUS_NOT_ALLOWED: "Bạn không thể chuyển mục sang trạng thái này (kho đang bật bước duyệt).",
  KNOWLEDGE_STATUS_GROUP_REQUIRED: "Mỗi nhóm (Bản nháp, Đang áp dụng, Hết hiệu lực) cần ít nhất một trạng thái.",
  KNOWLEDGE_STATUS_REASSIGN_REQUIRED: "Chọn nơi chuyển các mục của trạng thái bị xoá.",
  KNOWLEDGE_STATUS_DUPLICATE_NAME: "Tên trạng thái không được trùng nhau.",
  KNOWLEDGE_CATEGORY_NOT_FOUND: "Chuyên mục không còn tồn tại. Hãy tải lại.",
  KNOWLEDGE_CATEGORY_DEPTH: "Chuyên mục chỉ có tối đa 2 cấp.",
  KNOWLEDGE_CATEGORY_NOT_EMPTY: "Chuyên mục còn mục hoặc chuyên mục con. Chuyển chúng đi trước khi xoá.",
  KNOWLEDGE_TAG_LIMIT: "Mỗi mục có tối đa 10 tag.",
  KNOWLEDGE_ATTACHMENT_LIMIT: "Mỗi mục có tối đa 30 tệp đính kèm.",
  KNOWLEDGE_COMMENT_NOT_FOUND: "Bình luận không còn tồn tại.",
  KNOWLEDGE_VERSION_NOT_FOUND: "Không tìm thấy phiên bản này.",
  KNOWLEDGE_PURGE_FORBIDDEN: "Chỉ Quản lý kho có quyền xoá tri thức mới xoá vĩnh viễn được.",
  KNOWLEDGE_EXPECTED_VERSION_REQUIRED: "Thiếu số phiên bản đang sửa. Tải lại trang rồi thử lại.",
  KNOWLEDGE_ITEM_NOT_IN_TRASH: "Mục này không còn trong thùng rác.",
  KNOWLEDGE_OWNER_INVALID: "Người phụ trách phải là người xem được kho này.",
  KNOWLEDGE_SPACE_EXISTS: "Đã có kho trùng tên. Hãy chọn tên khác.",
  KNOWLEDGE_SPACE_CREATE_FAILED: "Không tạo được kho tri thức. Vui lòng thử lại.",
  KNOWLEDGE_STATUS_DUPLICATE: "Một trạng thái xuất hiện hai lần. Tải lại rồi thử lại.",
  KNOWLEDGE_STATUS_REASSIGN_INVALID: "Trạng thái nhận các mục phải là một trạng thái được giữ lại.",
  KNOWLEDGE_STATUS_LIMIT: "Mỗi kho có từ 3 đến 12 trạng thái.",
  KNOWLEDGE_STATUS_GROUPS_REQUIRED: "Mỗi nhóm (Bản nháp, Đang áp dụng, Hết hiệu lực) cần ít nhất một trạng thái.",
  KNOWLEDGE_VERSION_CURRENT: "Đây đã là phiên bản hiện tại.",
  KNOWLEDGE_COMMENT_NOT_ROOT: "Chỉ bình luận gốc mới đánh dấu Đã xử lý được.",
  KNOWLEDGE_CATEGORY_EXISTS: "Đã có chuyên mục trùng tên ở cấp này.",
  KNOWLEDGE_APPROVAL_REQUIRED: "Kho đang bật bước duyệt: chỉ Quản lý kho mới chuyển được mục sang trạng thái Đang áp dụng (ban hành) hoặc Hết hiệu lực.",
  KNOWLEDGE_MEMBER_SAVE_FAILED: "Không lưu được thành viên. Vui lòng thử lại.",
  COMMENT_EMPTY: "Bình luận đang trống.",
  COMMENT_REPLY_DEPTH: "Chỉ trả lời được bình luận gốc.",
  COMMENT_HAS_OTHER_REPLIES: "Bình luận có trả lời của người khác; chỉ Quản lý kho mới xoá được cả chuỗi.",
  ATTACHMENT_NOT_UPLOADED: "Tệp chưa tải lên xong. Thử lại.",
  // 429s (KB-SEC-02/03): too many uploads in a minute, or too many files left unsent in comments.
  ATTACHMENT_RATE_LIMITED: "Bạn đang tải lên quá nhiều tệp, hoặc còn nhiều tệp chưa gửi kèm bình luận. Gửi hoặc xoá bớt rồi thử lại sau một phút.",
  KNOWLEDGE_RATE_LIMITED: "Bạn đang bình luận quá nhanh. Thử lại sau một phút.",
  KNOWLEDGE_PUBLISHED_LOCKED: "Kho này bật bước duyệt: mục đã ban hành hoặc hết hiệu lực chỉ Quản lý kho mới sửa, xoá hoặc khôi phục được. Hãy bình luận góp ý.",
  KNOWLEDGE_IMAGE_INVALID: "Ảnh trong nội dung phải là ảnh đã tải lên cho chính mục này (PNG, JPEG, GIF, WebP hoặc AVIF).",
  INVALID_RICH_TEXT: "Nội dung không hợp lệ hoặc quá dài (tối đa 20 bảng, 60 hàng và 12 cột mỗi bảng, 100 ảnh).",
  ATTACHMENT_TYPE_BLOCKED: "Loại tệp này không được phép tải lên.",
  ATTACHMENT_TOO_LARGE: "Tệp vượt quá giới hạn 50 MB.",
  ATTACHMENT_TYPE_MISMATCH: "Loại tệp không khớp khi tải lên. Thử lại.",
  ATTACHMENT_NOT_FOUND: "Tệp đính kèm không còn tồn tại.",
  INVALID_CURSOR: "Danh sách đã thay đổi. Hãy tải lại."
};

export const knowledgeErrorMessage = (error: unknown, fallback?: string) =>
  (isApiError(error) ? knowledgeMessages[error.code] : undefined) ?? getErrorMessage(error, fallback);

export const isVersionConflict = (error: unknown) =>
  isApiError(error) && error.status === 409 && error.code === "KNOWLEDGE_VERSION_CONFLICT";

export const isReasonRequired = (error: unknown) =>
  isApiError(error) && error.code === "KNOWLEDGE_REASON_REQUIRED";
